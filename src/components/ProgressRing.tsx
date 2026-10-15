import React from "react";
import { formatBytes, formatEta, formatSpeed } from "../lib/protocol/progress.ts";
import type { TransferProgress } from "../lib/protocol/transfer.ts";

interface ProgressRingProps {
  progress: TransferProgress | null;
  isDone?: boolean;
  size?: number;
  strokeWidth?: number;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  isDone = false,
  size = 148,
  strokeWidth = 6,
}) => {
  const percent = isDone ? 100 : Math.min(100, Math.max(0, progress?.overallPercent ?? 0));
  const speed = progress?.speed ?? 0;
  const eta = progress?.eta ?? 0;
  const transferred = progress?.overallBytesTransferred ?? 0;
  const total = progress?.overallTotalBytes ?? 0;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="progress-ring-card">
      <div className="progress-ring-container" style={{ width: size, height: size }}>
        <svg className="progress-ring-svg" width={size} height={size}>
          {/* Background Track */}
          <circle
            className="progress-ring-bg"
            stroke="var(--line)"
            strokeWidth={strokeWidth}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          {/* Progress Stroke */}
          <circle
            className={`progress-ring-circle ${isDone ? "done" : ""}`}
            stroke={isDone ? "#10b981" : "var(--fg)"}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>

        <div className="progress-ring-center">
          <span className="progress-ring-percent">
            {isDone ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              `${Math.round(percent)}%`
            )}
          </span>
          <span className="progress-ring-sub">
            {isDone ? "Finished" : speed > 0 ? formatSpeed(speed) : "Transferring"}
          </span>
        </div>
      </div>

      <div className="progress-ring-meta">
        <div className="meta-stat">
          <span className="meta-label">Transferred</span>
          <span className="meta-value">
            {formatBytes(transferred)} <span className="meta-dim">/ {formatBytes(total)}</span>
          </span>
        </div>

        {!isDone && (
          <div className="meta-stat">
            <span className="meta-label">Est. Time Remaining</span>
            <span className="meta-value">{formatEta(eta)}</span>
          </div>
        )}

        {isDone && (
          <div className="meta-stat">
            <span className="meta-label">Status</span>
            <span className="meta-value verified-accent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: "4px" }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Complete
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
