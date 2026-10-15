import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { minifySdp, expandSdp } from "./sdp/codec.ts";
import { parseHandshakePayload } from "./qr/scan.ts";
import { parseSdp } from "./sdp/parser.ts";
import { generateSafetyCode } from "./safety.ts";
import { FileReceiver, FileSender, type IDataChannel, type QueuedFile } from "./protocol/transfer.ts";
import { IncrementalSha256 } from "./sha256.ts";
import { ConnectionStateMachine } from "./state/machine.ts";

class DirectDataChannel implements IDataChannel {
  public readyState: string = "open";
  public bufferedAmount: number = 0;
  public bufferedAmountLowThreshold: number = 0;
  public binaryType: string = "arraybuffer";
  public remote?: DirectDataChannel;
  private listeners: Map<string, Set<(ev: any) => void>> = new Map();

  public addEventListener(type: string, listener: (ev: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  public removeEventListener(type: string, listener: (ev: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  public send(data: string | ArrayBuffer | ArrayBufferView): void {
    const payload =
      data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
    queueMicrotask(() => {
      const set = this.remote?.listeners.get("message");
      if (set) {
        for (const fn of set) fn({ data: payload });
      }
    });
  }
}

describe("End-to-End Handshake and File Transfer Flow", () => {
  it("completes full handshake, safety code verification, and multi-file transfer", async () => {
    const senderSm = new ConnectionStateMachine("sender");
    const receiverSm = new ConnectionStateMachine("receiver");

    // 1. Sender starts offering
    senderSm.transition("offering");
    const rawOffer = readFileSync(join(__dirname, "sdp/__fixtures__/chrome-offer.sdp"), "utf-8");
    const minOffer = minifySdp(rawOffer, "offer");
    expect(minOffer.length).toBeLessThan(300);

    senderSm.transition("awaiting-answer", { offerCompressed: minOffer });
    const offerUrl = `https://gfxroy.github.io/qrtc/#o=${minOffer}`;

    // 2. Receiver scans QR / opens URL
    const scanned = parseHandshakePayload(offerUrl);
    expect(scanned.type).toBe("offer");
    receiverSm.transition("connecting");

    const expandedOffer = expandSdp(scanned.blob);
    const offerFp = parseSdp(expandedOffer, "offer").fingerprint;

    // 3. Receiver creates answer
    const rawAnswer = readFileSync(join(__dirname, "sdp/__fixtures__/chrome-answer.sdp"), "utf-8");
    const minAnswer = minifySdp(rawAnswer, "answer");
    expect(minAnswer.length).toBeLessThan(300);

    const answerFp = parseSdp(expandSdp(minAnswer), "answer").fingerprint;
    const receiverSafetyCode = generateSafetyCode(offerFp, answerFp);
    receiverSm.transition("awaiting-answer", {
      answerCompressed: minAnswer,
      safetyCode: receiverSafetyCode,
    });

    // 4. Sender receives answer
    senderSm.transition("connecting", { answerCompressed: minAnswer });
    const senderSafetyCode = generateSafetyCode(offerFp, answerFp);
    expect(senderSafetyCode).toBe(receiverSafetyCode);

    senderSm.transition("connected", { safetyCode: senderSafetyCode });
    receiverSm.transition("connected");

    // 5. Transfer files across DataChannel
    const chSender = new DirectDataChannel();
    const chReceiver = new DirectDataChannel();
    chSender.remote = chReceiver;
    chReceiver.remote = chSender;

    senderSm.transition("transferring");
    receiverSm.transition("transferring");

    const file1Bytes = new Uint8Array(128 * 1024).fill(7); // 128 KB
    const file2Bytes = new TextEncoder().encode("Hello world direct P2P transfer!");

    const testFiles: QueuedFile[] = [
      { id: "1", name: "large.bin", size: file1Bytes.length, mime: "application/octet-stream", source: file1Bytes },
      { id: "2", name: "hello.txt", size: file2Bytes.length, mime: "text/plain", source: file2Bytes },
    ];

    const sender = new FileSender(chSender, testFiles);
    const receiver = new FileReceiver(chReceiver);

    const received: Array<{ name: string; sha256: string }> = [];
    receiver.onFileReceived = (f) => {
      received.push({ name: f.name, sha256: f.sha256 });
    };

    const donePromise = new Promise<void>((resolve) => {
      receiver.onAllReceived = () => {
        receiverSm.transition("done");
        resolve();
      };
    });

    sender.onAllComplete = () => {
      senderSm.transition("done");
    };

    await sender.start();
    await donePromise;

    expect(senderSm.state).toBe("done");
    expect(receiverSm.state).toBe("done");
    expect(received).toHaveLength(2);
    expect(received[0].name).toBe("large.bin");
    expect(received[0].sha256).toBe(IncrementalSha256.hash(file1Bytes));
    expect(received[1].name).toBe("hello.txt");
    expect(received[1].sha256).toBe(IncrementalSha256.hash(file2Bytes));
  });
});
