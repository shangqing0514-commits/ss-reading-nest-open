import { describe, expect, it } from "vitest";
import { MemorySourceObjectStorage } from "./memory-source-object-storage.js";

describe("MemorySourceObjectStorage", () => {
  it("supports put, head, get, and delete without public URLs", async () => {
    const storage = new MemorySourceObjectStorage();
    const key = "private/sources/source-1/source.txt";

    await expect(
      storage.putObject({
        key,
        bytes: new TextEncoder().encode("hello"),
        contentType: "text/plain"
      })
    ).resolves.toEqual({ key, sizeBytes: 5 });

    await expect(storage.headObject(key)).resolves.toMatchObject({
      exists: true,
      contentType: "text/plain",
      sizeBytes: 5
    });

    const restored = await storage.getObject(key);
    expect(new TextDecoder().decode(restored.bytes)).toBe("hello");
    expect(restored).not.toHaveProperty("publicUrl");
    expect(restored).not.toHaveProperty("signedUrl");

    await expect(storage.deleteObject(key)).resolves.toEqual({ deleted: true });
    await expect(storage.headObject(key)).resolves.toEqual({ exists: false });
  });

  it("has explicit missing-object behavior", async () => {
    const storage = new MemorySourceObjectStorage();

    await expect(storage.headObject("missing")).resolves.toEqual({ exists: false });
    await expect(storage.deleteObject("missing")).resolves.toEqual({ deleted: false });
    await expect(storage.getObject("missing")).rejects.toThrow("Source object not found");
  });
});
