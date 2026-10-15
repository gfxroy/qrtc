import React, { useEffect, useState } from "react";
import { formatBytes } from "../lib/protocol/progress.ts";
import type { ReceivedFile } from "../lib/protocol/transfer.ts";

interface FilePreviewProps {
  file: ReceivedFile;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textSnippet, setTextSnippet] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  const isImage = file.mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
  const isVideo = file.mime.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
  const isAudio = file.mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name);
  const isText = file.mime.startsWith("text/") || /\.(txt|md|json|ts|js|html|css)$/i.test(file.name);

  useEffect(() => {
    if (file.blob) {
      const url = URL.createObjectURL(file.blob);
      setObjectUrl(url);

      if (isText && file.size < 200_000) {
        file.blob.text().then(setTextSnippet).catch(() => {});
      }

      return () => {
        URL.revokeObjectURL(url);
      };
    } else if (file.data) {
      const blob = new Blob([file.data as any], { type: file.mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);

      if (isText && file.size < 200_000) {
        blob.text().then(setTextSnippet).catch(() => {});
      }

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [file.blob, file.data, file.mime, file.size, isText]);

  const handleCopyText = async () => {
    if (!textSnippet) return;
    try {
      await navigator.clipboard.writeText(textSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = textSnippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayName = file.relativePath || file.name;

  return (
    <div className="file-preview-card">
      <div className="file-preview-header">
        <div className="file-meta">
          <div className="file-name-row">
            <span className="file-name" title={displayName}>
              {displayName}
            </span>
            {file.sha256 && (
              <span className="verified-badge" title={`SHA-256: ${file.sha256}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified
              </span>
            )}
          </div>
          <span className="file-size-tag">{formatBytes(file.size)}</span>
        </div>

        <div className="file-actions">
          {textSnippet !== null && (
            <button
              type="button"
              className="btn-snippet-copy"
              onClick={handleCopyText}
              title="Copy snippet to clipboard"
            >
              {copied ? "Copied" : "Copy text"}
            </button>
          )}

          {objectUrl && (
            <a
              href={objectUrl}
              download={file.name}
              className="btn-download-item"
              title="Download file"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Save
            </a>
          )}
        </div>
      </div>

      {/* Media Previews */}
      {objectUrl && (
        <div className="file-preview-body">
          {isImage && (
            <div className="preview-image-wrap" onClick={() => setLightboxOpen(true)}>
              <img src={objectUrl} alt={file.name} className="preview-image" loading="lazy" />
              <div className="preview-zoom-hint">Click to enlarge</div>
            </div>
          )}

          {isVideo && (
            <div className="preview-video-wrap">
              <video src={objectUrl} controls playsInline className="preview-video" />
            </div>
          )}

          {isAudio && (
            <div className="preview-audio-wrap">
              <audio src={objectUrl} controls className="preview-audio" />
            </div>
          )}

          {textSnippet !== null && (
            <div className="preview-snippet-wrap">
              <pre className="preview-snippet-text">{textSnippet}</pre>
            </div>
          )}
        </div>
      )}

      {/* Lightbox for Image */}
      {lightboxOpen && objectUrl && (
        <div className="lightbox-backdrop" onClick={() => setLightboxOpen(false)} role="dialog">
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={objectUrl} alt={file.name} className="lightbox-full-img" />
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close image preview"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
