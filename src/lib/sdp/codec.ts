import { deflateSync, inflateSync } from "fflate";
import type { CompactCandidate, CompactSdp, SdpType, SetupRole, CandidateType, TransportProtocol } from "./types.ts";
import { parseSdp } from "./parser.ts";
import { buildSdp } from "./builder.ts";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

function ipv4ToBytes(ip: string): Uint8Array {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  return new Uint8Array(parts);
}

function bytesToIpv4(data: Uint8Array, offset: number): string {
  return `${data[offset]}.${data[offset + 1]}.${data[offset + 2]}.${data[offset + 3]}`;
}

function ipv6ToBytes(ip: string): Uint8Array {
  // Support standard and compressed IPv6
  const parts = ip.split("::");
  let left: string[];
  let right: string[];
  if (parts.length === 1) {
    left = parts[0].split(":");
    right = [];
  } else {
    left = parts[0] ? parts[0].split(":") : [];
    right = parts[1] ? parts[1].split(":") : [];
  }
  const missing = 8 - (left.length + right.length);
  const middle = new Array(missing).fill("0");
  const full = [...left, ...middle, ...right];

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const val = parseInt(full[i] || "0", 16);
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }
  return bytes;
}

function bytesToIpv6(data: Uint8Array, offset: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const val = (data[offset + i * 2] << 8) | data[offset + i * 2 + 1];
    parts.push(val.toString(16));
  }
  return parts.join(":");
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeCompactSdp(sdp: CompactSdp): Uint8Array {
  const textEncoder = new TextEncoder();
  const ufragBytes = textEncoder.encode(sdp.ufrag);
  const pwdBytes = textEncoder.encode(sdp.pwd);
  const fpBytes = hexToBytes(sdp.fingerprint);

  if (fpBytes.length !== 32) {
    throw new Error(`Invalid DTLS fingerprint length: expected 32 bytes, got ${fpBytes.length}`);
  }

  // Calculate dynamic buffer size
  let candSize = 0;
  for (const c of sdp.candidates) {
    candSize += 3; // flag + 2 port
    if (c.addressType === 4) candSize += 4;
    else if (c.addressType === 6) candSize += 16;
    else candSize += 1 + textEncoder.encode(c.ip).length;
  }

  const totalSize = 3 + 1 + ufragBytes.length + 1 + pwdBytes.length + 32 + 1 + candSize;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // Header byte 0: version (bits 3-7), setup (bits 1-2), type (bit 0)
  const typeBit = sdp.type === "offer" ? 0 : 1;
  const setupBits = sdp.setup === "actpass" ? 0 : sdp.setup === "active" ? 1 : 2;
  const versionBits = 1;
  buf[0] = (versionBits << 3) | (setupBits << 1) | typeBit;

  // Header bytes 1-2: SCTP port
  view.setUint16(1, sdp.sctpPort, false);

  let offset = 3;

  // Ufrag
  buf[offset++] = ufragBytes.length;
  buf.set(ufragBytes, offset);
  offset += ufragBytes.length;

  // Pwd
  buf[offset++] = pwdBytes.length;
  buf.set(pwdBytes, offset);
  offset += pwdBytes.length;

  // Fingerprint (32 bytes)
  buf.set(fpBytes, offset);
  offset += 32;

  // Candidate count
  buf[offset++] = sdp.candidates.length;

  for (const c of sdp.candidates) {
    const typeBit = c.type === "host" ? 0 : 1;
    const protoBit = c.protocol === "udp" ? 0 : 1;
    const addrTypeBits = c.addressType === 4 ? 0 : c.addressType === 6 ? 1 : 2;

    buf[offset++] = (addrTypeBits << 2) | (protoBit << 1) | typeBit;
    view.setUint16(offset, c.port, false);
    offset += 2;

    if (c.addressType === 4) {
      buf.set(ipv4ToBytes(c.ip), offset);
      offset += 4;
    } else if (c.addressType === 6) {
      buf.set(ipv6ToBytes(c.ip), offset);
      offset += 16;
    } else {
      const domainBytes = textEncoder.encode(c.ip);
      buf[offset++] = domainBytes.length;
      buf.set(domainBytes, offset);
      offset += domainBytes.length;
    }
  }

  return buf;
}

export function decodeCompactSdp(buf: Uint8Array): CompactSdp {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const textDecoder = new TextDecoder();

  const b0 = buf[0];
  const typeBit = b0 & 1;
  const setupBits = (b0 >> 1) & 3;

  const type: SdpType = typeBit === 0 ? "offer" : "answer";
  const setup: SetupRole = setupBits === 0 ? "actpass" : setupBits === 1 ? "active" : "passive";
  const sctpPort = view.getUint16(1, false);

  let offset = 3;

  // Ufrag
  const ufragLen = buf[offset++];
  const ufrag = textDecoder.decode(buf.subarray(offset, offset + ufragLen));
  offset += ufragLen;

  // Pwd
  const pwdLen = buf[offset++];
  const pwd = textDecoder.decode(buf.subarray(offset, offset + pwdLen));
  offset += pwdLen;

  // Fingerprint
  const fpBytes = buf.subarray(offset, offset + 32);
  const fingerprint = bytesToHex(fpBytes);
  offset += 32;

  // Candidates
  const candCount = buf[offset++];
  const candidates: CompactCandidate[] = [];

  for (let i = 0; i < candCount; i++) {
    const flags = buf[offset++];
    const cType: CandidateType = (flags & 1) === 0 ? "host" : "srflx";
    const proto: TransportProtocol = ((flags >> 1) & 1) === 0 ? "udp" : "tcp";
    const addrTypeBits = (flags >> 2) & 3;
    const port = view.getUint16(offset, false);
    offset += 2;

    let ip: string;
    if (addrTypeBits === 0) {
      ip = bytesToIpv4(buf, offset);
      offset += 4;
      candidates.push({ type: cType, protocol: proto, ip, port, addressType: 4 });
    } else if (addrTypeBits === 1) {
      ip = bytesToIpv6(buf, offset);
      offset += 16;
      candidates.push({ type: cType, protocol: proto, ip, port, addressType: 6 });
    } else {
      const dLen = buf[offset++];
      ip = textDecoder.decode(buf.subarray(offset, offset + dLen));
      offset += dLen;
      candidates.push({ type: cType, protocol: proto, ip, port, addressType: "domain" });
    }
  }

  return {
    type,
    setup,
    ufrag,
    pwd,
    fingerprint,
    sctpPort,
    candidates,
  };
}

export function minifySdp(fullSdp: string, type: SdpType = "offer"): string {
  const compact = parseSdp(fullSdp, type);
  const binary = encodeCompactSdp(compact);
  const compressed = deflateSync(binary, { level: 9 });
  return bytesToBase64Url(compressed);
}

export function expandSdp(compressedBase64Url: string, sessionId?: string): string {
  const compressed = base64UrlToBytes(compressedBase64Url);
  const binary = inflateSync(compressed);
  const compact = decodeCompactSdp(binary);
  return buildSdp(compact, sessionId);
}
