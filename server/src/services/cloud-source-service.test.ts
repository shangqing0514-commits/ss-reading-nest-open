import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { MemorySourceObjectStorage } from "../storage/memory-source-object-storage.js";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { CloudSourceService } from "./cloud-source-service.js";
import {
  DEFAULT_SESSION_PREFERENCES,
  NOVEL_SEGMENTATION_VERSION,
  type ReadingDatabase
} from "@ss/shared";

const NOW = "2026-06-24T00:00:00.000Z";

describe("CloudSourceService", () => {
  it("uploads novel text to R2 objects and stores only metadata in D1 state", async () => {
    const { cloudSource, repository, storage, sessionId } = setup();

    const result = await cloudSource.uploadNovelSource({
      sessionId,
      sourceText: "第一段\r\n\r\n第二段",
      sourceKind: "pasted_text",
      title: "测试书"
    });

    expect(result.sourceManifest).toMatchObject({
      sourceKind: "pasted_text",
      title: "测试书",
      segmentationVersion: NOVEL_SEGMENTATION_VERSION,
      paragraphCount: 1,
      cloudSync: {
        enabled: true,
        provider: "r2",
        objectKey: `private/sources/${result.sourceManifest.sourceId}/source.txt`,
        manifestObjectKey: `private/sources/${result.sourceManifest.sourceId}/manifest.json`,
        uploadedAt: NOW,
        sizeBytes: new TextEncoder().encode("第一段\n\n第二段").byteLength,
        mimeType: "text/plain;charset=utf-8"
      }
    });
    expect(result.sourceManifest.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const sourceObject = await storage.getObject(result.sourceManifest.cloudSync.objectKey!);
    expect(new TextDecoder().decode(sourceObject.bytes)).toBe("第一段\n\n第二段");
    const manifestObject = await storage.getObject(
      result.sourceManifest.cloudSync.manifestObjectKey!
    );
    expect(JSON.parse(new TextDecoder().decode(manifestObject.bytes))).toMatchObject({
      sourceId: result.sourceManifest.sourceId,
      contentHash: result.sourceManifest.contentHash,
      paragraphCount: 1
    });

    const stored = JSON.stringify(await repository.read());
    expect(stored).toContain(result.sourceManifest.cloudSync.objectKey!);
    expect(stored).not.toContain("第一段");
    expect(stored).not.toContain("第二段");
  });

  it("counts numbered platform-style novel sections as separate cloud reading units", async () => {
    const { cloudSource, sessionId } = setup();

    const result = await cloudSource.uploadNovelSource({
      sessionId,
      sourceText: ["开头。", "1.", "第一节。", "2.", "第二节。"].join("\n"),
      sourceKind: "pasted_text",
      title: "平台文"
    });

    expect(result.sourceManifest.paragraphCount).toBe(3);
  });

  it("restores novel text only after hash and paragraph validation passes", async () => {
    const { cloudSource, sessionId } = setup();
    const uploaded = await cloudSource.uploadNovelSource({
      sessionId,
      sourceText: "第一段\n\n第二段",
      sourceKind: "pasted_text",
      title: "测试书"
    });

    const restored = await cloudSource.restoreNovelSource(sessionId);

    expect(restored.sourceText).toBe("第一段\n\n第二段");
    expect(restored.sourceManifest.contentHash).toBe(uploaded.sourceManifest.contentHash);
    expect(restored.sourceManifest.paragraphCount).toBe(1);
  });

  it("fails restore when cloud sync is disabled, source object is missing, or content mismatches", async () => {
    const { cloudSource, repository, storage, sessionId } = setup();

    await expect(cloudSource.restoreNovelSource(sessionId)).rejects.toMatchObject({
      code: "INVALID_OPERATION"
    });

    const uploaded = await cloudSource.uploadNovelSource({
      sessionId,
      sourceText: "第一段\n\n第二段",
      sourceKind: "pasted_text",
      title: "测试书"
    });
    await storage.deleteObject(uploaded.sourceManifest.cloudSync.objectKey!);
    await expect(cloudSource.restoreNovelSource(sessionId)).rejects.toMatchObject({
      code: "INVALID_OPERATION"
    });

    await storage.putObject({
      key: uploaded.sourceManifest.cloudSync.objectKey!,
      bytes: new TextEncoder().encode("被篡改的正文"),
      contentType: "text/plain;charset=utf-8"
    });
    await expect(cloudSource.restoreNovelSource(sessionId)).rejects.toMatchObject({
      code: "INVALID_OPERATION"
    });

    const stored = JSON.stringify(await repository.read());
    expect(stored).not.toContain("被篡改的正文");
  });

  it("reports metadata-only cloud status", async () => {
    const { cloudSource, storage, sessionId } = setup();

    await expect(cloudSource.getCloudSourceStatus(sessionId)).resolves.toEqual({
      status: "disabled"
    });
    const uploaded = await cloudSource.uploadNovelSource({
      sessionId,
      sourceText: "第一段\n\n第二段",
      sourceKind: "pasted_text",
      title: "测试书"
    });
    await expect(cloudSource.getCloudSourceStatus(sessionId)).resolves.toEqual({
      status: "available"
    });
    await storage.deleteObject(uploaded.sourceManifest.cloudSync.objectKey!);
    await expect(cloudSource.getCloudSourceStatus(sessionId)).resolves.toEqual({
      status: "missing"
    });

    expect(JSON.stringify(await cloudSource.getCloudSourceStatus(sessionId))).not.toMatch(
      /第一段|publicUrl|signedUrl/
    );
  });

  it("deletes cloud source objects without deleting the D1 session or returning URLs", async () => {
    const { cloudSource, repository, storage, sessionId } = setup();
    const uploaded = await cloudSource.uploadNovelSource({
      sessionId,
      sourceText: "第一段\n\n第二段",
      sourceKind: "pasted_text",
      title: "测试书"
    });

    const result = await cloudSource.deleteCloudSource(sessionId);

    expect(result).toMatchObject({ deleted: true, cloudSourceDeleted: true });
    await expect(storage.headObject(uploaded.sourceManifest.cloudSync.objectKey!)).resolves.toEqual({
      exists: false
    });
    await expect(
      storage.headObject(uploaded.sourceManifest.cloudSync.manifestObjectKey!)
    ).resolves.toEqual({ exists: false });
    expect((await repository.read()).sessions.some((session) => session.id === sessionId)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/第一段|publicUrl|signedUrl/);
  });

  it("deletes manga page objects and manifest without deleting unrelated source objects", async () => {
    const repository = new MemoryReadingRepository();
    const storage = new MemorySourceObjectStorage();
    const ids = ["source-1", "source-2"];
    const cloudSource = new CloudSourceService(repository, storage, {
      now: () => new Date(NOW),
      id: () => ids.shift() ?? "source-extra"
    });
    const sessionId = "session-1";
    const first = await cloudSource.uploadMangaSource({
      sessionId,
      title: "同名漫画",
      pages: [{ index: 1, bytes: new Uint8Array([1]), mimeType: "image/png" }]
    });
    await repository.mutate((database) => {
      database.sessions.push({
        ...database.sessions[0],
        id: "session-2",
        title: "同名漫画",
        sourceManifest: null
      });
    });
    const second = await cloudSource.uploadMangaSource({
      sessionId: "session-2",
      title: "同名漫画",
      pages: [{ index: 1, bytes: new Uint8Array([1]), mimeType: "image/png" }]
    });

    const result = await cloudSource.deleteCloudSource(sessionId);

    expect(result).toMatchObject({
      deleted: true,
      cloudSourceDeleted: true
    });
    await expect(storage.headObject(first.sourceManifest.cloudSync.pages![0].objectKey)).resolves.toEqual({
      exists: false
    });
    await expect(storage.headObject(first.sourceManifest.cloudSync.manifestObjectKey!)).resolves.toEqual({
      exists: false
    });
    await expect(storage.headObject(second.sourceManifest.cloudSync.pages![0].objectKey)).resolves.toMatchObject({
      exists: true
    });
    expect(JSON.stringify(result)).not.toMatch(/AQ==|data:image|publicUrl|signedUrl/);
  });

  it("reports partial cloud source delete failure without hiding missing-object behavior", async () => {
    const repository = new MemoryReadingRepository();
    const storage = new FailingDeleteStorage("private/sources/source-1/manifest.json");
    const cloudSource = new CloudSourceService(repository, storage, {
      now: () => new Date(NOW),
      id: () => "source-1"
    });
    const uploaded = await cloudSource.uploadNovelSource({
      sessionId: "session-1",
      sourceText: "第一段\n\n第二段",
      sourceKind: "pasted_text",
      title: "测试书"
    });
    await storage.deleteObject(uploaded.sourceManifest.cloudSync.objectKey!);

    const result = await cloudSource.deleteCloudSource("session-1");

    expect(result).toMatchObject({
      cloudSourceDeleted: false
    });
    expect(result.cloudSourceDeleteError).toContain("manifest");
    expect(JSON.stringify(result)).not.toMatch(/第一段|publicUrl|signedUrl/);
  });

  it("uploads manga pages to R2 objects and stores only page metadata in D1 state", async () => {
    const { cloudSource, repository, storage, sessionId } = setup();
    const firstPage = new Uint8Array([1, 2, 3]);
    const secondPage = new Uint8Array([4, 5, 6]);

    const result = await cloudSource.uploadMangaSource({
      sessionId,
      title: "漫画书",
      pages: [
        { index: 1, bytes: firstPage, mimeType: "image/png", fileName: "001.png" },
        { index: 2, bytes: secondPage, mimeType: "image/jpeg", fileName: "002.jpg" }
      ]
    });

    expect(result.sourceManifest).toMatchObject({
      sourceKind: "manga_import",
      title: "漫画书",
      segmentationVersion: NOVEL_SEGMENTATION_VERSION,
      pageCount: 2,
      cloudSync: {
        enabled: true,
        provider: "r2",
        manifestObjectKey: `private/sources/${result.sourceManifest.sourceId}/manifest.json`,
        pages: [
          {
            index: 1,
            objectKey: `private/sources/${result.sourceManifest.sourceId}/pages/1.png`,
            contentHash: sha256Hex(firstPage),
            sizeBytes: 3,
            mimeType: "image/png"
          },
          {
            index: 2,
            objectKey: `private/sources/${result.sourceManifest.sourceId}/pages/2.jpg`,
            contentHash: sha256Hex(secondPage),
            sizeBytes: 3,
            mimeType: "image/jpeg"
          }
        ]
      }
    });
    expect(result.sourceManifest.contentHash).toBe(
      sha256Hex(new TextEncoder().encode([sha256Hex(firstPage), sha256Hex(secondPage)].join("\n")))
    );
    expect(result.sourceManifest.contentHash).not.toBe(
      sha256Hex(new TextEncoder().encode([sha256Hex(secondPage), sha256Hex(firstPage)].join("\n")))
    );

    await expect(storage.getObject(result.sourceManifest.cloudSync.pages![0].objectKey)).resolves.toMatchObject({
      contentType: "image/png",
      sizeBytes: 3
    });
    await expect(storage.getObject(result.sourceManifest.cloudSync.pages![1].objectKey)).resolves.toMatchObject({
      contentType: "image/jpeg",
      sizeBytes: 3
    });
    const manifestObject = await storage.getObject(result.sourceManifest.cloudSync.manifestObjectKey!);
    expect(JSON.parse(new TextDecoder().decode(manifestObject.bytes))).toMatchObject({
      sourceKind: "manga_import",
      pageCount: 2,
      cloudSync: { pages: [{ index: 1 }, { index: 2 }] }
    });

    const stored = JSON.stringify(await repository.read());
    expect(stored).toContain(result.sourceManifest.cloudSync.pages![0].objectKey);
    expect(stored).not.toMatch(/AQID|BAUG|data:image|imageBytes|bytesBase64|publicUrl|signedUrl/);
  });

  it("restores manga pages only after page hash validation passes", async () => {
    const { cloudSource, sessionId } = setup();
    const uploaded = await cloudSource.uploadMangaSource({
      sessionId,
      title: "漫画书",
      pages: [{ index: 1, bytes: new Uint8Array([7, 8, 9]), mimeType: "image/png" }]
    });

    const restored = await cloudSource.restoreMangaPage(sessionId, 1);

    expect(new Uint8Array(restored.bytes)).toEqual(new Uint8Array([7, 8, 9]));
    expect(restored.mimeType).toBe("image/png");
    expect(restored.page).toMatchObject({
      index: 1,
      objectKey: uploaded.sourceManifest.cloudSync.pages![0].objectKey,
      contentHash: sha256Hex(new Uint8Array([7, 8, 9]))
    });
    expect(JSON.stringify(restored)).not.toMatch(/publicUrl|signedUrl|structuredContent/);
  });

  it("fails manga restore for disabled cloud, missing page, missing object, and hash mismatch", async () => {
    const { cloudSource, storage, sessionId } = setup();

    await expect(cloudSource.restoreMangaPage(sessionId, 1)).rejects.toMatchObject({
      code: "INVALID_OPERATION"
    });

    const uploaded = await cloudSource.uploadMangaSource({
      sessionId,
      title: "漫画书",
      pages: [{ index: 1, bytes: new Uint8Array([1]), mimeType: "image/png" }]
    });
    await expect(cloudSource.restoreMangaPage(sessionId, 2)).rejects.toMatchObject({
      code: "INVALID_OPERATION"
    });
    await storage.deleteObject(uploaded.sourceManifest.cloudSync.pages![0].objectKey);
    await expect(cloudSource.restoreMangaPage(sessionId, 1)).rejects.toMatchObject({
      code: "INVALID_OPERATION"
    });

    await storage.putObject({
      key: uploaded.sourceManifest.cloudSync.pages![0].objectKey,
      bytes: new Uint8Array([2]),
      contentType: "image/png"
    });
    await expect(cloudSource.restoreMangaPage(sessionId, 1)).rejects.toMatchObject({
      code: "INVALID_OPERATION"
    });
  });
});

function setup() {
  const repository = new MemoryReadingRepository();
  const sessionId = "session-1";
  const storage = new MemorySourceObjectStorage();
  const cloudSource = new CloudSourceService(repository, storage, {
    now: () => new Date(NOW),
    id: () => "source-1"
  });
  return { cloudSource, repository, storage, sessionId };
}

class MemoryReadingRepository implements ReadingRepository {
  private database: ReadingDatabase = {
    schemaVersion: 4,
    sessions: [
      {
        id: "session-1",
        title: "测试书",
        type: "novel",
        status: "active",
        userCurrentPosition: { kind: "paragraph", index: 1, label: "第 1 段" },
        assistantSyncedPosition: null,
        liveReadingEnabled: false,
        sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
        sourceManifest: null,
        createdAt: NOW,
        updatedAt: NOW,
        lastReadAt: NOW
      }
    ],
    quotes: [],
    reactions: [],
    bookmarks: [],
    companionComments: []
  };

  async read(): Promise<ReadingDatabase> {
    return structuredClone(this.database);
  }

  async mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>): Promise<T> {
    const result = await change(this.database);
    return result;
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class FailingDeleteStorage extends MemorySourceObjectStorage {
  constructor(private readonly failingKey: string) {
    super();
  }

  override async deleteObject(key: string): Promise<{ deleted: boolean }> {
    if (key === this.failingKey) throw new Error("manifest delete failed");
    return super.deleteObject(key);
  }
}
