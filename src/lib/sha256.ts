// Pure TypeScript streaming SHA-256 implementation (FIPS 180-4)
// Zero external dependencies, supports incremental chunk updates.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

export class IncrementalSha256 {
  private h: Uint32Array;
  private buffer: Uint8Array;
  private bufferLength: number;
  private totalBytes: bigint;
  private w: Uint32Array;
  private finalized: boolean;

  constructor() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.totalBytes = 0n;
    this.w = new Uint32Array(64);
    this.finalized = false;
  }

  public update(chunk: Uint8Array | ArrayBuffer | string): this {
    if (this.finalized) {
      throw new Error("Cannot update after digest has been computed");
    }

    let bytes: Uint8Array;
    if (typeof chunk === "string") {
      bytes = new TextEncoder().encode(chunk);
    } else if (chunk instanceof ArrayBuffer) {
      bytes = new Uint8Array(chunk);
    } else {
      bytes = chunk;
    }

    let offset = 0;
    const len = bytes.length;
    this.totalBytes += BigInt(len);

    if (this.bufferLength > 0) {
      const needed = 64 - this.bufferLength;
      if (len >= needed) {
        this.buffer.set(bytes.subarray(0, needed), this.bufferLength);
        this.processBlock(this.buffer, 0);
        this.bufferLength = 0;
        offset = needed;
      } else {
        this.buffer.set(bytes, this.bufferLength);
        this.bufferLength += len;
        return this;
      }
    }

    while (offset + 64 <= len) {
      this.processBlock(bytes, offset);
      offset += 64;
    }

    const remaining = len - offset;
    if (remaining > 0) {
      this.buffer.set(bytes.subarray(offset), 0);
      this.bufferLength = remaining;
    }

    return this;
  }

  private processBlock(data: Uint8Array, offset: number): void {
    const w = this.w;
    const view = new DataView(data.buffer, data.byteOffset + offset, 64);

    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(i * 4, false);
    }

    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = ((w[i - 16] + s0) | 0) + ((w[i - 7] + s1) | 0) | 0;
    }

    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    let e = this.h[4];
    let f = this.h[5];
    let g = this.h[6];
    let h = this.h[7];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i] + w[i]) | 0;
      const s0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + h) | 0;
  }

  public digest(): Uint8Array {
    if (this.finalized) {
      throw new Error("Digest already computed");
    }
    this.finalized = true;

    // Pad message
    const totalBits = this.totalBytes * 8n;
    this.buffer[this.bufferLength] = 0x80;
    this.bufferLength++;

    if (this.bufferLength > 56) {
      this.buffer.fill(0, this.bufferLength);
      this.processBlock(this.buffer, 0);
      this.bufferLength = 0;
    }

    this.buffer.fill(0, this.bufferLength, 56);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, 64);
    view.setBigUint64(56, totalBits, false);
    this.processBlock(this.buffer, 0);

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer, out.byteOffset, 32);
    for (let i = 0; i < 8; i++) {
      outView.setUint32(i * 4, this.h[i], false);
    }
    return out;
  }

  public digestHex(): string {
    const bytes = this.digest();
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  public static hash(data: Uint8Array | ArrayBuffer | string): string {
    return new IncrementalSha256().update(data).digestHex();
  }
}
