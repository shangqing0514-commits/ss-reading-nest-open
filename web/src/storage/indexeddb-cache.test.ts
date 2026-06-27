import { beforeEach, describe, expect, it } from "vitest";
import { NOVEL_SEGMENTATION_VERSION, type NovelLocalCache } from "@ss/shared";
import { IndexedDbReadingCache } from "./indexeddb-cache.js";
import type { ReadingSyncJob } from "../features/reading-sync/types.js";
import { createNovelSourceManifest } from "../features/source-identity/source-manifest.js";

describe("IndexedDbReadingCache", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("ss-reading-nest-test");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it("stores, restores and removes a novel cache by sessionId", async () => {
    const cache = new IndexedDbReadingCache("ss-reading-nest-test");
    const sourceManifest = await createNovelSourceManifest({
      sourceId: "source-1",
      sourceKind: "pasted_text",
      title: "雨夜里的信",
      sourceText: "第一段。\n\n第二段。"
    });
    const value: NovelLocalCache = {
      metadata: {
        sessionId: "session-1",
        type: "novel",
        title: "雨夜里的信",
        cacheVersion: 2,
        remembered: true,
        itemCount: 2,
        sourceManifest,
        updatedAt: "2026-06-22T10:00:00.000Z"
      },
      sourceText: "第一段。\n\n第二段。",
      chunks: ["第一段。", "第二段。"]
    };

    await cache.put(value);
    expect(await cache.get("session-1")).toEqual(value);
    await cache.remove("session-1");
    expect(await cache.get("session-1")).toBeNull();
  });

  it("repairs old novel cache metadata from device-local source text", async () => {
    const cache = new IndexedDbReadingCache("ss-reading-nest-old-cache-test");
    await cache.put({
      metadata: {
        sessionId: "session-old",
        type: "novel",
        title: "旧缓存",
        cacheVersion: 1,
        remembered: true,
        itemCount: 2,
        updatedAt: "2026-06-22T10:00:00.000Z"
      },
      sourceText: "第一段。\n\n第二段。",
      chunks: ["第一段。", "第二段。"]
    } as unknown as NovelLocalCache);

    const restored = await cache.get("session-old");

    expect(restored?.metadata.sourceManifest).toMatchObject({
      sourceKind: "pasted_text",
      paragraphCount: 1,
      segmentationVersion: NOVEL_SEGMENTATION_VERSION
    });
  });

  it("stores, restores and removes a sync job by sessionId", async () => {
    const cache = new IndexedDbReadingCache("ss-reading-nest-sync-job-test");
    const job: ReadingSyncJob = {
      sessionId: "session-1",
      title: "雨夜里的信",
      type: "novel",
      mode: "range_sync",
      targetPosition: { kind: "paragraph", index: 8, label: "第 8 段" },
      confirmedThrough: { kind: "paragraph", index: 2, label: "第 2 段" },
      batches: [],
      activeBatchIndex: 0,
      createdAt: "2026-06-22T10:00:00.000Z"
    };

    await cache.putSyncJob(job);
    expect(await cache.getSyncJob("session-1")).toEqual(job);
    await cache.removeSyncJob("session-1");
    expect(await cache.getSyncJob("session-1")).toBeNull();
  });
});
