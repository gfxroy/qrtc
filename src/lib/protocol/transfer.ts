import { IncrementalSha256 } from "../sha256.ts";
import { chunkDataSource, DEFAULT_CHUNK_SIZE, getTotalChunks, type BinaryDataSource } from "./chunker.ts";
import {
  parseMessage,
  serializeMessage,
  type FileAckMessage,
  type FileEndMessage,
  type FileManifestMessage,
  type FileStartMessage,
  type ManifestItem,
  type ProtocolMessage,
} from "./messages.ts";
import { SpeedTracker } from "./progress.ts";

export interface IDataChannel {
  readyState: string;
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: string;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  addEventListener(type: string, listener: (ev: any) => void): void;
  removeEventListener(type: string, listener: (ev: any) => void): void;
  close?(): void;
}

export interface QueuedFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  source: BinaryDataSource;
  relativePath?: string;
}

export interface TransferProgress {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  fileBytesTransferred: number;
  fileTotalBytes: number;
  filePercent: number;
  overallBytesTransferred: number;
  overallTotalBytes: number;
  overallPercent: number;
  speed: number; // bytes/sec
  eta: number; // seconds
}

export interface ReceivedFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  sha256: string;
  blob?: Blob;
  data?: Uint8Array;
  relativePath?: string;
}

const BACKPRESSURE_THRESHOLD = 256 * 1024; // 256 KB

function waitForBufferedAmountLow(channel: IDataChannel, threshold: number = BACKPRESSURE_THRESHOLD): Promise<void> {
  if (channel.bufferedAmount <= threshold) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const onLow = () => {
      if (channel.bufferedAmount <= threshold) {
        cleanup();
        resolve();
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Data channel closed while waiting for buffer"));
    };

    const onError = (e: any) => {
      cleanup();
      reject(new Error(`Data channel error: ${e?.message ?? "unknown"}`));
    };

    const cleanup = () => {
      channel.removeEventListener("bufferedamountlow", onLow);
      channel.removeEventListener("close", onClose);
      channel.removeEventListener("error", onError);
    };

    channel.bufferedAmountLowThreshold = threshold;
    channel.addEventListener("bufferedamountlow", onLow);
    channel.addEventListener("close", onClose);
    channel.addEventListener("error", onError);
  });
}

export class FileSender {
  private channel: IDataChannel;
  private files: QueuedFile[];
  private overallTotalBytes: number;
  private overallBytesTransferred: number;
  private tracker: SpeedTracker;
  private aborted: boolean;

  public onProgress?: (p: TransferProgress) => void;
  public onFileComplete?: (file: QueuedFile, sha256: string) => void;
  public onAllComplete?: () => void;
  public onError?: (err: Error) => void;

  constructor(channel: IDataChannel, files: QueuedFile[]) {
    this.channel = channel;
    this.files = files;
    this.overallTotalBytes = files.reduce((acc, f) => acc + f.size, 0);
    this.overallBytesTransferred = 0;
    this.tracker = new SpeedTracker();
    this.aborted = false;
  }

  public abort(reason: string = "Transfer cancelled"): void {
    this.aborted = true;
    try {
      this.channel.send(serializeMessage({ type: "cancel", reason }));
    } catch {
      // Channel might already be closed
    }
  }

