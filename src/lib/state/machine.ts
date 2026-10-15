import type { TransferProgress, ReceivedFile } from "../protocol/transfer.ts";

export type ConnectionState =
  | "idle"
  | "offering"
  | "awaiting-answer"
  | "connecting"
  | "connected"
  | "transferring"
  | "done"
  | "failed";

export type UserRole = "sender" | "receiver";

export interface StateError {
  code:
    | "symmetric-nat"
    | "ice-timeout"
    | "connection-closed"
    | "checksum-mismatch"
    | "camera-permission"
    | "invalid-sdp"
    | "generic";
  message: string;
  details?: string;
}

export interface MachineContext {
  role: UserRole | null;
  state: ConnectionState;
  error: StateError | null;
  safetyCode: string | null;
  offerCompressed: string | null;
  answerCompressed: string | null;
  progress: TransferProgress | null;
  receivedFiles: ReceivedFile[];
}

export const ERROR_MESSAGES: Record<StateError["code"], { message: string; details: string }> = {
  "symmetric-nat": {
    message: "Direct peer-to-peer connection impossible",
    details:
      "Both devices appear to be behind restrictive symmetric NATs or corporate firewalls. Direct P2P requires a TURN relay server in this network topology. Try connecting both devices to the same Wi-Fi network or a phone hotspot.",
  },
  "ice-timeout": {
    message: "ICE gathering timed out",
    details: "Could not discover public network candidates via STUN within 3 seconds. Check your internet connection.",
  },
  "connection-closed": {
    message: "Connection closed prematurely",
    details: "The peer disconnected, navigated away, or the network link was severed.",
  },
  "checksum-mismatch": {
    message: "Data integrity verification failed",
    details: "The SHA-256 checksum of the received file did not match the sender's original hash.",
  },
  "camera-permission": {
    message: "Camera permission denied",
    details: "Could not access camera for QR scanning. You can paste the connection code manually.",
  },
  "invalid-sdp": {
    message: "Invalid handshake code",
    details: "The scanned or pasted code could not be parsed as a valid WebRTC session description.",
  },
  "generic": {
    message: "An unexpected error occurred",
    details: "The operation could not be completed.",
  },
};

export class ConnectionStateMachine {
  private ctx: MachineContext;
  private listeners: Set<(state: ConnectionState, prev: ConnectionState, ctx: MachineContext) => void>;

  // Allowed transitions table
  private static ALLOWED_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
    idle: ["offering", "connecting", "awaiting-answer", "failed"],
    offering: ["awaiting-answer", "failed", "idle"],
    "awaiting-answer": ["connecting", "connected", "failed", "idle"],
    connecting: ["connected", "awaiting-answer", "failed", "idle"],
    connected: ["transferring", "done", "failed", "idle"],
    transferring: ["done", "failed", "idle"],
    done: ["idle", "transferring"],
    failed: ["idle", "offering", "connecting"],
  };

  constructor(initialRole: UserRole | null = null) {
    this.ctx = {
      role: initialRole,
      state: "idle",
      error: null,
      safetyCode: null,
      offerCompressed: null,
      answerCompressed: null,
      progress: null,
      receivedFiles: [],
    };
    this.listeners = new Set();
  }

  public get context(): Readonly<MachineContext> {
    return this.ctx;
  }

  public get state(): ConnectionState {
    return this.ctx.state;
  }

  public subscribe(
    listener: (state: ConnectionState, prev: ConnectionState, ctx: MachineContext) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(prev: ConnectionState): void {
    for (const fn of this.listeners) {
      fn(this.ctx.state, prev, this.ctx);
    }
  }

  public setRole(role: UserRole): void {
    this.ctx.role = role;
  }

  public transition(target: ConnectionState, updates?: Partial<Omit<MachineContext, "state">>): void {
    const current = this.ctx.state;
    if (current === target) {
      if (updates) {
        Object.assign(this.ctx, updates);
        this.notify(current);
      }
      return;
    }

    const allowed = ConnectionStateMachine.ALLOWED_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new Error(`Invalid state transition: cannot transition from "${current}" to "${target}"`);
    }

    if (updates) {
      Object.assign(this.ctx, updates);
    }

    this.ctx.state = target;
    this.notify(current);
  }

  public fail(code: StateError["code"], customDetails?: string): void {
    const standard = ERROR_MESSAGES[code] || ERROR_MESSAGES.generic;
    const error: StateError = {
      code,
      message: standard.message,
      details: customDetails || standard.details,
    };
    this.transition("failed", { error });
  }

  public reset(): void {
    this.ctx = {
      role: null,
      state: "idle",
      error: null,
      safetyCode: null,
      offerCompressed: null,
      answerCompressed: null,
      progress: null,
      receivedFiles: [],
    };
    this.notify("failed");
  }
}
