import type { ReadingPosition, ReadingType } from "@ss/shared";

export type SyncBatchStatus =
  | "pending"
  | "sent-awaiting-confirmation"
  | "confirmed"
  | "failed";

export interface SyncBatch {
  id: string;
  ordinal: number;
  totalBatches: number;
  rangeStart: number;
  rangeEnd: number;
  characterCount: number;
  text: string;
  isFinal: boolean;
  oversizedParagraph: boolean;
  status: SyncBatchStatus;
}

export interface ReadingSyncJob {
  sessionId: string;
  title: string;
  type: ReadingType;
  mode: "range_sync" | "current_only" | "recent_only" | "live_reading";
  targetPosition: ReadingPosition;
  confirmedThrough: ReadingPosition | null;
  batches: SyncBatch[];
  activeBatchIndex: number;
  createdAt: string;
  cancelled?: boolean;
}
