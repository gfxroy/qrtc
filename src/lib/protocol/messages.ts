export interface ManifestItem {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface FileManifestMessage {
  type: "manifest";
  files: ManifestItem[];
}

export interface FileStartMessage {
  type: "file-start";
  id: string;
  name: string;
  size: number;
  mime: string;
  chunkSize: number;
  totalChunks: number;
}

export interface FileEndMessage {
  type: "file-end";
  id: string;
  sha256: string;
}

export interface FileAckMessage {
  type: "file-ack";
  id: string;
  status: "ok" | "error";
  error?: string;
}

export interface DoneMessage {
  type: "done";
}

export interface CancelMessage {
  type: "cancel";
  reason?: string;
}

export type ProtocolMessage =
  | FileManifestMessage
  | FileStartMessage
  | FileEndMessage
  | FileAckMessage
  | DoneMessage
  | CancelMessage;

export function serializeMessage(msg: ProtocolMessage): string {
  return JSON.stringify(msg);
}

export function parseMessage(data: string): ProtocolMessage | null {
  try {
    const obj = JSON.parse(data);
    if (obj && typeof obj.type === "string") {
      return obj as ProtocolMessage;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}
