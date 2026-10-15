export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !isFinite(bytesPerSec)) return "0 B/s";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "0s";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export class SpeedTracker {
  private startTime: number;
  private lastTime: number;
  private lastBytes: number;
  private currentSpeed: number;

  constructor() {
    const now = Date.now();
    this.startTime = now;
    this.lastTime = now;
    this.lastBytes = 0;
    this.currentSpeed = 0;
  }

  public reset(): void {
    const now = Date.now();
    this.startTime = now;
    this.lastTime = now;
    this.lastBytes = 0;
    this.currentSpeed = 0;
  }

  public update(currentBytes: number): { speed: number; elapsed: number } {
    const now = Date.now();
    const timeDelta = (now - this.lastTime) / 1000;
    const elapsed = (now - this.startTime) / 1000;

    // Update speed estimate every 200ms
    if (timeDelta >= 0.2) {
      const bytesDelta = currentBytes - this.lastBytes;
      const instantSpeed = bytesDelta / timeDelta;

      // Exponential moving average (alpha = 0.3)
      if (this.currentSpeed === 0) {
        this.currentSpeed = instantSpeed;
      } else {
        this.currentSpeed = 0.3 * instantSpeed + 0.7 * this.currentSpeed;
      }

      this.lastTime = now;
      this.lastBytes = currentBytes;
    }

    return {
      speed: Math.max(0, this.currentSpeed),
      elapsed,
    };
  }

  public calculateEta(remainingBytes: number): number {
    if (this.currentSpeed <= 0) return 0;
    return remainingBytes / this.currentSpeed;
  }
}
