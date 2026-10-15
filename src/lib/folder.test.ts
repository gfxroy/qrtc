import { describe, expect, it } from "vitest";
import { extractFilesFromDataTransfer, extractFilesFromInput } from "./folder.ts";

describe("folder directory extraction", () => {
  it("extracts files from FileList with webkitRelativePath", () => {
    const mockFile1 = new File(["test1"], "file1.txt", { type: "text/plain" });
    Object.defineProperty(mockFile1, "webkitRelativePath", { value: "project/src/file1.txt" });

    const mockFile2 = new File(["test2"], "file2.txt", { type: "text/plain" });

    const mockFileList = [mockFile1, mockFile2] as unknown as FileList;
    const result = extractFilesFromInput(mockFileList);

    expect(result).toHaveLength(2);
    expect(result[0].relativePath).toBe("project/src/file1.txt");
    expect(result[1].relativePath).toBe("file2.txt");
  });

  it("extracts files using webkitGetAsEntry mock tree", async () => {
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      name: "hello.txt",
      fullPath: "/my-folder/hello.txt",
      file: (cb: (f: File) => void) => cb(new File(["content"], "hello.txt")),
    };

    const dirEntry = {
      isFile: false,
      isDirectory: true,
      name: "my-folder",
      fullPath: "/my-folder",
      createReader: () => {
        let called = false;
        return {
          readEntries: (cb: (entries: any[]) => void) => {
            if (!called) {
              called = true;
              cb([fileEntry]);
            } else {
              cb([]);
            }
          },
        };
      },
    };

    const mockDataTransfer = {
      items: [
        {
          kind: "file",
          webkitGetAsEntry: () => dirEntry,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    const result = await extractFilesFromDataTransfer(mockDataTransfer);
    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe("my-folder/hello.txt");
    expect(result[0].file.name).toBe("hello.txt");
  });

  it("falls back to standard files list when webkitGetAsEntry is unavailable", async () => {
    const mockFile = new File(["fallback"], "readme.md");
    const mockDataTransfer = {
      items: [],
      files: [mockFile],
    } as unknown as DataTransfer;

    const result = await extractFilesFromDataTransfer(mockDataTransfer);
    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe("readme.md");
  });
});
