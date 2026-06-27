import type { ReadingLocalCache } from "@ss/shared";
import type { ReadingCacheAdapter } from "./reading-cache-adapter.js";
import type { ReadingSyncJob } from "../features/reading-sync/types.js";

export class MemoryReadingCache implements ReadingCacheAdapter {
  private readonly values = new Map<string, ReadingLocalCache>();
  private readonly syncJobs = new Map<string, ReadingSyncJob>();

  async isAvailable() {
    return true;
  }

  async get(sessionId: string) {
    return this.values.get(sessionId) ?? null;
  }

  async put(cache: ReadingLocalCache) {
    this.values.set(cache.metadata.sessionId, cache);
  }

  async remove(sessionId: string) {
    this.values.delete(sessionId);
  }

  async getSyncJob(sessionId: string) {
    return this.syncJobs.get(sessionId) ?? null;
  }

  async putSyncJob(job: ReadingSyncJob) {
    this.syncJobs.set(job.sessionId, job);
  }

  async removeSyncJob(sessionId: string) {
    this.syncJobs.delete(sessionId);
  }
}
