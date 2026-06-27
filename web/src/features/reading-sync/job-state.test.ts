import { describe, expect, it } from "vitest";
import {
  cancelSyncJob,
  getActiveBatch,
  markBatchConfirmed,
  markBatchFailed,
  markBatchSent
} from "./job-state.js";
import type { ReadingSyncJob } from "./types.js";

const makeJob = (): ReadingSyncJob => ({
  sessionId: "session-1",
  title: "测试小说",
  type: "novel",
  mode: "range_sync",
  targetPosition: { kind: "paragraph", index: 14, label: "第 14 段" },
  confirmedThrough: { kind: "paragraph", index: 2, label: "第 2 段" },
  batches: [
    {
      id: "batch-1",
      ordinal: 1,
      totalBatches: 2,
      rangeStart: 3,
      rangeEnd: 8,
      characterCount: 10,
      text: "batch one",
      isFinal: false,
      oversizedParagraph: false,
      status: "pending"
    },
    {
      id: "batch-2",
      ordinal: 2,
      totalBatches: 2,
      rangeStart: 9,
      rangeEnd: 14,
      characterCount: 10,
      text: "batch two",
      isFinal: true,
      oversizedParagraph: false,
      status: "pending"
    }
  ],
  activeBatchIndex: 0,
  createdAt: "2026-06-22T00:00:00.000Z"
});

describe("sync job transitions", () => {
  it("moves an active batch from pending to sent to confirmed", () => {
    const sent = markBatchSent(makeJob(), "batch-1");
    expect(getActiveBatch(sent)?.status).toBe("sent-awaiting-confirmation");

    const confirmed = markBatchConfirmed(sent, "batch-1");
    expect(confirmed.batches[0]?.status).toBe("confirmed");
    expect(confirmed.activeBatchIndex).toBe(1);
    expect(confirmed.confirmedThrough?.index).toBe(8);
  });

  it("rejects confirmation before a batch is awaiting confirmation", () => {
    expect(() => markBatchConfirmed(makeJob(), "batch-1")).toThrow();
  });

  it("marks failures and cancellation without advancing confirmedThrough", () => {
    const failed = markBatchFailed(makeJob(), "batch-1");
    expect(failed.batches[0]?.status).toBe("failed");
    expect(failed.confirmedThrough?.index).toBe(2);

    const cancelled = cancelSyncJob(failed);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.confirmedThrough?.index).toBe(2);
  });
});
