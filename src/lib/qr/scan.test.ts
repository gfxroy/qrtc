import { describe, it, expect } from "vitest";
import { parseHandshakePayload } from "./scan.ts";
import { minifySdp } from "../sdp/codec.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("parseHandshakePayload", () => {
  const chromeOfferSdp = readFileSync(
    join(__dirname, "../sdp/__fixtures__/chrome-offer.sdp"),
    "utf-8"
  );
  const minifiedOffer = minifySdp(chromeOfferSdp, "offer");

  it("parses hash #o= offer link", () => {
    const url = `https://gfxroy.github.io/qrtc/#o=${minifiedOffer}`;
    const parsed = parseHandshakePayload(url);
    expect(parsed.type).toBe("offer");
    expect(parsed.blob).toBe(minifiedOffer);
  });

  it("parses hash #a= answer link", () => {
    const url = `https://gfxroy.github.io/qrtc/#a=someAnswerBlob`;
    const parsed = parseHandshakePayload(url);
    expect(parsed.type).toBe("answer");
    expect(parsed.blob).toBe("someAnswerBlob");
  });

  it("parses query param ?o= and ?a=", () => {
    expect(parseHandshakePayload(`https://example.com/?o=myOffer`).type).toBe("offer");
    expect(parseHandshakePayload(`https://example.com/?a=myAnswer`).type).toBe("answer");
  });

  it("detects raw minified offer blob from binary flags", () => {
    const parsed = parseHandshakePayload(minifiedOffer);
    expect(parsed.type).toBe("offer");
    expect(parsed.blob).toBe(minifiedOffer);
  });

  it("returns unknown for invalid text", () => {
    const parsed = parseHandshakePayload("invalid-plain-text");
    expect(parsed.type).toBe("unknown");
    expect(parsed.blob).toBe("invalid-plain-text");
  });
});
