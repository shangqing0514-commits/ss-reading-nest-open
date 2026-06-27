export function ReaderHeader(props: {
  title: string;
  progress: string;
  fullscreenLabel?: string;
  onBack: () => void;
  onFullscreen: () => void;
  onSettings: () => void;
  onMore: () => void;
}) {
  return (
    <header className="reader-header">
      <button className="icon-button" onClick={props.onBack} aria-label="返回首页">‹</button>
      <div className="reader-heading">
        <strong>{props.title}</strong>
        <span>{props.progress}</span>
      </div>
      <div className="header-buttons">
        <button className="reader-display-button" onClick={props.onFullscreen}>
          {props.fullscreenLabel ?? "全屏阅读"}
        </button>
        <button className="icon-button" onClick={props.onSettings} aria-label="缓存设置">⌁</button>
        <button className="icon-button" onClick={props.onMore} aria-label="更多操作">⋯</button>
      </div>
    </header>
  );
}
