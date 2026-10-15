import { minifySdp, expandSdp } from "../sdp/codec.ts";
import { parseSdp } from "../sdp/parser.ts";
import { generateSafetyCode } from "../safety.ts";

export interface WebRtcPeerOptions {
  stunUrl?: string;
  iceTimeoutMs?: number;
}

const DEFAULT_STUN = "stun:stun.l.google.com:19302";
const DEFAULT_ICE_TIMEOUT = 3000;

export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number = DEFAULT_ICE_TIMEOUT): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
    };

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    pc.addEventListener("icegatheringstatechange", check);
  });
}

export class SenderSession {
  public pc: RTCPeerConnection;
  public dc: RTCDataChannel;
  public localFingerprint: string = "";
  public remoteFingerprint: string = "";
  public safetyCode: string = "";
  private iceTimeoutMs: number;

  constructor(options?: WebRtcPeerOptions) {
    this.iceTimeoutMs = options?.iceTimeoutMs ?? DEFAULT_ICE_TIMEOUT;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: options?.stunUrl ?? DEFAULT_STUN }],
    });
    this.dc = this.pc.createDataChannel("qrtc", { ordered: true });
    this.dc.binaryType = "arraybuffer";
  }

  public async createOffer(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForIceGathering(this.pc, this.iceTimeoutMs);

    const fullSdp = this.pc.localDescription?.sdp || "";
    const parsed = parseSdp(fullSdp, "offer");
    this.localFingerprint = parsed.fingerprint;

    return minifySdp(fullSdp, "offer");
  }

  public async applyAnswer(compressedAnswer: string): Promise<string> {
    const expandedSdp = expandSdp(compressedAnswer);
    const parsed = parseSdp(expandedSdp, "answer");
    this.remoteFingerprint = parsed.fingerprint;

    await this.pc.setRemoteDescription({
      type: "answer",
      sdp: expandedSdp,
    });

    if (this.localFingerprint && this.remoteFingerprint) {
      this.safetyCode = generateSafetyCode(this.localFingerprint, this.remoteFingerprint);
    }

    return this.safetyCode;
  }

  public waitForConnection(): Promise<RTCDataChannel> {
    if (this.dc.readyState === "open") {
      return Promise.resolve(this.dc);
    }

    return new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve(this.dc);
      };

      const onError = (e: any) => {
        cleanup();
        reject(new Error(`DataChannel error: ${e?.message || "unknown"}`));
      };

      const onStateChange = () => {
        if (this.pc.connectionState === "failed" || this.pc.iceConnectionState === "failed") {
          cleanup();
          reject(new Error("NAT_FAILED"));
        }
      };

      const cleanup = () => {
        this.dc.removeEventListener("open", onOpen);
        this.dc.removeEventListener("error", onError);
        this.pc.removeEventListener("connectionstatechange", onStateChange);
        this.pc.removeEventListener("iceconnectionstatechange", onStateChange);
      };

      this.dc.addEventListener("open", onOpen);
      this.dc.addEventListener("error", onError);
      this.pc.addEventListener("connectionstatechange", onStateChange);
      this.pc.addEventListener("iceconnectionstatechange", onStateChange);
    });
  }

  public close(): void {
    try {
      this.dc.close();
      this.pc.close();
    } catch {
      // ignore
    }
  }
}

export class ReceiverSession {
  public pc: RTCPeerConnection;
  public dc: RTCDataChannel | null = null;
  public localFingerprint: string = "";
  public remoteFingerprint: string = "";
  public safetyCode: string = "";
  private iceTimeoutMs: number;

  constructor(options?: WebRtcPeerOptions) {
    this.iceTimeoutMs = options?.iceTimeoutMs ?? DEFAULT_ICE_TIMEOUT;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: options?.stunUrl ?? DEFAULT_STUN }],
    });
  }

  public async createAnswer(compressedOffer: string): Promise<string> {
    const expandedOffer = expandSdp(compressedOffer);
    const parsedOffer = parseSdp(expandedOffer, "offer");
    this.remoteFingerprint = parsedOffer.fingerprint;

    await this.pc.setRemoteDescription({
      type: "offer",
      sdp: expandedOffer,
    });

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIceGathering(this.pc, this.iceTimeoutMs);

    const fullSdp = this.pc.localDescription?.sdp || "";
    const parsedAnswer = parseSdp(fullSdp, "answer");
    this.localFingerprint = parsedAnswer.fingerprint;

    if (this.localFingerprint && this.remoteFingerprint) {
      this.safetyCode = generateSafetyCode(this.localFingerprint, this.remoteFingerprint);
    }

    return minifySdp(fullSdp, "answer");
  }

  public waitForConnection(): Promise<RTCDataChannel> {
    return new Promise((resolve, reject) => {
      const onChannel = (ev: RTCDataChannelEvent) => {
        this.dc = ev.channel;
        this.dc.binaryType = "arraybuffer";

        if (this.dc.readyState === "open") {
          cleanup();
          resolve(this.dc);
        } else {
          this.dc.addEventListener(
            "open",
            () => {
              cleanup();
              resolve(this.dc!);
            },
            { once: true }
          );
        }
      };

      const onStateChange = () => {
        if (this.pc.connectionState === "failed" || this.pc.iceConnectionState === "failed") {
          cleanup();
          reject(new Error("NAT_FAILED"));
        }
      };

      const cleanup = () => {
        this.pc.removeEventListener("datachannel", onChannel);
        this.pc.removeEventListener("connectionstatechange", onStateChange);
        this.pc.removeEventListener("iceconnectionstatechange", onStateChange);
      };

      this.pc.addEventListener("datachannel", onChannel);
      this.pc.addEventListener("connectionstatechange", onStateChange);
      this.pc.addEventListener("iceconnectionstatechange", onStateChange);
    });
  }

  public close(): void {
    try {
      this.dc?.close();
      this.pc.close();
    } catch {
      // ignore
    }
  }
}
