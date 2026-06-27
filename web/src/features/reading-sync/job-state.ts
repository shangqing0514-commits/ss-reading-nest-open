import type { ReadingSyncJob, SyncBatch } from "./types.js";

export function getActiveBatch(job: ReadingSyncJob): SyncBatch | undefined {
  return job.batches[job.activeBatchIndex];
}

export function markBatchSent(job: ReadingSyncJob, batchId: string): ReadingSyncJob {
  return updateActiveBatch(job, batchId, (batch) => {
    if (batch.status !== "pending" && batch.status !== "failed") {
      throw new Error("Only pending or failed batches can be sent");
    }
    return { ...batch, status: "sent-awaiting-confirmation" };
  });
}

export function markBatchConfirmed(job: ReadingSyncJob, batchId: string): ReadingSyncJob {
  const active = getRequiredActiveBatch(job, batchId);
  if (active.status !== "sent-awaiting-confirmation") {
    throw new Error("Batch must be awaiting confirmation");
  }
  const batches = job.batches.map((batch) =>
    batch.id === batchId ? { ...batch, status: "confirmed" as const } : batch
  );
  return {
    ...job,
    batches,
    activeBatchIndex: Math.min(job.activeBatchIndex + 1, batches.length),
    confirmedThrough: {
      kind: job.targetPosition.kind,
      index: active.rangeEnd,
      label: positionLabel(job.targetPosition.kind, active.rangeEnd)
    }
  };
}

export function markBatchFailed(job: ReadingSyncJob, batchId: string): ReadingSyncJob {
  return updateActiveBatch(job, batchId, (batch) => ({ ...batch, status: "failed" }));
}

export function cancelSyncJob(job: ReadingSyncJob): ReadingSyncJob {
  return { ...job, cancelled: true };
}

function updateActiveBatch(
  job: ReadingSyncJob,
  batchId: string,
  change: (batch: SyncBatch) => SyncBatch
): ReadingSyncJob {
  getRequiredActiveBatch(job, batchId);
  return {
    ...job,
    batches: job.batches.map((batch) => (batch.id === batchId ? change(batch) : batch))
  };
}

function getRequiredActiveBatch(job: ReadingSyncJob, batchId: string) {
  const active = getActiveBatch(job);
  if (!active || active.id !== batchId) throw new Error("Batch is not active");
  return active;
}

function positionLabel(kind: "paragraph" | "page", index: number) {
  return kind === "paragraph" ? `第 ${index} 段` : `第 ${index} 页`;
}
