export interface DiscoveredFile {
  file: File;
  relativePath: string;
}

/**
 * Reads all entries from a FileSystemDirectoryReader.
 * Chromium requires calling readEntries repeatedly until it returns an empty array.
 */
function readAllDirectoryEntries(dirReader: any): Promise<any[]> {
  const allEntries: any[] = [];
  return new Promise((resolve, reject) => {
    function readBatch() {
      dirReader.readEntries(
        (entries: any[]) => {
          if (!entries || entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        },
        (error: any) => reject(error)
      );
    }
    readBatch();
  });
}

/**
 * Recursively traverses a FileSystemEntry (File or Directory).
 */
async function traverseEntry(entry: any, basePath: string = ""): Promise<DiscoveredFile[]> {
  if (!entry) return [];

  if (entry.isFile) {
    return new Promise<DiscoveredFile[]>((resolve, reject) => {
      entry.file(
        (f: File) => {
          const relativePath = entry.fullPath
            ? entry.fullPath.replace(/^\/+/, "")
            : basePath
            ? `${basePath}/${f.name}`
            : f.name;
          resolve([{ file: f, relativePath }]);
        },
        (err: any) => reject(err)
      );
    });
  }

  if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const children = await readAllDirectoryEntries(dirReader);
    const results: DiscoveredFile[] = [];
    const childPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    for (const child of children) {
      const childFiles = await traverseEntry(child, childPath);
      results.push(...childFiles);
    }
    return results;
  }

  return [];
}

/**
 * Extracts all files from a DataTransfer, recursively exploring directories
 * if webkitGetAsEntry() is supported.
 */
export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<DiscoveredFile[]> {
  const items = dataTransfer.items;
  const discovered: DiscoveredFile[] = [];

  if (items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === "function") {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;
      const entry = (item as any).webkitGetAsEntry();
      if (entry) {
        const files = await traverseEntry(entry);
        discovered.push(...files);
      }
    }
    if (discovered.length > 0) {
      return discovered;
    }
  }

  // Fallback to standard dataTransfer.files
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const f = dataTransfer.files[i];
      const relPath = (f as any).webkitRelativePath || f.name;
      discovered.push({ file: f, relativePath: relPath });
    }
  }

  return discovered;
}

/**
 * Converts a standard FileList (e.g. from <input type="file" multiple webkitdirectory>)
 * into an array of DiscoveredFiles with relative paths preserved.
 */
export function extractFilesFromInput(fileList: FileList): DiscoveredFile[] {
  const files: DiscoveredFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    const relPath = (f as any).webkitRelativePath || f.name;
    files.push({ file: f, relativePath: relPath });
  }
  return files;
}
