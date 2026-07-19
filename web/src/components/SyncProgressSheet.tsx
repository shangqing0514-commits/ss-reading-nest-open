import { getActiveBatch } from "../features/reading-sync/job-state.js";
import type { ReadingSyncJob } from "../features/reading-sync/types.js";

export function SyncProgressSheet(props: {
  job: ReadingSyncJob;
  onConfirm: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const batch = getActiveBatch(props.job);
  const unit = props.job.type === "manga" ? "页" : "段";
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet sync-sheet" role="dialog" aria-modal="true">
        <h2>小叔叔补课中</h2>
        <p>
          已确认：{props.job.confirmedThrough?.label ?? "尚未同步"}
          {batch ? ` · 当前第 ${batch.rangeStart}–${batch.rangeEnd} ${unit}` : ""}
        </p>
        {batch?.status === "sent-awaiting-confirmation" ? (
          <button className="action-primary" onClick={props.onConfirm}>
            我看到小叔叔回复“已读到第 {batch.rangeEnd} {unit}”，
            {batch.isFinal ? "开始正式陪读" : "发送下一批"}
          </button>
        ) : null}
        {batch?.status === "failed" ? <button onClick={props.onRetry}>重试本批</button> : null}
        <button className="text-button" onClick={props.onCancel}>取消补课</button>
      </section>
    </div>
  );
}
