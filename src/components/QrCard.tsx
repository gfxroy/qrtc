import React, { useEffect, useState } from "react";
import { generateQrSvg } from "../lib/qr/generate.ts";

interface QrCardProps {
  title: string;
  subtitle?: string;
  payload: string;
  url?: string;
}

export const QrCard: React.FC<QrCardProps> = ({
  title,
  subtitle,
  payload,
  url,
}) => {
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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
    <div className="card" style={{ alignItems: "center", textAlign: "center" }}>
      <div>
        <h2 style={{ fontSize: "18px", fontWeight: 600 }}>{title}</h2>
        {subtitle && <p className="tagline" style={{ marginTop: "4px" }}>{subtitle}</p>}
      </div>

      <div className="qr-wrapper">
        <div
          className="qr-box"
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>

      <div className="btn-row" style={{ justifyContent: "center" }}>
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
    </div>
  );
};
