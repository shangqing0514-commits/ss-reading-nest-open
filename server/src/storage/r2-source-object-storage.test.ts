import { describe, expect, it, vi } from "vitest";
import { R2SourceObjectStorage } from "./r2-source-object-storage.js";

describe("R2SourceObjectStorage", () => {
  it("wraps R2 put/get/head/delete without public URLs", async () => {
    const objectBody = new TextEncoder().encode("hello").buffer;
    const bucket = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(objectBody),
        httpMetadata: { contentType: "text/plain" },
        size: 5
      }),
      head: vi.fn().mockResolvedValue({
        httpMetadata: { contentType: "text/plain" },
        size: 5
      }),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const storage = new R2SourceObjectStorage(bucket as unknown as R2Bucket);
    const key = "private/sources/source-1/source.txt";

    await expect(
      storage.putObject({
        key,
        bytes: new TextEncoder().encode("hello"),
        contentType: "text/plain"
      })
    ).resolves.toEqual({ key, sizeBytes: 5 });
    expect(bucket.put).toHaveBeenCalledWith(
      key,
      expect.any(ArrayBuffer),
      { httpMetadata: { contentType: "text/plain" } }
    );

    await expect(storage.headObject(key)).resolves.toEqual({
      exists: true,
      contentType: "text/plain",
      sizeBytes: 5
    });
    expect(bucket.head).toHaveBeenCalledWith(key);

    const restored = await storage.getObject(key);
    expect(new TextDecoder().decode(restored.bytes)).toBe("hello");
    expect(restored).not.toHaveProperty("publicUrl");
    expect(restored).not.toHaveProperty("signedUrl");
    expect(bucket.get).toHaveBeenCalledWith(key);

    await expect(storage.deleteObject(key)).resolves.toEqual({ deleted: true });
    expect(bucket.delete).toHaveBeenCalledWith(key);
  });

  it("has explicit missing-object behavior", async () => {
    const bucket = {
      put: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      head: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined)
    };
    const storage = new R2SourceObjectStorage(bucket as unknown as R2Bucket);

    await expect(storage.headObject("missing")).resolves.toEqual({ exists: false });
    await expect(storage.getObject("missing")).rejects.toThrow("Source object not found");
    await expect(storage.deleteObject("missing")).resolves.toEqual({ deleted: true });
  });
});
