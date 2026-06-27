import {
  SourceObjectNotFoundError,
  sourceBytesToArrayBuffer,
  type SourceObjectStorage
} from "./source-object-storage.js";

type StoredObject = {
  bytes: ArrayBuffer;
  contentType?: string;
  metadata?: Record<string, string>;
};

export class MemorySourceObjectStorage implements SourceObjectStorage {
  private readonly objects = new Map<string, StoredObject>();

  async putObject(input: {
    key: string;
    bytes: Uint8Array | ArrayBuffer | Blob;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ key: string; sizeBytes: number }> {
    const bytes = await sourceBytesToArrayBuffer(input.bytes);
    this.objects.set(input.key, {
      bytes,
      ...(input.contentType ? { contentType: input.contentType } : {}),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {})
    });
    return { key: input.key, sizeBytes: bytes.byteLength };
  }

  async getObject(key: string): Promise<{
    bytes: ArrayBuffer;
    contentType?: string;
    sizeBytes?: number;
  }> {
    const object = this.objects.get(key);
    if (!object) throw new SourceObjectNotFoundError(key);
    return {
      bytes: object.bytes.slice(0),
      ...(object.contentType ? { contentType: object.contentType } : {}),
      sizeBytes: object.bytes.byteLength
    };
  }

  async headObject(key: string): Promise<{
    exists: boolean;
    contentType?: string;
    sizeBytes?: number;
  }> {
    const object = this.objects.get(key);
    if (!object) return { exists: false };
    return {
      exists: true,
      ...(object.contentType ? { contentType: object.contentType } : {}),
      sizeBytes: object.bytes.byteLength
    };
  }

  async deleteObject(key: string): Promise<{ deleted: boolean }> {
    return { deleted: this.objects.delete(key) };
  }
}
