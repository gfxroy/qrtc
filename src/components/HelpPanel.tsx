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
          Troubleshooting & Connection Tips
        </span>
        <span className="help-toggle-icon">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div className="help-content">
          <div className="help-item">
            <h4 className="help-item-title">1. Connect both devices to the same Wi-Fi</h4>
            <p className="help-item-desc">
              WebRTC connects devices directly without intermediate servers. Being on the same home or office Wi-Fi, or sharing a mobile personal hotspot, enables instantaneous peer discovery over local LAN.
            </p>
          </div>

          <div className="help-item">
            <h4 className="help-item-title">2. Mobile cellular data & Symmetric NAT</h4>
            <p className="help-item-desc">
              Cellular carriers use Carrier-Grade NAT (CGNAT / symmetric NAT) that blocks unsolicited incoming peer packets. If both phones are on pure 4G/5G without a common Wi-Fi, turn on one phone's Personal Hotspot and connect the other device.
            </p>
          </div>

          <div className="help-item">
            <h4 className="help-item-title">3. Keep browser in foreground on phones</h4>
            <p className="help-item-desc">
              iOS Safari and mobile browsers suspend background network timers when the screen locks or when switching apps. Keep this tab open until the transfer circle reaches 100%.
            </p>
          </div>

          <div className="help-item">
            <h4 className="help-item-title">4. Camera permission</h4>
            <p className="help-item-desc">
              Camera access requires a secure connection. If camera scanning is denied or unavailable, use the "Copy link" or "Copy raw code" button and paste it directly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
