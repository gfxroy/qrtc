import { Zip, ZipDeflate, zipSync } from "fflate";

export interface ZipFileInput {
  name: string;
  relativePath?: string;
  data?: Uint8Array;
  blob?: Blob;
}

/**
 * Creates a ZIP archive from multiple files, preserving relative directory paths.
 * Uses fflate's streaming Zip to avoid high memory spikes.
 */
export async function createZipArchive(files: ZipFileInput[]): Promise<Blob> {
  if (files.length === 0) {
    return new Blob([zipSync({})], { type: "application/zip" });
  }

  return new Promise<Blob>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let zipFailed = false;

    const zip = new Zip((err, chunk, final) => {
      if (err) {
        zipFailed = true;
        reject(err);
        return;
      }
      if (chunk) {
        chunks.push(chunk);
      }
      if (final && !zipFailed) {
        resolve(new Blob(chunks as any, { type: "application/zip" }));
      }
    });

    (async () => {
      try {
        for (const f of files) {
          const path = (f.relativePath || f.name).replace(/^\/+/, "");
          const fileStream = new ZipDeflate(path, { level: 6 });
          zip.add(fileStream);

          if (f.data) {
            fileStream.push(f.data, true);
          } else if (f.blob) {
            const buffer = await f.blob.arrayBuffer();
            fileStream.push(new Uint8Array(buffer), true);
          } else {
            fileStream.push(new Uint8Array(0), true);
          }
        }
        zip.end();
      } catch (e) {
        reject(e);
      }
    })();
  });
}
