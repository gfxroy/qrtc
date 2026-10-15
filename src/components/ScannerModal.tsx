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
        <span className="scanner-title">{promptText}</span>
        <button
          type="button"
          className="btn-scanner-close"
          onClick={onClose}
          aria-label="Close scanner"
        >
          ✕
        </button>
      </div>

      {!showManual ? (
        <div className="scanner-center">
          <div className="scanner-video-container">
            <video ref={videoRef} autoPlay playsInline muted />

            {/* Frame overlay with corner brackets and animated scanning line */}
            <div className="scanner-frame-overlay">
              <span className="scanner-bracket corner-tl" />
              <span className="scanner-bracket corner-tr" />
              <span className="scanner-bracket corner-bl" />
              <span className="scanner-bracket corner-br" />
              <div className="scanner-scanning-line" />
            </div>
          </div>

          <p className="scanner-hint">
            {errorMsg ? errorMsg : "Align the QR code within the frame to connect automatically"}
          </p>

          <button
            type="button"
            className="btn-secondary scanner-manual-btn"
            onClick={() => setShowManual(true)}
          >
            Paste code instead
          </button>
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="scanner-manual-form">
          <label className="scanner-manual-label" htmlFor="manual-code-input">
            Paste connection code or link
          </label>
          <textarea
            id="manual-code-input"
            className="code-area"
            rows={5}
            placeholder="Paste raw handshake code or https://... link here"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            autoFocus
          />
          <div className="btn-row">
            <button type="submit" className="btn-primary" disabled={!manualText.trim()}>
              Connect
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowManual(false)}>
              Back to camera
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
