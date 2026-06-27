import type { ReadingLocalCache } from "@ss/shared";
import type { ReadingCacheAdapter } from "./reading-cache-adapter.js";
import { ReadingCacheError } from "./reading-cache-adapter.js";
import type { ReadingSyncJob } from "../features/reading-sync/types.js";
import {
  createMangaSourceManifest,
  createNovelSourceManifest
} from "../features/source-identity/source-manifest.js";

const STORE = "reading-cache";
const SYNC_JOB_STORE = "sync-jobs";

export class IndexedDbReadingCache implements ReadingCacheAdapter {
  constructor(private readonly databaseName = "ss-reading-nest") {}

  async isAvailable(): Promise<boolean> {
    return typeof indexedDB !== "undefined";
  }

  async get(sessionId: string): Promise<ReadingLocalCache | null> {
    const database = await this.open();
    const cache = await new Promise<ReadingLocalCache | null>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(sessionId);
      request.onsuccess = () => {
        database.close();
        resolve((request.result as ReadingLocalCache | undefined) ?? null);
      };
      request.onerror = () => {
        database.close();
        reject(new ReadingCacheError("CACHE_UNAVAILABLE", "本设备缓存暂时无法读取。"));
      };
    });
    if (!cache || cache.metadata.sourceManifest) return cache;
    const repaired = await repairLegacyCache(cache);
    await this.put(repaired);
    return repaired;
  }

  async put(cache: ReadingLocalCache): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(cache, cache.metadata.sessionId);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(
          new ReadingCacheError(
            "CACHE_WRITE_FAILED",
            cache.metadata.type === "novel"
              ? "正文缓存写入失败，请保留原文并稍后重试。"
              : "漫画图片缓存不可用，请重新导入漫画图片继续。"
          )
        );
      };
    });
  }

  async remove(sessionId: string): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(sessionId);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(new ReadingCacheError("CACHE_UNAVAILABLE", "本设备缓存暂时无法清除。"));
      };
    });
  }

  async getSyncJob(sessionId: string): Promise<ReadingSyncJob | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(SYNC_JOB_STORE, "readonly")
        .objectStore(SYNC_JOB_STORE)
        .get(sessionId);
      request.onsuccess = () => {
        database.close();
        resolve((request.result as ReadingSyncJob | undefined) ?? null);
      };
      request.onerror = () => {
        database.close();
        reject(new ReadingCacheError("CACHE_UNAVAILABLE", "补课进度暂时无法读取。"));
      };
    });
  }

  async putSyncJob(job: ReadingSyncJob): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(SYNC_JOB_STORE, "readwrite");
      transaction.objectStore(SYNC_JOB_STORE).put(job, job.sessionId);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(new ReadingCacheError("CACHE_WRITE_FAILED", "补课进度保存失败，请稍后重试。"));
      };
    });
  }

  async removeSyncJob(sessionId: string): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(SYNC_JOB_STORE, "readwrite");
      transaction.objectStore(SYNC_JOB_STORE).delete(sessionId);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(new ReadingCacheError("CACHE_UNAVAILABLE", "补课进度暂时无法清除。"));
      };
    });
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new ReadingCacheError("CACHE_UNAVAILABLE", "当前环境不支持本设备缓存。"));
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
        if (!request.result.objectStoreNames.contains(SYNC_JOB_STORE)) {
          request.result.createObjectStore(SYNC_JOB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new ReadingCacheError("CACHE_UNAVAILABLE", "当前环境不支持本设备缓存。"));
    });
  }
}

async function repairLegacyCache(cache: ReadingLocalCache): Promise<ReadingLocalCache> {
  const sourceId = `legacy-${cache.metadata.sessionId}`;
  if ("sourceText" in cache) {
    return {
      ...cache,
      metadata: {
        ...cache.metadata,
        cacheVersion: 2,
        sourceManifest: await createNovelSourceManifest({
          sourceId,
          sourceKind: "pasted_text",
          title: cache.metadata.title,
          sourceText: cache.sourceText
        })
      }
    };
  }
  return {
    ...cache,
    metadata: {
      ...cache.metadata,
      cacheVersion: 2,
      sourceManifest: await createMangaSourceManifest({
        sourceId,
        title: cache.metadata.title,
        pages: cache.pages.map((page) => page.blob)
      })
    }
  };
}
