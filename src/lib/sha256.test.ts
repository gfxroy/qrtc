import { describe, it, expect } from "vitest";
import { IncrementalSha256 } from "./sha256.ts";
import { createHash } from "node:crypto";

describe("IncrementalSha256", () => {
  it("hashes empty string correctly", () => {
    const s = new IncrementalSha256();
    expect(s.digestHex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashes 'abc' correctly", () => {
    const s = new IncrementalSha256();
    s.update("abc");
    expect(s.digestHex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches node crypto across chunked updates", () => {
    const chunks = [
      new TextEncoder().encode("Hello "),
      new TextEncoder().encode("World! "),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array(200).fill(42),
    ];

    const custom = new IncrementalSha256();
    const node = createHash("sha256");

    for (const chunk of chunks) {
      custom.update(chunk);
      node.update(chunk);
    }

    expect(custom.digestHex()).toBe(node.digest("hex"));
  });

  it("handles arbitrary large buffer (256 KB)", () => {
    const big = new Uint8Array(256 * 1024);
    for (let i = 0; i < big.length; i++) {
      big[i] = (i * 31 + 7) & 0xff;
    }
    const custom = IncrementalSha256.hash(big);
    const node = createHash("sha256").update(big).digest("hex");
    expect(custom).toBe(node);
  });
});
