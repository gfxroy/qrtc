import type { CompactSdp } from "./types.ts";

export function formatFingerprint(fp: string): string {
  const clean = fp.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  const pairs: string[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    pairs.push(clean.substring(i, i + 2));
  }
  return pairs.join(":");
}

export function buildSdp(compact: CompactSdp, sessionId: string = "1234567890123456"): string {
  const lines: string[] = [];

  // SDP session description
  lines.push("v=0");
  lines.push(`o=- ${sessionId} 2 IN IP4 127.0.0.1`);
  lines.push("s=-");
  lines.push("t=0 0");
  lines.push("a=group:BUNDLE 0");
  lines.push("a=extmap-allow-mixed");
  lines.push("a=msid-semantic: WMS");

  // Media description for WebRTC DataChannel
  lines.push("m=application 9 UDP/DTLS/SCTP webrtc-datachannel");
  lines.push("c=IN IP4 0.0.0.0");

  // Reconstruct ICE candidate lines
  for (let i = 0; i < compact.candidates.length; i++) {
    const c = compact.candidates[i];
    const foundation = i + 1;
    const proto = c.protocol.toLowerCase();
    const priority = c.type === "host" ? 2122260223 - i * 65536 : 1686052607 - i * 65536;

    if (c.type === "host") {
      lines.push(`a=candidate:${foundation} 1 ${proto} ${priority} ${c.ip} ${c.port} typ host`);
    } else {
      lines.push(
        `a=candidate:${foundation} 1 ${proto} ${priority} ${c.ip} ${c.port} typ srflx raddr 0.0.0.0 rport 0`
      );
    }
  }

  lines.push(`a=ice-ufrag:${compact.ufrag}`);
  lines.push(`a=ice-pwd:${compact.pwd}`);
  lines.push("a=ice-options:trickle");
  lines.push(`a=fingerprint:sha-256 ${formatFingerprint(compact.fingerprint)}`);
  lines.push(`a=setup:${compact.setup}`);
  lines.push("a=mid:0");
  lines.push(`a=sctp-port:${compact.sctpPort}`);
  // Include sctpmap for maximum browser compatibility (e.g. older Firefox versions)
  lines.push(`a=sctpmap:${compact.sctpPort} webrtc-datachannel 1024`);
  lines.push("a=max-message-size:262144");

  return lines.join("\r\n") + "\r\n";
}
