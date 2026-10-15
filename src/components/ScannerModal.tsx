import React, { useEffect, useRef, useState } from "react";
import { startQrScanner } from "../lib/qr/scan.ts";

interface ScannerModalProps {
  onScan: (scannedText: string) => void;
  onClose: () => void;
  promptText?: string;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  onScan,
  onClose,
  promptText = "Point camera at QR code",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (showManual || !videoRef.current) return;

    const controls = startQrScanner(
      videoRef.current,
      (text) => {
        onScan(text);
      },
      (err) => {
        setErrorMsg(err.message || "Could not access camera");
      }
    );

    return () => {
      controls.stop();
    };
  }, [showManual, onScan]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualText.trim()) {
      onScan(manualText.trim());
    }
  };

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true">
      <div className="scanner-header">
        <span className="brand">{promptText}</span>
        <button type="button" className="btn-secondary" onClick={onClose} style={{ height: "32px", padding: "0 12px" }}>
          Close
        </button>
      </div>

      {!showManual ? (
        <>
          <div className="scanner-video-container">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="scanner-target" />
          </div>

          {errorMsg ? (
            <p className="tagline" style={{ textAlign: "center", color: "#a1a1a1", maxWidth: "340px" }}>
              {errorMsg}
            </p>
          ) : (
            <p className="tagline" style={{ textAlign: "center", color: "#a1a1a1" }}>
              Hold device steady over QR code
            </p>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowManual(true)}
            style={{ width: "100%", maxWidth: "360px" }}
          >
            Paste code manually
          </button>
        </>
      ) : (
        <form onSubmit={handleManualSubmit} style={{ width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <label className="brand" htmlFor="manual-code-input">
            Paste connection code or URL
          </label>
          <textarea
            id="manual-code-input"
            className="code-area"
            rows={5}
            placeholder="Paste code or URL here..."
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            autoFocus
          />
          <div className="btn-row">
            <button type="submit" className="btn-primary" disabled={!manualText.trim()}>
              Submit code
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowManual(false)}>
              Use camera
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
