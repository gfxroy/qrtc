import React from "react";
import { formatBytes, formatEta, formatSpeed } from "../lib/protocol/progress.ts";
import type { TransferProgress, ReceivedFile } from "../lib/protocol/transfer.ts";

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
  const percent = progress?.overallPercent ?? 0;
  const transferred = progress?.overallBytesTransferred ?? 0;
  const total = progress?.overallTotalBytes ?? 0;
  const speed = progress?.speed ?? 0;
  const eta = progress?.eta ?? 0;
  const fileName = progress?.fileName ?? "";
  const fileIndex = (progress?.fileIndex ?? 0) + 1;
  const totalFiles = progress?.totalFiles ?? 1;

  return (
    <div className="card">
      {safetyCode && (
        <div className="safety-box">
          <span className="safety-label">Safety code · Compare with peer</span>
          <span className="safety-code">{safetyCode}</span>
        </div>
      )}

      <div className="progress-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="brand" style={{ color: "var(--fg)" }}>
            {isDone
              ? "Transfer complete"
              : role === "sender"
              ? `Sending (${fileIndex}/${totalFiles})`
              : `Receiving (${fileIndex}/${totalFiles})`}
          </span>
          <span className="file-size" style={{ fontWeight: 600, color: "var(--fg)" }}>
            {percent.toFixed(0)}%
          </span>
        </div>

        {fileName && !isDone && (
          <p className="tagline" style={{ fontSize: "13.5px" }}>
            {fileName}
          </p>
        )}

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>

        <div className="progress-stats">
          <span>
            {formatBytes(transferred)} of {formatBytes(total)}
          </span>
          {!isDone && (
            <span>
              {formatSpeed(speed)} · {formatEta(eta)} left
            </span>
          )}
        </div>
      </div>

      {completedFiles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
          <span className="brand">
            {role === "sender" ? "Transferred files" : "Received files (SHA-256 verified)"}
          </span>
          <div className="file-list">
            {completedFiles.map((file) => (
              <div key={file.id} className="file-item">
                <span className="file-name">{file.name}</span>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span className="file-size">{formatBytes(file.size)}</span>
                  {file.blob && (
                    <a
                      href={URL.createObjectURL(file.blob)}
                      download={file.name}
                      className="brand"
                      style={{ color: "var(--fg)", textDecoration: "underline" }}
                    >
                      Save
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
