import jsQR from "jsqr";
import { base64UrlToBytes } from "../sdp/codec.ts";
import { inflateSync } from "fflate";
import type { SdpType } from "../sdp/types.ts";

export interface ParsedHandshake {
  type: SdpType | "unknown";
  blob: string;
}

export function parseHandshakePayload(raw: string): ParsedHandshake {
  const trimmed = raw.trim();

  // Check URL hash/params
  const hashIndex = trimmed.indexOf("#");
  if (hashIndex !== -1) {
    const hash = trimmed.substring(hashIndex + 1);
    if (hash.startsWith("o=")) {
      return { type: "offer", blob: hash.substring(2) };
    }
    if (hash.startsWith("a=")) {
      return { type: "answer", blob: hash.substring(2) };
    }
  }

  // Check query params
  const qIndex = trimmed.indexOf("?");
  if (qIndex !== -1) {
    const query = trimmed.substring(qIndex + 1);
    const params = new URLSearchParams(query);
    const o = params.get("o");
    if (o) return { type: "offer", blob: o };
    const a = params.get("a");
    if (a) return { type: "answer", blob: a };
  }

  // Try raw blob inspection
  try {
    const bytes = base64UrlToBytes(trimmed);
    const decompressed = inflateSync(bytes);
    if (decompressed && decompressed.length >= 3) {
      const typeBit = decompressed[0] & 1;
      return {
        type: typeBit === 0 ? "offer" : "answer",
        blob: trimmed,
      };
    }
  } catch {
    // Not a raw compressed blob
  }

  return {
    type: "unknown",
    blob: trimmed,
  };
}

export interface ScannerControls {
  stop: () => void;
}

export function startQrScanner(
  videoElement: HTMLVideoElement,
  onScan: (result: string) => void,
  onError?: (err: Error) => void
): ScannerControls {
  let stream: MediaStream | null = null;
  let animationFrameId: number | null = null;
  let stopped = false;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const stop = () => {
    stopped = true;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    videoElement.srcObject = null;
  };

  async function init() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoElement.srcObject = stream;
      videoElement.setAttribute("playsinline", "true"); // required on iOS Safari
      await videoElement.play();

      // Check for BarcodeDetector API
      const hasBarcodeDetector =
        "BarcodeDetector" in window &&
        typeof (window as any).BarcodeDetector === "function";

      let barcodeDetector: any = null;
      if (hasBarcodeDetector) {
        try {
          barcodeDetector = new (window as any).BarcodeDetector({
            formats: ["qr_code"],
          });
        } catch {
          barcodeDetector = null;
        }
      }

      const scanLoop = async () => {
        if (stopped) return;

        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
          if (barcodeDetector) {
            try {
              const barcodes = await barcodeDetector.detect(videoElement);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                onScan(barcodes[0].rawValue);
                stop();
                return;
              }
            } catch {
              // Barcode detector frame failure, fallback to jsQR
            }
          }

          if (ctx) {
            const width = videoElement.videoWidth;
            const height = videoElement.videoHeight;
            if (width > 0 && height > 0) {
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(videoElement, 0, 0, width, height);
              const imageData = ctx.getImageData(0, 0, width, height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
              });
              if (code && code.data) {
                onScan(code.data);
                stop();
                return;
              }
            }
          }
        }

        if (!stopped) {
          animationFrameId = requestAnimationFrame(scanLoop);
        }
      };

      animationFrameId = requestAnimationFrame(scanLoop);
    } catch (err: any) {
      stop();
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  init();

  return { stop };
}
