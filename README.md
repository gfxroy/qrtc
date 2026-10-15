# qrtc

Send files between your phone and computer. No app, no upload, no account.

**Live:** https://gfxroy.github.io/qrtc/

![screenshot](docs/screenshot.png)

Open this page on both devices. One shows a code. The other scans it. The file moves straight from one device to the other. Nothing is uploaded, and there is no account.

## Features

- **Two steps.** Choose Send or Receive. The sender shows a QR code. The receiver scans it and shows a second code. The sender scans that, or either side can paste a short code if the camera is unavailable.
- **Files, folders, and notes.** Drop several files or a whole folder. Folder names are kept. You can also send a text snippet, and the receiver gets a Copy button.
- **Progress.** A ring shows how far the transfer has gone, how fast it is moving, and the time left.
- **Previews.** Pictures and videos show on the receiving device. A click opens a larger view.
- **Download all.** Save everything that arrived as one zip file. The zip is built as it is written, and paths inside folders are kept.
- **Verified.** Each file is checked with SHA-256. A Verified badge appears after the check passes. Both screens also show the same four-word safety code so you can confirm you paired with the right device.
- **Help when it fails.** If pairing does not work, the page explains same-Wi-Fi, mobile data, and symmetric NAT in plain language.

## How it works

WebRTC normally depends on an external signaling server (WebSocket, HTTP polling, or Firebase) to swap session descriptions (SDP offers and answers) between two peers. `qrtc` eliminates the signaling server completely by turning the devices' screens and cameras into the signaling channel.

### 1. SDP Minifier

Standard WebRTC SDP offers and answers are verbose text documents between 1.5 KB and 4 KB. An uncompressed SDP would produce an extremely dense QR code that standard mobile cameras struggle to scan reliably.

`qrtc` extracts only the essential session parameters:
- `ice-ufrag` and `ice-pwd`
- DTLS SHA-256 fingerprint (compacted from 95 characters of hex string into 32 raw bytes)
- SCTP port (encoded as uint16)
- ICE candidates (`host` and `srflx`), encoding IPv4 addresses as 4 raw bytes, IPv6 as 16 raw bytes, ports as uint16, and Chrome mDNS hostnames (the `*.local` privacy addresses) as 16 raw bytes so same-LAN pairing still works.

The extracted binary payload is compressed using raw DEFLATE (`deflate-raw` via `fflate`) and encoded as `base64url`. This reduces typical offers and answers down to ~70–100 characters (well under our 300-character target). When scanned, the decoder expands the compact binary back into an RFC-compliant full SDP accepted by Chrome, Firefox, and Safari.

### 2. Zero-Signaling Handshake

1. **Offer Generation:** The sender gathers ICE candidates using Google's public STUN server (`stun:stun.l.google.com:19302`) with a 3-second timeout for non-trickle gathering.
2. **Display:** The minified offer is displayed as a high-contrast QR code and a direct copyable link (`https://gfxroy.github.io/qrtc/#o=<blob>`).
3. **Receiver Answering:** The receiver scans the QR code, opens the link, or pastes the short code. It creates a local peer connection, gathers its candidates, and presents an answer QR code plus a copyable code.
4. **Connection:** The sender scans or pastes the answer. Once applied, WebRTC connectivity checks complete and the `RTCDataChannel` opens.

### 3. DataChannel Transfer Protocol & Backpressure

- **Chunking:** Files are read in fixed 64 KB slices. Several files can be queued, including a folder. Each item keeps its relative path.
- **Notes:** A text snippet is sent as a small text file. The receiver can copy it in one click.
- **Backpressure:** WebRTC data channels have internal buffer limits. When sending large files at high speed, `bufferedAmount` will rapidly overflow if unbounded. `qrtc` monitors `bufferedAmountLowThreshold` (set to 256 KB) and pauses chunk reads until the browser signals `bufferedamountlow`.
- **Streaming Incremental SHA-256:** Browser `crypto.subtle` does not support streaming hash updates for incoming chunks. `qrtc` implements an incremental pure TypeScript SHA-256 engine. Each 64 KB chunk is hashed as it is transmitted and received. When the transfer ends, the receiver verifies the digest against the sender's final hash, shows a Verified badge, and saves the file. Every received file can also be packed into one zip with `fflate`'s streaming encoder.

### 4. Safety Code

Both peers derive a 4-word safety code from a sorted SHA-256 hash of their combined DTLS fingerprints. Users can visually confirm the 4 words match on both screens to verify that no party altered the handshake in transit.

## Limitations

- **Symmetric NATs:** Direct peer-to-peer WebRTC connections require at least one peer to have an addressable STUN candidate (full cone, restricted cone, or port-restricted cone NAT). When both devices are behind symmetric NATs (common on cellular data networks and corporate firewalls), direct traversal is mathematically impossible without a TURN relay server. In such environments, both devices must be on the same local Wi-Fi or connected to a mobile hotspot.
- **Background Tabs on Mobile:** Mobile operating systems (especially iOS Safari) throttle background timers and suspend WebRTC data channels when the screen locks or the browser switches tabs. Keep the browser open until transfer completes.
- **Camera Access:** Browser camera scanning requires a secure context (`https://` or `localhost`). Paste the code when the camera is unavailable.
- **No relay:** There is no TURN server. If a direct path cannot be found, the transfer cannot fall back to an upload.

## Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run unit and integration tests (Vitest)
npm test

# Typecheck TypeScript
npm run typecheck

# Lint codebase
npm run lint

# Production build
npm run build

# Build for GitHub Pages
npm run build:pages
```

## License

MIT License

Copyright (c) 2026 Aaditya Roy
