export function CacheSettings(props: {
  type: "novel" | "manga";
  remembered: boolean;
  liveReadingEnabled: boolean;
  onRememberChange: (value: boolean) => void;
  onLiveReadingChange: (value: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const noun = props.type === "novel" ? "本书" : "这部漫画";
  return (
    <div className="sheet-backdrop" role="presentation" onClick={props.onClose}>
      <section className="bottom-sheet" role="dialog" aria-label="缓存设置" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>本设备缓存</h2>
        <label className="toggle-row">
          <span>在本设备记住{noun}</span>
          <input
            type="checkbox"
            checked={props.remembered}
            onChange={(event) => props.onRememberChange(event.target.checked)}
          />
        </label>
        <label className="toggle-row">
          <span>实时陪读模式（停留 1.8 秒后同步）</span>
          <input
            type="checkbox"
            checked={props.liveReadingEnabled}
            onChange={(event) => props.onLiveReadingChange(event.target.checked)}
          />
        </label>
        <p className="privacy-note">
          正文/图片只保存在本设备，用于下次继续阅读；服务器不会保存全文或漫画原图。
        </p>
        <button className="danger-button" onClick={props.onClear}>
          {props.type === "novel" ? "清除正文缓存" : "清除漫画缓存"}
        </button>
        <button className="text-button" onClick={props.onClose}>完成</button>
      </section>
    </div>
  );
}