  public async start(): Promise<void> {
    try {
      this.channel.binaryType = "arraybuffer";

      // 1. Send manifest
      const manifest: FileManifestMessage = {
        type: "manifest",
        files: this.files.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mime: f.mime,
          relativePath: f.relativePath,
        })),
      };
      this.channel.send(serializeMessage(manifest));

      // 2. Send each file
      for (let i = 0; i < this.files.length; i++) {
        if (this.aborted) break;
        const file = this.files[i];
        await this.sendFile(file, i);
      }

      if (!this.aborted) {
        this.channel.send(serializeMessage({ type: "done" }));
        this.onAllComplete?.();
      }
    } catch (err: any) {
      if (!this.aborted) {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private async sendFile(file: QueuedFile, fileIndex: number): Promise<void> {
    const totalChunks = getTotalChunks(file.size, DEFAULT_CHUNK_SIZE);
    const startMsg: FileStartMessage = {
      type: "file-start",
      id: file.id,
      name: file.name,
      size: file.size,
      mime: file.mime,
      chunkSize: DEFAULT_CHUNK_SIZE,
      totalChunks,
      relativePath: file.relativePath,
    };
    this.channel.send(serializeMessage(startMsg));

    const sha = new IncrementalSha256();
    let fileBytesTransferred = 0;

    for await (const chunk of chunkDataSource(file.source, DEFAULT_CHUNK_SIZE)) {
      if (this.aborted) throw new Error("Transfer cancelled by user");

      // Check backpressure
      if (this.channel.bufferedAmount > BACKPRESSURE_THRESHOLD) {
        await waitForBufferedAmountLow(this.channel, BACKPRESSURE_THRESHOLD);
      }

      sha.update(chunk);
      this.channel.send(chunk);

      fileBytesTransferred += chunk.byteLength;
      this.overallBytesTransferred += chunk.byteLength;

      const { speed } = this.tracker.update(this.overallBytesTransferred);
      const remainingBytes = this.overallTotalBytes - this.overallBytesTransferred;
      const eta = this.tracker.calculateEta(remainingBytes);

      this.onProgress?.({
        fileIndex,
        totalFiles: this.files.length,
        fileName: file.name,
        fileBytesTransferred,
        fileTotalBytes: file.size,
        filePercent: file.size > 0 ? (fileBytesTransferred / file.size) * 100 : 100,
        overallBytesTransferred: this.overallBytesTransferred,
        overallTotalBytes: this.overallTotalBytes,
        overallPercent: this.overallTotalBytes > 0 ? (this.overallBytesTransferred / this.overallTotalBytes) * 100 : 100,
        speed,
        eta,
      });
    }

    const sha256 = sha.digestHex();
    const endMsg: FileEndMessage = {
      type: "file-end",
      id: file.id,
      sha256,
    };
    this.channel.send(serializeMessage(endMsg));

    // Wait for ack
    await this.waitForAck(file.id);
    this.onFileComplete?.(file, sha256);
  }

  private waitForAck(fileId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onMsg = (event: any) => {
        if (typeof event.data === "string") {
          const msg = parseMessage(event.data);
          if (msg && msg.type === "file-ack" && msg.id === fileId) {
            cleanup();
            if (msg.status === "ok") {
              resolve();
            } else {
              reject(new Error(msg.error || "File transfer rejected by receiver"));
            }
          } else if (msg && msg.type === "cancel") {
            cleanup();
            reject(new Error(`Transfer cancelled by remote peer: ${msg.reason || ""}`));
          }
        }
      };

      const onClose = () => {
        cleanup();
        reject(new Error("Channel closed waiting for file acknowledgement"));
      };

      const cleanup = () => {
        this.channel.removeEventListener("message", onMsg);
        this.channel.removeEventListener("close", onClose);
      };

      this.channel.addEventListener("message", onMsg);
      this.channel.addEventListener("close", onClose);
    });
  }
}

export class FileReceiver {
  private channel: IDataChannel;
  private manifest: ManifestItem[];
  private currentFile: FileStartMessage | null;
  private currentSha: IncrementalSha256 | null;
  private currentChunks: Uint8Array[];
  private currentFileBytes: number;
  private overallTotalBytes: number;
  private overallBytesTransferred: number;
  private currentFileIndex: number;
  private tracker: SpeedTracker;
  private activeWriter: any; // FileSystemWritableFileStream if available

  public onManifest?: (items: ManifestItem[]) => void;
  public onProgress?: (p: TransferProgress) => void;
  public onFileReceived?: (file: ReceivedFile) => void;
  public onAllReceived?: () => void;
  public onError?: (err: Error) => void;

  constructor(channel: IDataChannel) {
    this.channel = channel;
    this.manifest = [];
    this.currentFile = null;
    this.currentSha = null;
    this.currentChunks = [];
    this.currentFileBytes = 0;
    this.overallTotalBytes = 0;
    this.overallBytesTransferred = 0;
    this.currentFileIndex = 0;
    this.tracker = new SpeedTracker();
    this.activeWriter = null;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.channel.binaryType = "arraybuffer";
    this.channel.addEventListener("message", this.handleMessage.bind(this));
  }

