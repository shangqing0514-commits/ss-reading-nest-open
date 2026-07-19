import type { Bookmark, Quote, Reaction, ReadingSession } from "@ss/shared";

export function DiaryPreview(props: {
  context: {
    session: ReadingSession;
    quotes: Quote[];
    reactions: Reaction[];
    bookmarks: Bookmark[];
    summaryHints: string[];
  };
  onWrite: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={props.onClose}>
      <section className="bottom-sheet diary-sheet" role="dialog" aria-label="小窝日记素材" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>今日小窝日记素材</h2>
        <p><strong>{props.context.session.title}</strong> · {props.context.session.userCurrentPosition.label}</p>
        <h3>摘录</h3>
        <ul>{props.context.quotes.map((item) => <li key={item.id}>{item.content}</li>)}</ul>
        <h3>吐槽</h3>
        <ul>{props.context.reactions.map((item) => <li key={item.id}>{item.content}</li>)}</ul>
        <button className="action-primary wide-button" onClick={props.onWrite}>请小叔叔写成小窝日记</button>
        <button className="text-button" onClick={props.onClose}>关闭</button>
      </section>
    </div>
  );
}
