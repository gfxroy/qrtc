import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "./lib/protocol/progress.ts";
import { parseHandshakePayload } from "./lib/qr/scan.ts";
import { ConnectionStateMachine, type StateError } from "./lib/state/machine.ts";
import { ReceiverSession, SenderSession } from "./lib/webrtc/peer.ts";
import { FileReceiver, FileSender, type QueuedFile, type ReceivedFile, type TransferProgress } from "./lib/protocol/transfer.ts";
import { extractFilesFromDataTransfer, extractFilesFromInput, type DiscoveredFile } from "./lib/folder.ts";
import { createDemoImageFile, createTextSnippetFile } from "./lib/snippet.ts";
import { QrCard } from "./components/QrCard.tsx";
import { ScannerModal } from "./components/ScannerModal.tsx";
import { TransferView } from "./components/TransferView.tsx";
import { Stepper, type StepItem } from "./components/Stepper.tsx";
import { HelpPanel } from "./components/HelpPanel.tsx";

const SENDER_STEPS: StepItem[] = [
  { id: "select", label: "Choose", sublabel: "Files or text" },
  { id: "pair", label: "Pair", sublabel: "Scan the code" },
  { id: "transfer", label: "Send", sublabel: "On its way" },
  { id: "done", label: "Done", sublabel: "Checked" },
];

const RECEIVER_STEPS: StepItem[] = [
  { id: "scan", label: "Connect", sublabel: "Scan the code" },
  { id: "pair", label: "Answer", sublabel: "Show your code" },
  { id: "transfer", label: "Receive", sublabel: "On its way" },
  { id: "done", label: "Done", sublabel: "Checked" },
];

