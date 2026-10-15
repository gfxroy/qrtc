import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { createZipArchive } from "./zip.ts";

describe("createZipArchive", () => {
  it("creates a valid zip archive with multiple files and relative paths", async () => {
    const file1Data = strToU8("Hello world from root file");
    const file2Data = strToU8("Nested content inside docs directory");

    const zipBlob = await createZipArchive([
      { name: "hello.txt", data: file1Data },
      { name: "guide.md", relativePath: "docs/sub/guide.md", data: file2Data },
    ]);

    expect(zipBlob).toBeInstanceOf(Blob);
    expect(zipBlob.type).toBe("application/zip");

    const buffer = await zipBlob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));

    expect(Object.keys(unzipped)).toContain("hello.txt");
    expect(Object.keys(unzipped)).toContain("docs/sub/guide.md");

    expect(strFromU8(unzipped["hello.txt"])).toBe("Hello world from root file");
    expect(strFromU8(unzipped["docs/sub/guide.md"])).toBe("Nested content inside docs directory");
  });

  it("handles empty file list gracefully", async () => {
    const zipBlob = await createZipArchive([]);
    expect(zipBlob).toBeInstanceOf(Blob);
    const buffer = await zipBlob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));
    expect(Object.keys(unzipped)).toEqual([]);
  });
});
