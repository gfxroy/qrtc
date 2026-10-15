import type { DiscoveredFile } from "./folder.ts";

/**
 * Creates a DiscoveredFile from plain text or code snippet.
 */
export function createTextSnippetFile(text: string, customName?: string): DiscoveredFile {
  const cleanName = (customName?.trim() || "note.txt").replace(/[/\\?%*:|"<>]/g, "-");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const file = new File([blob], cleanName, { type: "text/plain;charset=utf-8" });
  return {
    file,
    relativePath: cleanName,
  };
}

/**
 * Creates a demo sample SVG graphic file for 1-click preview testing.
 */
export function createDemoImageFile(): DiscoveredFile {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#181818"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#a1a1a1" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#bg)"/>
  <circle cx="200" cy="200" r="110" stroke="url(#glow)" stroke-width="2" fill="none"/>
  <circle cx="200" cy="200" r="70" stroke="#ffffff" stroke-width="3" stroke-dasharray="6 6" fill="none"/>
  <text x="200" y="195" font-family="sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">qrtc</text>
  <text x="200" y="225" font-family="sans-serif" font-size="13" fill="#a1a1a1" text-anchor="middle">Verified Direct Transfer</text>
</svg>`;

  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const file = new File([blob], "qrtc-demo.svg", { type: "image/svg+xml" });
  return {
    file,
    relativePath: "qrtc-demo.svg",
  };
}
