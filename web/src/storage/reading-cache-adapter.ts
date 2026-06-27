import type { ReadingLocalCache } from "@ss/shared";
import type { ReadingSyncJob } from "../features/reading-sync/types.js";

export interface ReadingCacheAdapter {
  isAvailable(): Promise<boolean>;
  get(sessionId: string): Promise<ReadingLocalCache | null>;
  put(cache: ReadingLocalCache): Promise<void>;
  remove(sessionId: string): Promise<void>;
  getSyncJob(sessionId: string): Promise<ReadingSyncJob | null>;
  putSyncJob(job: ReadingSyncJob): Promise<void>;
  removeSyncJob(sessionId: string): Promise<void>;
}

export class ReadingCacheError extends Error {
  constructor(
    public readonly code: "CACHE_UNAVAILABLE" | "CACHE_WRITE_FAILED",
    message: string
  ) {
    super(message);
  }
}
