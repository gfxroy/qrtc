import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "./lib/protocol/progress.ts";
import { parseHandshakePayload } from "./lib/qr/scan.ts";
import { ConnectionStateMachine, type StateError } from "./lib/state/machine.ts";
import { ReceiverSession, SenderSession } from "./lib/webrtc/peer.ts";
import { FileReceiver, FileSender, type QueuedFile, type ReceivedFile, type TransferProgress } from "./lib/protocol/transfer.ts";
import { QrCard } from "./components/QrCard.tsx";
import { ScannerModal } from "./components/ScannerModal.tsx";
import { TransferView } from "./components/TransferView.tsx";

export const App: React.FC = () => {
  const [role, setRole] = useState<"sender" | "receiver" | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<StateError | null>(null);

  // Sender state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [offerCompressed, setOfferCompressed] = useState<string>("");
  const [offerUrl, setOfferUrl] = useState<string>("");
  const [manualAnswer, setManualAnswer] = useState<string>("");
  const [showAnswerScanner, setShowAnswerScanner] = useState<boolean>(false);

  // Receiver state
  const [answerCompressed, setAnswerCompressed] = useState<string>("");
  const [manualOffer, setManualOffer] = useState<string>("");
  const [showOfferScanner, setShowOfferScanner] = useState<boolean>(false);

  // Transfer state
  const [safetyCode, setSafetyCode] = useState<string>("");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

  // Refs for active sessions
  const smRef = useRef<ConnectionStateMachine>(new ConnectionStateMachine());
  const senderSessionRef = useRef<SenderSession | null>(null);
  const receiverSessionRef = useRef<ReceiverSession | null>(null);
  const fileSenderRef = useRef<FileSender | null>(null);
  const fileReceiverRef = useRef<FileReceiver | null>(null);
  const dropzoneRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Subscribe to state machine transitions
  useEffect(() => {
    const unsubscribe = smRef.current.subscribe((currState, _prev, ctx) => {
      setStatus(currState);
      setError(ctx.error);
      if (ctx.safetyCode) setSafetyCode(ctx.safetyCode);
    });
    return unsubscribe;
  }, []);

  const startReceiverFlow = useCallback(async (compressedOffer: string) => {
    try {
      setRole("receiver");
      smRef.current.setRole("receiver");
      smRef.current.transition("connecting");

      const session = new ReceiverSession();
      receiverSessionRef.current = session;

      const compressedAnswer = await session.createAnswer(compressedOffer);
      setAnswerCompressed(compressedAnswer);
      setSafetyCode(session.safetyCode);

      smRef.current.transition("awaiting-answer", {
        answerCompressed: compressedAnswer,
        safetyCode: session.safetyCode,
      });

      // Wait for data channel connection
      const dc = await session.waitForConnection();
      smRef.current.transition("connected", { safetyCode: session.safetyCode });

      // Initialize receiver protocol handler
      const receiver = new FileReceiver(dc);
      fileReceiverRef.current = receiver;

      receiver.onProgress = (p) => {
        setProgress(p);
      };

      receiver.onFileReceived = (received) => {
        setReceivedFiles((prev) => [...prev, received]);
        // Trigger automatic browser download
        if (received.blob) {
          const downloadUrl = URL.createObjectURL(received.blob);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = received.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      };

      receiver.onAllReceived = () => {
        smRef.current.transition("done");
      };

      receiver.onError = (err) => {
        if (err.message.includes("checksum")) {
          smRef.current.fail("checksum-mismatch", err.message);
        } else {
          smRef.current.fail("generic", err.message);
        }
      };

      smRef.current.transition("transferring");
    } catch (err: any) {
      console.error("Receiver handshake failed", err);
      if (err.message === "NAT_FAILED") {
        smRef.current.fail("symmetric-nat");
      } else {
        smRef.current.fail("invalid-sdp", err.message);
      }
    }
  }, []);

  // Check URL hash for offer payload on mount
  useEffect(() => {
    const processHash = () => {
      const hash = window.location.hash;
      if (!hash) return;
      const parsed = parseHandshakePayload(window.location.href);
      if (parsed.type === "offer" && parsed.blob) {
        startReceiverFlow(parsed.blob);
      }
    };

    processHash();
    window.addEventListener("hashchange", processHash);
    return () => window.removeEventListener("hashchange", processHash);
  }, [startReceiverFlow]);

  const resetAll = () => {
    senderSessionRef.current?.close();
    senderSessionRef.current = null;
    receiverSessionRef.current?.close();
    receiverSessionRef.current = null;
    fileSenderRef.current = null;
    fileReceiverRef.current = null;

    smRef.current.reset();
    setRole(null);
    setStatus("idle");
    setError(null);
    setSelectedFiles([]);
    setOfferCompressed("");
    setOfferUrl("");
    setManualAnswer("");
    setShowAnswerScanner(false);
    setAnswerCompressed("");
    setManualOffer("");
    setShowOfferScanner(false);
    setSafetyCode("");
    setProgress(null);
    setReceivedFiles([]);

    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  };

  // --- Sender Logic ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const createSenderTransfer = async () => {
    if (selectedFiles.length === 0) return;
    try {
      smRef.current.setRole("sender");
      smRef.current.transition("offering");

      const session = new SenderSession();
      senderSessionRef.current = session;

      const compressedOffer = await session.createOffer();
      setOfferCompressed(compressedOffer);

      const base = window.location.origin + window.location.pathname;
      const link = `${base}#o=${compressedOffer}`;
      setOfferUrl(link);

      smRef.current.transition("awaiting-answer", { offerCompressed: compressedOffer });
    } catch (err: any) {
      console.error("Failed to create offer", err);
      smRef.current.fail(err.message === "NAT_FAILED" ? "symmetric-nat" : "generic", err.message);
    }
  };

  const handleApplyAnswer = async (rawAnswer: string) => {
    try {
      const parsed = parseHandshakePayload(rawAnswer);
      const answerBlob = parsed.blob;
      if (!answerBlob) throw new Error("Invalid answer string");

      setShowAnswerScanner(false);
      smRef.current.transition("connecting", { answerCompressed: answerBlob });

      const session = senderSessionRef.current;
      if (!session) throw new Error("Sender session not found");

      const code = await session.applyAnswer(answerBlob);
      setSafetyCode(code);

      const dc = await session.waitForConnection();
      smRef.current.transition("connected", { safetyCode: code });

      // Start file transfer
      const queuedFiles: QueuedFile[] = selectedFiles.map((file, idx) => ({
        id: `file-${idx}-${Date.now()}`,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        source: file,
      }));

      const sender = new FileSender(dc, queuedFiles);
      fileSenderRef.current = sender;

      sender.onProgress = (p) => {
        setProgress(p);
      };

      sender.onAllComplete = () => {
        smRef.current.transition("done");
      };

      sender.onError = (err) => {
        smRef.current.fail("generic", err.message);
      };

      smRef.current.transition("transferring");
      await sender.start();
    } catch (err: any) {
      console.error("Failed to apply answer", err);
      if (err.message === "NAT_FAILED") {
        smRef.current.fail("symmetric-nat");
      } else {
        smRef.current.fail("invalid-sdp", err.message);
      }
    }
  };

  // --- Receiver Logic ---


  const handleManualOfferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOffer.trim()) return;
    const parsed = parseHandshakePayload(manualOffer);
    if (parsed.blob) {
      startReceiverFlow(parsed.blob);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="brand">qrtc</span>
          {role && (
            <button type="button" className="brand" onClick={resetAll} style={{ textDecoration: "underline" }}>
              Reset
            </button>
          )}
        </div>
        <h1>Direct file transfer.</h1>
        <p className="tagline">
          Send a file between two devices directly. No server, no account — the handshake is a QR code.
        </p>
      </header>

      {/* Role Selection Screen */}
      {!role && status === "idle" && (
        <main className="home-options">
          <button
            type="button"
            className="role-button"
            onClick={() => {
              setRole("sender");
              smRef.current.setRole("sender");
            }}
          >
            <span className="role-title">Send</span>
            <span className="role-desc">Select files and generate a handshake QR code for the receiver to scan.</span>
          </button>

          <button
            type="button"
            className="role-button"
            onClick={() => {
              setRole("receiver");
              smRef.current.setRole("receiver");
            }}
          >
            <span className="role-title">Receive</span>
            <span className="role-desc">Scan a sender's handshake QR code with your camera or paste a link.</span>
          </button>
        </main>
      )}

      {/* Sender Flow */}
      {role === "sender" && (
        <main style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {status === "idle" && (
            <div className="card">
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Choose files to send</h2>
                <p className="tagline" style={{ marginTop: "4px" }}>
                  Files are streamed directly over a peer-to-peer WebRTC DataChannel.
                </p>
              </div>

              <div
                ref={dropzoneRef}
                className={`dropzone ${isDragging ? "active" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
                <span className="dropzone-title">Click to choose or drop files here</span>
                <span className="dropzone-sub">Any file format, no server size limits</span>
              </div>

              {selectedFiles.length > 0 && (
                <div className="file-list">
                  {selectedFiles.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="file-item">
                      <span className="file-name">{file.name}</span>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <span className="file-size">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="brand"
                          style={{ color: "var(--muted)" }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={selectedFiles.length === 0}
                  onClick={createSenderTransfer}
                >
                  Create transfer
                </button>
                <button type="button" className="btn-secondary" onClick={resetAll}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {status === "offering" && (
            <div className="card">
              <span className="brand">Preparing transfer</span>
              <p className="tagline">Gathering network candidates and generating offer...</p>
            </div>
          )}

          {status === "awaiting-answer" && (
            <>
              <QrCard
                title="1. Scan with receiver"
                subtitle="Open this camera QR code on the receiving phone or laptop"
                payload={offerCompressed}
                url={offerUrl}
              />

              <div className="card">
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600 }}>2. Complete the handshake</h3>
                  <p className="tagline" style={{ marginTop: "4px" }}>
                    Once the receiver scans this QR, it will show an answer code.
                  </p>
                </div>

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setShowAnswerScanner(true)}
                  >
                    Scan receiver answer QR
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                  <label className="brand" htmlFor="answer-code-input">
                    Or paste receiver answer code
                  </label>
                  <textarea
                    id="answer-code-input"
                    className="code-area"
                    placeholder="Paste receiver answer code here..."
                    value={manualAnswer}
                    onChange={(e) => setManualAnswer(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!manualAnswer.trim()}
                    onClick={() => handleApplyAnswer(manualAnswer)}
                  >
                    Apply answer code
                  </button>
                </div>
              </div>
            </>
          )}

          {status === "connecting" && (
            <div className="card">
              <span className="brand">Connecting</span>
              <p className="tagline">Performing WebRTC connectivity checks directly between devices...</p>
            </div>
          )}

          {(status === "connected" || status === "transferring" || status === "done") && (
            <TransferView
              role="sender"
              safetyCode={safetyCode}
              progress={progress}
              completedFiles={selectedFiles.map((f, i) => ({
                id: String(i),
                name: f.name,
                size: f.size,
                mime: f.type,
                sha256: "",
              }))}
              isDone={status === "done"}
            />
          )}

          {status === "done" && (
            <div className="btn-row">
              <button type="button" className="btn-primary" onClick={resetAll}>
                Send more files
              </button>
            </div>
          )}
        </main>
      )}

      {/* Receiver Flow */}
      {role === "receiver" && (
        <main style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {status === "idle" && (
            <div className="card">
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Receive a file</h2>
                <p className="tagline" style={{ marginTop: "4px" }}>
                  Scan the sender's offer QR code to establish a direct connection.
                </p>
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowOfferScanner(true)}
                >
                  Scan sender QR code
                </button>
              </div>

              <form onSubmit={handleManualOfferSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                <label className="brand" htmlFor="offer-code-input">
                  Or paste offer code or link
                </label>
                <textarea
                  id="offer-code-input"
                  className="code-area"
                  placeholder="https://gfxroy.github.io/qrtc/#o=... or raw code"
                  value={manualOffer}
                  onChange={(e) => setManualOffer(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn-secondary"
                  disabled={!manualOffer.trim()}
                >
                  Connect with offer
                </button>
              </form>
            </div>
          )}

          {status === "connecting" && !answerCompressed && (
            <div className="card">
              <span className="brand">Connecting</span>
              <p className="tagline">Generating answer and preparing peer connection...</p>
            </div>
          )}

          {status === "awaiting-answer" && answerCompressed && (
            <>
              <QrCard
                title="Show this answer to sender"
                subtitle="Have the sender scan this QR code or copy the code below"
                payload={answerCompressed}
              />
              <div className="card">
                <span className="brand">Waiting for sender</span>
                <p className="tagline">
                  Once the sender scans or pastes this answer, the data channel will connect automatically.
                </p>
              </div>
            </>
          )}

          {(status === "connected" || status === "transferring" || status === "done") && (
            <TransferView
              role="receiver"
              safetyCode={safetyCode}
              progress={progress}
              completedFiles={receivedFiles}
              isDone={status === "done"}
            />
          )}

          {status === "done" && (
            <div className="btn-row">
              <button type="button" className="btn-primary" onClick={resetAll}>
                Receive another file
              </button>
            </div>
          )}
        </main>
      )}

      {/* Error View */}
      {status === "failed" && error && (
        <div className="card error-card">
          <div>
            <h2 className="error-title">{error.message}</h2>
            {error.details && <p className="error-details" style={{ marginTop: "6px" }}>{error.details}</p>}
          </div>

          <div className="btn-row">
            <button type="button" className="btn-primary" onClick={resetAll}>
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Camera QR Scanner Modals */}
      {showAnswerScanner && (
        <ScannerModal
          promptText="Scan receiver answer QR"
          onScan={(text) => handleApplyAnswer(text)}
          onClose={() => setShowAnswerScanner(false)}
        />
      )}

      {showOfferScanner && (
        <ScannerModal
          promptText="Scan sender offer QR"
          onScan={(text) => {
            setShowOfferScanner(false);
            const parsed = parseHandshakePayload(text);
            if (parsed.blob) {
              startReceiverFlow(parsed.blob);
            }
          }}
          onClose={() => setShowOfferScanner(false)}
        />
      )}

      <footer>
        <span>No server · No accounts · Peer-to-peer</span>
        <a href="https://github.com/gfxroy/qrtc" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
};
