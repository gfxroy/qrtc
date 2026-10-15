import React, { useEffect, useState } from "react";
import { generateQrSvg } from "../lib/qr/generate.ts";

interface QrCardProps {
  title: string;
  subtitle?: string;
  payload: string;
  url?: string;
  stepBadge?: string;
}

export const QrCard: React.FC<QrCardProps> = ({
  title,
  subtitle,
  payload,
  url,
  stepBadge,
}) => {
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCodeDetails, setShowCodeDetails] = useState(false);

  useEffect(() => {
    // Generate QR code for the URL if available, else for the raw payload
    const textToEncode = url || payload;
    generateQrSvg(textToEncode, {
      margin: 1,
      darkColor: "#0a0a0a",
      lightColor: "#ffffff",
    })
      .then(setSvgHtml)
      .catch((err) => console.error("Failed to generate QR code", err));
  }, [url, payload]);

  const copyToClipboard = async (text: string, type: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "link") {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      if (type === "link") {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    }
  };

  return (
    <div className="card qr-card-animated">
      <div className="qr-header">
        {stepBadge && <span className="step-pill">{stepBadge}</span>}
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>

      <div className="qr-display-container">
        <div className="qr-pulse-wrapper">
          <div
            className="qr-box-animated"
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
          <div className="qr-pulse-ring" />
        </div>
        <span className="qr-waiting-text">
          <span className="waiting-dot" /> Waiting for peer to scan...
        </span>
      </div>

      <div className="btn-row qr-btn-row">
        {url && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => copyToClipboard(url, "link")}
          >
            {copiedLink ? "Link copied" : "Copy link"}
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => copyToClipboard(payload, "code")}
        >
          {copiedCode ? "Code copied" : "Copy raw code"}
        </button>
      </div>

      <div className="qr-details-toggle">
        <button
          type="button"
          className="btn-text-subtle"
          onClick={() => setShowCodeDetails((prev) => !prev)}
        >
          {showCodeDetails ? "Hide raw code" : "Show raw code"}
        </button>
        {showCodeDetails && (
          <div className="qr-code-inspect">
            <textarea
              readOnly
              className="code-area-readonly"
              value={payload}
              rows={3}
            />
          </div>
        )}
      </div>
    </div>
  );
};