export const App: React.FC = () => {
  const [role, setRole] = useState<"sender" | "receiver" | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<StateError | null>(null);

  // Send mode: files vs text snippet
  const [sendMode, setSendMode] = useState<"files" | "text">("files");
  const [textSnippet, setTextSnippet] = useState<string>("");
  const [snippetTitle, setSnippetTitle] = useState<string>("");

  // Sender state
  const [selectedDiscoveredFiles, setSelectedDiscoveredFiles] = useState<DiscoveredFile[]>([]);
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
  const [verifiedSent, setVerifiedSent] = useState<ReceivedFile[]>([]);

  // Refs for active sessions
  const smRef = useRef<ConnectionStateMachine>(new ConnectionStateMachine());
  const senderSessionRef = useRef<SenderSession | null>(null);
  const receiverSessionRef = useRef<ReceiverSession | null>(null);
  const fileSenderRef = useRef<FileSender | null>(null);
  const fileReceiverRef = useRef<FileReceiver | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [stableStep, setStableStep] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

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
          window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
        }
      };

      receiver.onAllReceived = () => {
        smRef.current.transition("done");
      };

      receiver.onError = (err) => {
        if (err.message.includes("checksum") || err.message.includes("Integrity")) {
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
    setSelectedDiscoveredFiles([]);
    setSendMode("files");
    setTextSnippet("");
    setSnippetTitle("");
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
    setVerifiedSent([]);
    setPreviewUrls([]);
    setStableStep(0);
    dragDepthRef.current = 0;

    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  };

  // --- Sender Handlers ---
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const discovered = extractFilesFromInput(e.target.files);
      setSelectedDiscoveredFiles((prev) => [...prev, ...discovered]);
    }
    e.target.value = "";
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const discovered = extractFilesFromInput(e.target.files);
      setSelectedDiscoveredFiles((prev) => [...prev, ...discovered]);
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedDiscoveredFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragDepthRef.current = 0;
    const discovered = await extractFilesFromDataTransfer(e.dataTransfer);
    if (discovered.length > 0) {
      setSelectedDiscoveredFiles((prev) => [...prev, ...discovered]);
    }
  };

  useEffect(() => {
    const urls = selectedDiscoveredFiles.map((item) =>
      item.file.type.startsWith("image/") ? URL.createObjectURL(item.file) : ""
    );
    setPreviewUrls(urls);
    return () => {
      for (const url of urls) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [selectedDiscoveredFiles]);

  // Presets
  const applySampleNotePreset = () => {
    setRole("sender");
    smRef.current.setRole("sender");
    setSendMode("text");
    setTextSnippet("Hello from qrtc! Direct peer-to-peer file transfer is fast, private, and serverless.");
    setSnippetTitle("welcome-note.txt");
  };

  const applySampleDemoPreset = () => {
    setRole("sender");
    smRef.current.setRole("sender");
    setSendMode("files");
    const demo = createDemoImageFile();
    setSelectedDiscoveredFiles([demo]);
  };

  const createSenderTransfer = async () => {
    let filesToSend: DiscoveredFile[] = [...selectedDiscoveredFiles];

    if (sendMode === "text") {
      if (!textSnippet.trim()) return;
      const snippetFile = createTextSnippetFile(textSnippet, snippetTitle || "snippet.txt");
      filesToSend = [snippetFile];
    }

    if (filesToSend.length === 0) return;

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

      // Build queued files
      let filesToSend: DiscoveredFile[] = selectedDiscoveredFiles;
      if (sendMode === "text") {
        filesToSend = [createTextSnippetFile(textSnippet, snippetTitle || "snippet.txt")];
      }

      const queuedFiles: QueuedFile[] = filesToSend.map((item, idx) => ({
        id: `file-${idx}-${Date.now()}`,
        name: item.file.name,
        relativePath: item.relativePath,
        size: item.file.size,
        mime: item.file.type || "application/octet-stream",
        source: item.file,
      }));

      const sender = new FileSender(dc, queuedFiles);
      fileSenderRef.current = sender;

      sender.onProgress = (p) => {
        setProgress(p);
      };

      sender.onFileComplete = (file, sha256) => {
        setVerifiedSent((prev) => [
          ...prev,
          {
            id: file.id,
            name: file.name,
            relativePath: file.relativePath,
            size: file.size,
            mime: file.mime,
            sha256,
          },
        ]);
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

  // --- Receiver Handlers ---
  const handleManualOfferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOffer.trim()) return;
    const parsed = parseHandshakePayload(manualOffer);
    if (parsed.blob) {
      startReceiverFlow(parsed.blob);
    }
  };

  const handleApplyAnswerRef = useRef<(rawAnswer: string) => void>(() => {});
  const startReceiverFlowRef = useRef<(blob: string) => void>(() => {});

  useEffect(() => {
    handleApplyAnswerRef.current = handleApplyAnswer;
    startReceiverFlowRef.current = startReceiverFlow;
  });

  const onAnswerScanned = useCallback((text: string) => {
    void handleApplyAnswerRef.current(text);
  }, []);

  const onOfferScanned = useCallback((text: string) => {
    setShowOfferScanner(false);
    const parsed = parseHandshakePayload(text);
    if (parsed.blob) void startReceiverFlowRef.current(parsed.blob);
  }, []);

  // Determine active stepper step index. Keep the last good step if pairing fails.
  let stepperIndex = 0;
  if (role === "sender") {
    if (status === "idle") stepperIndex = 0;
    else if (status === "offering" || status === "awaiting-answer" || status === "connecting") stepperIndex = 1;
    else if (status === "connected" || status === "transferring") stepperIndex = 2;
    else if (status === "done") stepperIndex = 3;
  } else if (role === "receiver") {
    if (status === "idle") stepperIndex = 0;
    else if (status === "connecting" || status === "awaiting-answer") stepperIndex = 1;
    else if (status === "connected" || status === "transferring") stepperIndex = 2;
    else if (status === "done") stepperIndex = 3;
  }
  useEffect(() => {
    if (status !== "failed") setStableStep(stepperIndex);
  }, [status, stepperIndex]);

  const effectiveSenderFiles = sendMode === "text"
    ? (textSnippet.trim() ? [{ file: new File([textSnippet], snippetTitle || "snippet.txt"), relativePath: snippetTitle || "snippet.txt" }] : [])
    : selectedDiscoveredFiles;

  const totalSelectedBytes = selectedDiscoveredFiles.reduce((acc, f) => acc + f.file.size, 0);

  return (
    <div className="app-container">
      {/* Top Bar / Header */}
      <header className="site-header">
        <div className="header-nav">
          <div className="logo-group">
            <span className="brand-logo">qrtc</span>
            <span className="badge-tag">Private</span>
          </div>
          {role && (
            <button
              type="button"
              className="btn-text-reset"
              onClick={resetAll}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Start over
            </button>
          )}
        </div>

        {/* Polished Hero */}
        <div className={`hero-section ${role ? "hero-compact" : ""}`}>
          <h1 className="hero-title">
            Send files between your phone and computer.
            <span className="hero-quiet"> No app, no upload, no account.</span>
          </h1>
          {!role && (
            <p className="hero-subtitle">
              Open this page on both devices. One shows a code, the other scans it, and the file moves straight across. Nothing is uploaded.
            </p>
          )}
        </div>

        {role && (
          <Stepper
            steps={role === "sender" ? SENDER_STEPS : RECEIVER_STEPS}
            currentStepIndex={status === "failed" ? stableStep : stepperIndex}
          />
        )}
      </header>

      {/* Role Selection Screen */}
      {!role && status === "idle" && (
        <main className="home-view">
          <div className="role-grid">
            <button
              type="button"
              className="role-button role-button-primary role-card-send"
              onClick={() => {
                setRole("sender");
                smRef.current.setRole("sender");
              }}
            >
              <div className="role-icon-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="role-info">
                <span className="role-title">Send</span>
                <span className="role-desc">
                  Pick files, a folder, or a note. The other device scans your code.
                </span>
              </div>
            </button>

            <button
              type="button"
              className="role-button role-card-receive"
              onClick={() => {
                setRole("receiver");
                smRef.current.setRole("receiver");
              }}
            >
              <div className="role-icon-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="role-info">
                <span className="role-title">Receive</span>
                <span className="role-desc">
                  Scan the code on the sending device, or paste it if the camera is unavailable.
                </span>
              </div>
            </button>
          </div>

          {/* Friendly Presets */}
          <div className="presets-bar">
            <span className="presets-label">Try an example</span>
            <div className="presets-btns">
              <button
                type="button"
                className="btn-preset"
                onClick={applySampleNotePreset}
              >
                Sample note
              </button>
              <button
                type="button"
                className="btn-preset"
                onClick={applySampleDemoPreset}
              >
                Sample picture
              </button>
            </div>
          </div>

          {/* Technical Details Accordion */}
          <details className="tech-details-accordion">
            <summary className="tech-details-summary">
              Details
            </summary>
            <div className="tech-details-content">
              <p>
                The two devices connect directly. There is no account and no upload. A short code, shown as a QR code, is enough for them to find each other.
              </p>
              <p>
                Under the hood the code is a compressed WebRTC session description. Each file is checked with SHA-256 before it is saved. Technical notes are in the README.
              </p>
            </div>
          </details>
        </main>
      )}

      {/* SENDER FLOW */}
      {role === "sender" && (
        <main className="flow-main">
          {status === "idle" && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Choose what to send</h2>
                  <p className="card-subtitle">
                    Select multiple files, entire folders, or send a quick text snippet.
                  </p>
                </div>

                {/* Mode Selector Tabs */}
                <div className="tab-pill-group" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sendMode === "files"}
                    className={`tab-pill ${sendMode === "files" ? "active" : ""}`}
                    onClick={() => setSendMode("files")}
                  >
                    Files & Folders
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sendMode === "text"}
                    className={`tab-pill ${sendMode === "text" ? "active" : ""}`}
                    onClick={() => setSendMode("text")}
                  >
                    Text Snippet
                  </button>
                </div>
              </div>

              {sendMode === "files" ? (
                <>
                  {/* Drag and Drop Zone */}
                  <div
                    className={`dropzone ${isDragging ? "active" : ""}`}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="dropzone-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                        <path d="M12 12v9" />
                        <path d="m16 16-4-4-4 4" />
                      </svg>
                    </div>
                    <span className="dropzone-title">Drop files or a folder here</span>
                    <span className="dropzone-sub">
                      You can add more than one. Folders keep their folder names.
                    </span>

                    <div className="dropzone-action-buttons">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose files
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => folderInputRef.current?.click()}
                      >
                        Choose folder
                      </button>
                    </div>

                    {/* Hidden inputs */}
                    <input
                      ref={fileInputRef}
                      id="file-input"
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={handleFileInputChange}
                    />
                    <input
                      ref={folderInputRef}
                      id="folder-input"
                      type="file"
                      // @ts-expect-error webkitdirectory is standard for folder picking
                      webkitdirectory=""
                      multiple
                      style={{ display: "none" }}
                      onChange={handleFolderInputChange}
                    />
                  </div>

                  {/* Selected Files List */}
                  {selectedDiscoveredFiles.length > 0 && (
                    <div className="selected-files-box">
                      <div className="selected-files-summary">
                        <span>
                          {selectedDiscoveredFiles.length} item{selectedDiscoveredFiles.length > 1 ? "s" : ""} selected
                        </span>
                        <span className="meta-dim">({formatBytes(totalSelectedBytes)})</span>
                      </div>

                      <div className="file-list">
                        {selectedDiscoveredFiles.map((item, idx) => (
                          <div key={`${item.relativePath}-${idx}`} className="file-item">
                            {previewUrls[idx] && (
                              <img src={previewUrls[idx]} alt="" className="file-thumb" />
                            )}
                            <div className="file-item-info">
                              <span className="file-name" title={item.relativePath}>
                                {item.relativePath}
                              </span>
                              <span className="file-size">{formatBytes(item.file.size)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="btn-item-remove"
                              aria-label="Remove item"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDiscoveredFiles.length === 0 && (
                    <p className="empty-hint">
                      Nothing selected yet.
                      <button type="button" className="btn-text-subtle" onClick={applySampleNotePreset}>
                        Try a sample note
                      </button>
                      <span>or</span>
                      <button type="button" className="btn-text-subtle" onClick={applySampleDemoPreset}>
                        a sample picture
                      </button>
                    </p>
                  )}
                </>
              ) : (
                /* Text Snippet Input */
                <div className="snippet-input-group">
                  <input
                    type="text"
                    className="input-text-title"
                    placeholder="Snippet title (e.g. Wi-Fi Password, Link, Note)"
                    value={snippetTitle}
                    onChange={(e) => setSnippetTitle(e.target.value)}
                  />
                  <textarea
                    className="code-area"
                    rows={6}
                    placeholder="Type a note, a link, or anything you want the other device to copy."
                    value={textSnippet}
                    onChange={(e) => setTextSnippet(e.target.value)}
                  />
                  {!textSnippet.trim() && (
                    <p className="empty-hint">Nothing to send yet. Type a note, or paste one from your clipboard.</p>
                  )}
                  <span className="dropzone-sub">
                    The other device gets a Copy button for this text.
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={effectiveSenderFiles.length === 0}
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
            <div className="card loading-card">
              <div className="loading-spinner" />
              <div>
                <h3 className="card-title">Getting your code ready</h3>
                <p className="card-subtitle">
                  This usually takes a few seconds. Keep this page open.
                </p>
              </div>
            </div>
          )}

          {status === "awaiting-answer" && (
            <>
              <QrCard
                title="Show this code to the other device"
                subtitle="On the other device, open this page, choose Receive, and scan the code."
                payload={offerCompressed}
                url={offerUrl}
                stepBadge="Step 1 of 2"
                waitingLabel="Waiting for the other device to scan"
              />

              <div className="card">
                <div>
                  <span className="step-pill">Step 2 of 2</span>
                  <h3 className="card-title" style={{ marginTop: "6px" }}>
                    Finish pairing
                  </h3>
                  <p className="card-subtitle">
                    The other device will show a second code. Scan it, or paste it below.
                  </p>
                </div>

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setShowAnswerScanner(true)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: "6px" }}>
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    Scan the answer code
                  </button>
                </div>

                {/* Short Paste-Code Fallback */}
                <div className="paste-fallback-box">
                  <label className="field-label" htmlFor="answer-code-input">
                    Or paste the answer code
                  </label>
                  <textarea
                    id="answer-code-input"
                    className="code-area"
                    spellCheck={false}
                    placeholder="Paste the answer code here"
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
            <div className="card loading-card">
              <div className="loading-spinner" />
              <div>
                <h3 className="card-title">Connecting the two devices</h3>
                <p className="card-subtitle">
                  Keep both screens open. This usually takes a few seconds.
                </p>
              </div>
            </div>
          )}

          {(status === "connected" || status === "transferring" || status === "done") && (
            <TransferView
              role="sender"
              safetyCode={safetyCode}
              progress={progress}
              completedFiles={verifiedSent}
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

      {/* RECEIVER FLOW */}
      {role === "receiver" && (
        <main className="flow-main">
          {status === "idle" && (
            <div className="card">
              <div>
                <h2 className="card-title">Receive from the other device</h2>
                <p className="card-subtitle">
                  Scan the code it is showing, or paste that code below.
                </p>
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowOfferScanner(true)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: "6px" }}>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Scan the code
                </button>
              </div>

              {/* Paste offer fallback */}
              <form onSubmit={handleManualOfferSubmit} className="paste-fallback-box">
                <label className="field-label" htmlFor="offer-code-input">
                  Or paste the code or link
                </label>
                <textarea
                  id="offer-code-input"
                  className="code-area"
                  spellCheck={false}
                  placeholder="Paste a code or a link from the other device"
                  value={manualOffer}
                  onChange={(e) => setManualOffer(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn-secondary"
                  disabled={!manualOffer.trim()}
                >
                  Connect
                </button>
              </form>
            </div>
          )}

          {status === "connecting" && !answerCompressed && (
            <div className="card loading-card">
              <div className="loading-spinner" />
              <div>
                <h3 className="card-title">Getting ready</h3>
                <p className="card-subtitle">
                  Creating your answer code. This usually takes a few seconds.
                </p>
              </div>
            </div>
          )}

          {status === "awaiting-answer" && answerCompressed && (
            <>
              <QrCard
                title="Show this code to the sender"
                subtitle="The sending device scans this code, or you can copy it and paste it there."
                payload={answerCompressed}
                stepBadge="Step 2 of 2"
                waitingLabel="Waiting for the sender to scan"
              />
              <div className="card loading-card">
                <div className="loading-spinner" />
                <div>
                  <h3 className="card-title">Waiting for the sender</h3>
                  <p className="card-subtitle">
                    Once they scan or paste this code, the file starts moving on its own.
                  </p>
                </div>
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
          <div className="error-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2 className="error-title">{error.message}</h2>
          </div>
          {error.details && <p className="error-details">{error.details}</p>}

          <HelpPanel initiallyOpen={true} />

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
          promptText="Scan the answer code"
          onScan={onAnswerScanned}
          onClose={() => setShowAnswerScanner(false)}
        />
      )}

      {showOfferScanner && (
        <ScannerModal
          promptText="Scan the sender's code"
          onScan={onOfferScanned}
          onClose={() => setShowOfferScanner(false)}
        />
      )}

      {/* Help Panel (Always visible at bottom when not in error) */}
      {status !== "failed" && <HelpPanel />}

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-left">
          <span>qrtc</span>
          <span className="footer-dot">·</span>
          <span>Direct. Nothing is uploaded.</span>
        </div>
        <div className="footer-right">
          <a href="https://github.com/gfxroy/qrtc" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
};
