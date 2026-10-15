import { describe, it, expect } from "vitest";
import { chunkDataSource, getTotalChunks } from "./chunker.ts";
import { FileReceiver, FileSender, type IDataChannel, type QueuedFile } from "./transfer.ts";
import { IncrementalSha256 } from "../sha256.ts";

class MockDataChannel implements IDataChannel {
  public readyState: string = "open";
  public bufferedAmount: number = 0;
  public bufferedAmountLowThreshold: number = 0;
  public binaryType: string = "arraybuffer";
  public peer?: MockDataChannel;
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

  public emit(type: string, ev: any): void {
    const set = this.listeners.get(type);
    if (set) {
      for (const fn of set) fn(ev);
    }
  }

  public send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (!this.peer) throw new Error("No peer attached");
    const payload = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
    queueMicrotask(() => {
      this.peer?.emit("message", { data: payload });
    });
  }

  public close(): void {
    this.readyState = "closed";
    this.emit("close", {});
    this.peer?.emit("close", {});
  }
}

function createMockPair(): [MockDataChannel, MockDataChannel] {
  const ch1 = new MockDataChannel();
  const ch2 = new MockDataChannel();
  ch1.peer = ch2;
  ch2.peer = ch1;
  return [ch1, ch2];
}

describe("Chunker", () => {
  it("chunks a 150 KB buffer into 64 KB, 64 KB, 22 KB slices", async () => {
    const size = 150 * 1024;
    const buf = new Uint8Array(size);
    for (let i = 0; i < size; i++) buf[i] = i & 0xff;

    expect(getTotalChunks(size, 64 * 1024)).toBe(3);

    const chunks: Uint8Array[] = [];
    for await (const chunk of chunkDataSource(buf, 64 * 1024)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0].byteLength).toBe(64 * 1024);
    expect(chunks[1].byteLength).toBe(64 * 1024);
    expect(chunks[2].byteLength).toBe(22 * 1024);
  });

  it("handles 0-byte file edge case", async () => {
    const buf = new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    for await (const chunk of chunkDataSource(buf)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0].byteLength).toBe(0);
  });
});

describe("Transfer Protocol", () => {
  it("transfers a multi-chunk file with verified streaming SHA-256", async () => {
    const [senderCh, receiverCh] = createMockPair();

    const dataSize = 130 * 1024; // 130 KB
    const data = new Uint8Array(dataSize);
    for (let i = 0; i < dataSize; i++) data[i] = (i * 17) & 0xff;
    const expectedSha = IncrementalSha256.hash(data);

    const file: QueuedFile = {
      id: "f1",
      name: "test.bin",
      size: dataSize,
      mime: "application/octet-stream",
      source: data,
    };

    const sender = new FileSender(senderCh, [file]);
    const receiver = new FileReceiver(receiverCh);

    const receivedPromise = new Promise<{ name: string; size: number; sha256: string }>((resolve) => {
      receiver.onFileReceived = (rf) => {
        resolve({ name: rf.name, size: rf.size, sha256: rf.sha256 });
      };
    });

    const allCompletePromise = new Promise<void>((resolve) => {
      sender.onAllComplete = () => resolve();
    });

    await sender.start();
    const result = await receivedPromise;
    await allCompletePromise;

    expect(result.name).toBe("test.bin");
    expect(result.size).toBe(dataSize);
    expect(result.sha256).toBe(expectedSha);
  });

  it("transfers multiple queued files sequentially", async () => {
    const [senderCh, receiverCh] = createMockPair();

    const f1Data = new Uint8Array([1, 2, 3, 4, 5]);
    const f2Data = new Uint8Array(80 * 1024).fill(99);
    const f3Data = new Uint8Array(0);

    const files: QueuedFile[] = [
      { id: "1", name: "tiny.txt", size: f1Data.length, mime: "text/plain", source: f1Data },
      { id: "2", name: "medium.dat", size: f2Data.length, mime: "application/octet-stream", source: f2Data },
      { id: "3", name: "empty.bin", size: 0, mime: "application/octet-stream", source: f3Data },
    ];

    const sender = new FileSender(senderCh, files);
    const receiver = new FileReceiver(receiverCh);

    const receivedFiles: string[] = [];
    receiver.onFileReceived = (rf) => {
      receivedFiles.push(rf.name);
    };

    let receiverAllDone = false;
    receiver.onAllReceived = () => {
      receiverAllDone = true;
    };

    await sender.start();
    expect(receivedFiles).toEqual(["tiny.txt", "medium.dat", "empty.bin"]);
    expect(receiverAllDone).toBe(true);
  });

  it("preserves relativePath across folder structure transfer", async () => {
    const [senderCh, receiverCh] = createMockPair();
    const data = new Uint8Array([10, 20, 30]);

    const files: QueuedFile[] = [
      {
        id: "f-nested",
        name: "document.pdf",
        relativePath: "projects/docs/document.pdf",
        size: data.length,
        mime: "application/pdf",
        source: data,
      },
    ];

    const sender = new FileSender(senderCh, files);
    const receiver = new FileReceiver(receiverCh);

    const received: string[] = [];
    receiver.onFileReceived = (rf) => {
      received.push(rf.relativePath || rf.name);
    };

    await sender.start();
    expect(received).toEqual(["projects/docs/document.pdf"]);
  });
});
