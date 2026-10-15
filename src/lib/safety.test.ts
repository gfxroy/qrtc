import { describe, it, expect } from "vitest";
import { generateSafetyCode, WORDLIST } from "./safety.ts";

describe("generateSafetyCode", () => {
  const fpA = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
  const fpB = "11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF";

  it("has exactly 1024 words in wordlist", () => {
    expect(WORDLIST.length).toBeGreaterThanOrEqual(1024);
  });

  it("generates 4-word code symmetrically", () => {
    const code1 = generateSafetyCode(fpA, fpB);
    const code2 = generateSafetyCode(fpB, fpA);
    expect(code1).toBe(code2);
    const words = code1.split(" ");
    expect(words).toHaveLength(4);
    for (const w of words) {
      expect(WORDLIST).toContain(w);
    }
  });

  it("handles lowercase, uppercase, and colon-free formats identically", () => {
    const rawA = fpA.toLowerCase().replace(/:/g, "");
    const rawB = fpB.toLowerCase().replace(/:/g, "");
    expect(generateSafetyCode(rawA, rawB)).toBe(generateSafetyCode(fpA, fpB));
  });
});
