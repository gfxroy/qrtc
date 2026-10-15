import type { CompactCandidate, CompactSdp, SdpType, SetupRole, CandidateType, TransportProtocol, AddressType } from "./types.ts";

function detectAddressType(addr: string): AddressType {
  // IPv4: 4 decimal numbers separated by dots
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(addr)) {
    return 4;
  }
  // IPv6: contains colons
  if (addr.includes(":")) {
    return 6;
  }
  // Otherwise domain / mDNS name
  return "domain";
}

export function parseSdp(sdp: string, defaultType: SdpType = "offer"): CompactSdp {
  const lines = sdp.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let ufrag = "";
  let pwd = "";
  let fingerprint = "";
  let setup: SetupRole = defaultType === "offer" ? "actpass" : "active";
  let sctpPort = 5000;
  const candidates: CompactCandidate[] = [];

  for (const line of lines) {
    if (line.startsWith("a=ice-ufrag:")) {
      ufrag = line.substring("a=ice-ufrag:".length).trim();
    } else if (line.startsWith("a=ice-pwd:")) {
      pwd = line.substring("a=ice-pwd:".length).trim();
    } else if (line.startsWith("a=setup:")) {
      const role = line.substring("a=setup:".length).trim().toLowerCase();
      if (role === "actpass" || role === "active" || role === "passive") {
        setup = role as SetupRole;
      }
    } else if (line.startsWith("a=fingerprint:")) {
      const parts = line.substring("a=fingerprint:".length).trim().split(/\s+/);
      if (parts.length >= 2) {
        // parts[0] is hash algorithm (e.g. sha-256), parts[1] is hex string
        fingerprint = parts[1].replace(/[^a-fA-F0-9]/g, "").toLowerCase();
      }
    } else if (line.startsWith("a=sctp-port:")) {
      const port = parseInt(line.substring("a=sctp-port:".length).trim(), 10);
      if (!isNaN(port) && port > 0) sctpPort = port;
    } else if (line.startsWith("a=sctpmap:")) {
      // e.g. a=sctpmap:5000 webrtc-datachannel 1024
      const parts = line.substring("a=sctpmap:".length).trim().split(/\s+/);
      const port = parseInt(parts[0], 10);
      if (!isNaN(port) && port > 0) sctpPort = port;
    } else if (line.startsWith("a=candidate:")) {
      // RFC 5245: a=candidate:<foundation> <component> <transport> <priority> <connection-address> <port> typ <candidate-types> ...
      const body = line.substring("a=candidate:".length).trim();
      const tokens = body.split(/\s+/);
      if (tokens.length >= 8) {
        const transport = tokens[2].toLowerCase();
        if (transport !== "udp" && transport !== "tcp") continue;

        const ip = tokens[4];
        const port = parseInt(tokens[5], 10);
        const typIndex = tokens.indexOf("typ");
        if (typIndex === -1 || typIndex + 1 >= tokens.length) continue;
        const typ = tokens[typIndex + 1].toLowerCase();

        if ((typ === "host" || typ === "srflx") && !isNaN(port) && port > 0) {
          candidates.push({
            type: typ as CandidateType,
            protocol: transport as TransportProtocol,
            ip,
            port,
            addressType: detectAddressType(ip),
          });
        }
      }
    }
  }

  // Deduplicate identical candidates
  const seen = new Set<string>();
  const uniqueCandidates: CompactCandidate[] = [];
  for (const c of candidates) {
    const key = `${c.protocol}:${c.ip}:${c.port}:${c.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(c);
    }
  }

  const type: SdpType = setup === "actpass" ? "offer" : defaultType;

  return {
    type,
    setup,
    ufrag,
    pwd,
    fingerprint,
    sctpPort,
    candidates: uniqueCandidates,
  };
}
