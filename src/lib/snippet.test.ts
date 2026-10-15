import { describe, expect, it } from "vitest";
import { createDemoImageFile, createTextSnippetFile } from "./snippet.ts";

describe("snippet helpers", () => {
  it("creates text snippet file with proper mime and name", async () => {
    const text = "Hello Antigravity WebRTC transfer";
    const discovered = createTextSnippetFile(text, "my-message.txt");

    expect(discovered.relativePath).toBe("my-message.txt");
    expect(discovered.file.name).toBe("my-message.txt");
    expect(discovered.file.type).toContain("text/plain");

    const content = await discovered.file.text();
    expect(content).toBe(text);
  });

  it("creates demo image file with svg content", async () => {
    const demo = createDemoImageFile();
    expect(demo.relativePath).toBe("qrtc-demo.svg");
    expect(demo.file.type).toBe("image/svg+xml");
    const content = await demo.file.text();
    expect(content).toContain("<svg");
    expect(content).toContain("qrtc");
  });
});
