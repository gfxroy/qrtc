import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { minifySdp, expandSdp } from "./codec.ts";
import { parseSdp } from "./parser.ts";

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "__fixtures__", name), "utf-8");
}

describe("SDP Minifier and Codec", () => {
  it("minifies Chrome offer and verifies length < 300 characters", () => {
    const sdp = loadFixture("chrome-offer.sdp");
    const minified = minifySdp(sdp, "offer");
    expect(minified.length).toBeLessThan(300);
    expect(typeof minified).toBe("string");

    // Round trip test
    const expanded = expandSdp(minified);
    const parsedOriginal = parseSdp(sdp, "offer");
    const parsedExpanded = parseSdp(expanded, "offer");

    expect(parsedExpanded.ufrag).toBe(parsedOriginal.ufrag);
    expect(parsedExpanded.pwd).toBe(parsedOriginal.pwd);
    expect(parsedExpanded.fingerprint).toBe(parsedOriginal.fingerprint);
    expect(parsedExpanded.setup).toBe("actpass");
    expect(parsedExpanded.sctpPort).toBe(parsedOriginal.sctpPort);
    expect(parsedExpanded.candidates).toEqual(parsedOriginal.candidates);
  });

  it("minifies Chrome answer and round trips properly", () => {
    const sdp = loadFixture("chrome-answer.sdp");
    const minified = minifySdp(sdp, "answer");

    expect(minified.length).toBeLessThan(300);

    const expanded = expandSdp(minified);
    const parsedOriginal = parseSdp(sdp, "answer");
    const parsedExpanded = parseSdp(expanded, "answer");

    expect(parsedExpanded.ufrag).toBe(parsedOriginal.ufrag);
    expect(parsedExpanded.pwd).toBe(parsedOriginal.pwd);
    expect(parsedExpanded.fingerprint).toBe(parsedOriginal.fingerprint);
    expect(parsedExpanded.setup).toBe("active");
    expect(parsedExpanded.candidates).toEqual(parsedOriginal.candidates);
  });

  it("minifies Firefox offer and round trips properly", () => {
    const sdp = loadFixture("firefox-offer.sdp");
    const minified = minifySdp(sdp, "offer");

    expect(minified.length).toBeLessThan(300);

    const expanded = expandSdp(minified);
    const parsedOriginal = parseSdp(sdp, "offer");
    const parsedExpanded = parseSdp(expanded, "offer");

    expect(parsedExpanded.ufrag).toBe(parsedOriginal.ufrag);
    expect(parsedExpanded.pwd).toBe(parsedOriginal.pwd);
    expect(parsedExpanded.fingerprint).toBe(parsedOriginal.fingerprint);
    expect(parsedExpanded.setup).toBe("actpass");
    expect(parsedExpanded.candidates).toEqual(parsedOriginal.candidates);
  });

  it("minifies Firefox answer and round trips properly", () => {
    const sdp = loadFixture("firefox-answer.sdp");
    const minified = minifySdp(sdp, "answer");

    expect(minified.length).toBeLessThan(300);

    const expanded = expandSdp(minified);
    const parsedOriginal = parseSdp(sdp, "answer");
    const parsedExpanded = parseSdp(expanded, "answer");

    expect(parsedExpanded.ufrag).toBe(parsedOriginal.ufrag);
    expect(parsedExpanded.pwd).toBe(parsedOriginal.pwd);
    expect(parsedExpanded.fingerprint).toBe(parsedOriginal.fingerprint);
    expect(parsedExpanded.setup).toBe("active");
    expect(parsedExpanded.candidates).toEqual(parsedOriginal.candidates);
  });

  it("supports IPv6 candidates", () => {
    const rawSdp = [
      "v=0",
      "o=- 11223344 2 IN IP4 127.0.0.1",
      "s=-",
      "t=0 0",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "c=IN IP6 ::",
      "a=candidate:1 1 udp 2122260223 2001:db8::1 54321 typ host",
      "a=candidate:2 1 udp 1686052607 2001:db8::2 54321 typ srflx raddr 2001:db8::1 rport 54321",
      "a=ice-ufrag:ipv6ufrag",
      "a=ice-pwd:0123456789abcdef0123456789ab",
      "a=fingerprint:sha-256 12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0",
      "a=setup:actpass",
      "a=sctp-port:5000",
    ].join("\r\n");

    const minified = minifySdp(rawSdp, "offer");
    expect(minified.length).toBeLessThan(300);

    const expanded = expandSdp(minified);
    const parsed = parseSdp(expanded, "offer");
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0].ip).toBe("2001:db8:0:0:0:0:0:1");
    expect(parsed.candidates[0].type).toBe("host");
    expect(parsed.candidates[1].ip).toBe("2001:db8:0:0:0:0:0:2");
    expect(parsed.candidates[1].type).toBe("srflx");
  });
});
