import React, { useState } from "react";

interface HelpPanelProps {
  initiallyOpen?: boolean;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ initiallyOpen = false }) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <div className="help-panel">
      <button
        type="button"
        className="help-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span className="help-toggle-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          If the connection fails
        </span>
        <span className="help-toggle-icon">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div className="help-content">
          <div className="help-item">
            <h4 className="help-item-title">Use the same Wi-Fi</h4>
            <p className="help-item-desc">
              The devices talk to each other directly. Put both on the same home or office Wi-Fi, or turn on a phone hotspot and join it from the other device.
            </p>
          </div>

          <div className="help-item">
            <h4 className="help-item-title">Mobile data and symmetric NAT</h4>
            <p className="help-item-desc">
              Cellular networks usually put phones behind symmetric NAT, which blocks a direct connection when both sides are on mobile data. There is no relay server. Share a hotspot, or move both devices onto the same Wi-Fi.
            </p>
          </div>

          <div className="help-item">
            <h4 className="help-item-title">Keep the phone screen on</h4>
            <p className="help-item-desc">
              Phones pause the page when the screen locks or you switch apps. Leave this tab open until the ring reaches 100%.
            </p>
          </div>

          <div className="help-item">
            <h4 className="help-item-title">Camera blocked</h4>
            <p className="help-item-desc">
              The camera only works on a secure page. If permission is denied, use Copy link or Copy raw code and paste it on the other device.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