  private async handleMessage(event: any): Promise<void> {
    try {
      if (typeof event.data === "string") {
        const msg = parseMessage(event.data);
        if (!msg) return;
        await this.handleControlMessage(msg);
      } else if (event.data instanceof ArrayBuffer) {
        await this.handleChunk(new Uint8Array(event.data));
      }
    } catch (err: any) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async handleControlMessage(msg: ProtocolMessage): Promise<void> {
    switch (msg.type) {
      case "manifest":
        this.manifest = msg.files;
        this.overallTotalBytes = msg.files.reduce((acc, f) => acc + f.size, 0);
        this.overallBytesTransferred = 0;
        this.currentFileIndex = 0;
        this.tracker.reset();
        this.onManifest?.(msg.files);
        break;

      case "file-start":
        this.currentFile = msg;
        this.currentSha = new IncrementalSha256();
        this.currentChunks = [];
        this.currentFileBytes = 0;
        break;

      case "file-end":
        await this.finalizeCurrentFile(msg);
        break;

      case "done":
        this.onAllReceived?.();
        break;

      case "cancel":
        this.onError?.(new Error(`Transfer cancelled by sender: ${msg.reason || ""}`));
        break;
    }
  }

  private async handleChunk(chunk: Uint8Array): Promise<void> {
    if (!this.currentFile || !this.currentSha) return;

    this.currentSha.update(chunk);
    this.currentFileBytes += chunk.byteLength;
    this.overallBytesTransferred += chunk.byteLength;

    if (this.activeWriter) {
      await this.activeWriter.write(chunk);
    } else {
      this.currentChunks.push(chunk);
    }

    const { speed } = this.tracker.update(this.overallBytesTransferred);
    const remainingBytes = this.overallTotalBytes - this.overallBytesTransferred;
    const eta = this.tracker.calculateEta(remainingBytes);

    this.onProgress?.({
      fileIndex: this.currentFileIndex,
      totalFiles: this.manifest.length || 1,
      fileName: this.currentFile.name,
      fileBytesTransferred: this.currentFileBytes,
      fileTotalBytes: this.currentFile.size,
      filePercent: this.currentFile.size > 0 ? (this.currentFileBytes / this.currentFile.size) * 100 : 100,
      overallBytesTransferred: this.overallBytesTransferred,
      overallTotalBytes: this.overallTotalBytes,
      overallPercent: this.overallTotalBytes > 0 ? (this.overallBytesTransferred / this.overallTotalBytes) * 100 : 100,
      speed,
      eta,
    });
  }

  private async finalizeCurrentFile(msg: FileEndMessage): Promise<void> {
    if (!this.currentFile || !this.currentSha) return;

    const computedSha = this.currentSha.digestHex();
    const matches = computedSha.toLowerCase() === msg.sha256.toLowerCase();

    if (!matches) {
      const ack: FileAckMessage = {
        type: "file-ack",
        id: msg.id,
        status: "error",
        error: `Checksum mismatch: expected ${msg.sha256}, got ${computedSha}`,
      };
      this.channel.send(serializeMessage(ack));
      throw new Error(`Integrity check failed for file "${this.currentFile.name}".`);
    }

    // Acknowledge success
    const ack: FileAckMessage = {
      type: "file-ack",
      id: msg.id,
      status: "ok",
    };
    this.channel.send(serializeMessage(ack));

    let received: ReceivedFile;
    if (this.activeWriter) {
      await this.activeWriter.close();
      this.activeWriter = null;
      received = {
        id: this.currentFile.id,
        name: this.currentFile.name,
        size: this.currentFile.size,
        mime: this.currentFile.mime,
        sha256: computedSha,
        relativePath: this.currentFile.relativePath,
      };
    } else {
      // Reconstruct buffer / blob
      let blob: Blob | undefined;
      let data: Uint8Array | undefined;
      if (typeof Blob !== "undefined") {
        blob = new Blob(this.currentChunks as any, { type: this.currentFile.mime || "application/octet-stream" });
      } else {
        // Node environment fallback
        const total = this.currentChunks.reduce((acc, c) => acc + c.byteLength, 0);
        data = new Uint8Array(total);
        let pos = 0;
        for (const c of this.currentChunks) {
          data.set(c, pos);
          pos += c.byteLength;
        }
      }

      received = {
        id: this.currentFile.id,
        name: this.currentFile.name,
        size: this.currentFile.size,
        mime: this.currentFile.mime,
        sha256: computedSha,
        relativePath: this.currentFile.relativePath,
        blob,
        data,
      };
    }

    this.onFileReceived?.(received);

    this.currentFile = null;
    this.currentSha = null;
    this.currentChunks = [];
    this.currentFileBytes = 0;
    this.currentFileIndex++;
  }
}
