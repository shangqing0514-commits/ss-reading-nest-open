import {
  SourceObjectNotFoundError,
  sourceBytesToArrayBuffer,
  type SourceObjectStorage
} from "./source-object-storage.js";

export class R2SourceObjectStorage implements SourceObjectStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async putObject(input: {
    key: string;
    bytes: Uint8Array | ArrayBuffer | Blob;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ key: string; sizeBytes: number }> {
    const bytes = await sourceBytesToArrayBuffer(input.bytes);
    await this.bucket.put(input.key, bytes, {
      ...(input.contentType
        ? { httpMetadata: { contentType: input.contentType } }
        : {}),
      ...(input.metadata ? { customMetadata: input.metadata } : {})
    });
    return { key: input.key, sizeBytes: bytes.byteLength };
  }

  async getObject(key: string): Promise<{
    bytes: ArrayBuffer;
    contentType?: string;
    sizeBytes?: number;
  }> {
    const object = await this.bucket.get(key);
    if (!object) throw new SourceObjectNotFoundError(key);
    const bytes = await object.arrayBuffer();
    return {
      bytes,
      ...(object.httpMetadata?.contentType
        ? { contentType: object.httpMetadata.contentType }
        : {}),
      sizeBytes: object.size ?? bytes.byteLength
    };
  }

  async headObject(key: string): Promise<{
    exists: boolean;
    contentType?: string;
    sizeBytes?: number;
  }> {
    const object = await this.bucket.head(key);
    if (!object) return { exists: false };
    return {
      exists: true,
      ...(object.httpMetadata?.contentType
        ? { contentType: object.httpMetadata.contentType }
        : {}),
      ...(object.size !== undefined ? { sizeBytes: object.size } : {})
    };
  }

  async deleteObject(key: string): Promise<{ deleted: boolean }> {
    await this.bucket.delete(key);
    return { deleted: true };
  }
}
