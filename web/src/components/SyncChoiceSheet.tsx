export function SyncChoiceSheet(props: {
  assistantLabel: string;
  userLabel: string;
  recentLabel?: string;
  onFull: () => void;
  onCurrent: () => void;
  onRecent: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet sync-sheet" role="dialog" aria-modal="true">
        <h2>中间有较多剧情，要怎么同步？</h2>
        <p>小叔叔还停在{props.assistantLabel}，你已经读到{props.userLabel}。</p>
        <button className="action-primary" onClick={props.onFull}>
          完整补课后再陪读（推荐）
        </button>
        <button onClick={props.onCurrent}>只看当前段</button>
        <button onClick={props.onRecent}>{props.recentLabel ?? "补最近 5 段"}</button>
        <button className="text-button" onClick={props.onCancel}>取消</button>
      </section>
    </div>
  );
}
