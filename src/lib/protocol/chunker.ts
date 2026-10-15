export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB

export type BinaryDataSource = Blob | File | Uint8Array | ArrayBuffer;

export function getDataSourceSize(source: BinaryDataSource): number {
  if (source instanceof Uint8Array) {
    return source.byteLength;
  }
  if (source instanceof ArrayBuffer) {
    return source.byteLength;
  }
  return source.size;
}

export function getTotalChunks(size: number, chunkSize: number = DEFAULT_CHUNK_SIZE): number {
  if (size === 0) return 1;
  return Math.ceil(size / chunkSize);
}

export async function* chunkDataSource(
  source: BinaryDataSource,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): AsyncGenerator<Uint8Array, void, unknown> {
  const totalSize = getDataSourceSize(source);

  if (totalSize === 0) {
    yield new Uint8Array(0);
    return;
  }

  if (source instanceof Uint8Array) {
    for (let offset = 0; offset < totalSize; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, totalSize);
      yield source.subarray(offset, end);
    }
    return;
  }

  if (source instanceof ArrayBuffer) {
    const uint8 = new Uint8Array(source);
    for (let offset = 0; offset < totalSize; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, totalSize);
      yield uint8.subarray(offset, end);
    }
    return;
  }

  // Blob / File
  for (let offset = 0; offset < totalSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    const slice = source.slice(offset, end);
    const buffer = await slice.arrayBuffer();
    yield new Uint8Array(buffer);
  }
}
