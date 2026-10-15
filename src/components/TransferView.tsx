import React, { useState } from "react";
import { formatBytes } from "../lib/protocol/progress.ts";
import type { ReceivedFile, TransferProgress } from "../lib/protocol/transfer.ts";
import { createZipArchive } from "../lib/zip.ts";
import { ProgressRing } from "./ProgressRing.tsx";
import { FilePreview } from "./FilePreview.tsx";

interface TransferViewProps {
  role: "sender" | "receiver";
  safetyCode: string;
  progress: TransferProgress | null;
  completedFiles?: ReceivedFile[];
  isDone?: boolean;
}

export const TransferView: React.FC<TransferViewProps> = ({
  role,
  safetyCode,
  progress,
  completedFiles = [],
  isDone = false,
}) => {
  const [zipping, setZipping] = useState(false);

  const totalFiles = progress?.totalFiles ?? Math.max(1, completedFiles.length);
  const fileIndex = Math.min(totalFiles, (progress?.fileIndex ?? 0) + 1);
  const currentFileName = progress?.fileName ?? "";

  const handleDownloadAllZip = async () => {
    if (completedFiles.length === 0 || zipping) return;
    try {
      setZipping(true);
      const zipBlob = await createZipArchive(completedFiles);
      const url = URL.createObjectURL(zipBlob);
      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = `qrtc-transfer-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Failed to build ZIP file", err);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="card transfer-view-card">
      {/* Header status */}
      <div className="transfer-header">
        <div>
          <span className="transfer-badge">
            {role === "sender" ? "Sender" : "Receiver"}
          </span>
          <h2 className="transfer-title">
            {isDone ? "Transfer complete" : role === "sender" ? "Sending files..." : "Receiving files..."}
          </h2>
          <p className="card-subtitle">
            {isDone
              ? "All files transferred directly over peer-to-peer data channel."
              : currentFileName
              ? `Transferring ${currentFileName} (${fileIndex} of ${totalFiles})`
              : `Processing ${totalFiles} item${totalFiles > 1 ? "s" : ""}...`}
          </p>
        </div>

        {/* Verified Badge / Notice */}
        {completedFiles.length > 0 && (
          <div className="verified-pill-box">
            <span className="verified-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              SHA-256 verified
            </span>
          </div>
        )}
      </div>

      {/* Safety Code Box */}
      {safetyCode && (
        <div className="safety-box">
          <div className="safety-header">
            <span className="safety-label">Safety Code · Compare with peer</span>
            <span className="safety-sub">Guarantees no tampering or interception</span>
          </div>
          <span className="safety-code">{safetyCode}</span>
        </div>
      )}

      {/* Progress Ring with Speed and ETA */}
      <ProgressRing progress={progress} isDone={isDone} />

      {/* Received / Completed files */}
      {completedFiles.length > 0 && (
        <div className="completed-files-section">
          <div className="completed-header-row">
            <div className="completed-title-box">
              <h3 className="section-title">
                {role === "sender" ? "Transferred files" : "Received files (SHA-256 verified)"}
              </h3>
              <span className="file-count-badge">
                {completedFiles.length} {completedFiles.length === 1 ? "file" : "files"} (
                {formatBytes(completedFiles.reduce((acc, f) => acc + f.size, 0))})
              </span>
            </div>

            {/* "Download all" as ZIP button */}
            {role === "receiver" && completedFiles.length > 1 && (
              <button
                type="button"
                className="btn-secondary btn-zip-all"
                onClick={handleDownloadAllZip}
                disabled={zipping}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {zipping ? "Creating ZIP..." : "Download all as ZIP"}
              </button>
            )}
          </div>

          <div className="file-preview-list">
            {completedFiles.map((file) => (
              <FilePreview key={file.id} file={file} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
