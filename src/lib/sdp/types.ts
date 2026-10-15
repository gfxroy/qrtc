export type SdpType = "offer" | "answer";
export type SetupRole = "actpass" | "active" | "passive";
export type CandidateType = "host" | "srflx";
export type TransportProtocol = "udp" | "tcp";
export type AddressType = 4 | 6 | "domain";

export interface CompactCandidate {
  type: CandidateType;
  protocol: TransportProtocol;
  ip: string;
  port: number;
  addressType: AddressType;
}

export interface CompactSdp {
  type: SdpType;
  setup: SetupRole;
  ufrag: string;
  pwd: string;
  fingerprint: string; // 32 bytes hex, lowercase without colons
  sctpPort: number;
  candidates: CompactCandidate[];
}
