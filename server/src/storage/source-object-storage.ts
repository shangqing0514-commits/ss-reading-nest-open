export interface SourceObjectStorage {
  putObject(input: {
    key: string;
    bytes: Uint8Array | ArrayBuffer | Blob;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ key: string; sizeBytes: number }>;

  getObject(key: string): Promise<{
    bytes: ArrayBuffer;
    contentType?: string;
    sizeBytes?: number;
  }>;

  headObject(key: string): Promise<{
    exists: boolean;
    contentType?: string;
    sizeBytes?: number;
  }>;

  deleteObject(key: string): Promise<{ deleted: boolean }>;
}

export class SourceObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Source object not found: ${key}`);
    this.name = "SourceObjectNotFoundError";
  }
}

export async function sourceBytesToArrayBuffer(
  bytes: Uint8Array | ArrayBuffer | Blob
): Promise<ArrayBuffer> {
  if (bytes instanceof ArrayBuffer) return bytes.slice(0);
  if (bytes instanceof Uint8Array) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }
  return bytes.arrayBuffer();
}
