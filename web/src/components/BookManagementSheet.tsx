import { useState } from "react";
import type {
  CompanionComment,
  SessionBundle,
  SessionStatus
} from "@ss/shared";

type RecordTab = "bookmarks" | "quotes" | "reactions" | "comments";

export function BookManagementSheet(props: {
  bundle: SessionBundle;
  comments: CompanionComment[];
  historyHasMore: boolean;
  historyLoading: boolean;
  onLoadMoreHistory: () => void;
  onRename: (title: string) => void;
  onStatus: (status: SessionStatus) => void;
  onClearComments: (scope: "recent" | "history") => void;
  onDelete: (options: { deleteCloudSource: boolean; deleteLocalCache: boolean }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(props.bundle.session.title);
  const [tab, setTab] = useState<RecordTab>("bookmarks");
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteCloudSource, setDeleteCloudSource] = useState(false);
  const [deleteLocalCache, setDeleteLocalCache] = useState(false);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={props.onClose}>
      <section
        className="bottom-sheet management-sheet"
        role="dialog"
        aria-label={`管理《${props.bundle.session.title}》`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grip" />
        <h2>管理《{props.bundle.session.title}》</h2>

        <section className="management-section">
          <h3>书名与状态</h3>
          <label>
            新的书名
            <input
              aria-label="新的书名"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <button
            className="sheet-action"
            disabled={!title.trim() || title.trim() === props.bundle.session.title}
            onClick={() => props.onRename(title.trim())}
          >
            保存新书名
          </button>
          <button
            className="sheet-action"
            onClick={() =>
              props.onStatus(
                props.bundle.session.status === "active" ? "completed" : "active"
              )
            }
          >
            {props.bundle.session.status === "active" ? "标记为已完成" : "恢复为阅读中"}
          </button>
        </section>

        <section className="management-section">
          <h3>阅读记录</h3>
          <div className="record-tabs" role="tablist" aria-label="阅读记录">
            <button aria-pressed={tab === "bookmarks"} onClick={() => setTab("bookmarks")}>书签</button>
            <button aria-pressed={tab === "quotes"} onClick={() => setTab("quotes")}>摘录</button>
            <button aria-pressed={tab === "reactions"} onClick={() => setTab("reactions")}>用户反应</button>
            <button aria-pressed={tab === "comments"} onClick={() => setTab("comments")}>小叔叔评论</button>
          </div>
          <div className="record-list">
            {tab === "bookmarks"
              ? recordItems(props.bundle.bookmarks, (item) => item.label || item.position.label)
              : null}
            {tab === "quotes"
              ? recordItems(props.bundle.quotes, (item) => item.content)
              : null}
            {tab === "reactions"
              ? recordItems(props.bundle.reactions, (item) => item.content)
              : null}
            {tab === "comments"
              ? recordItems(props.comments, (item) =>
                  item.mode === "deep_analysis"
                    ? "已生成长评，可回聊天区查看。"
                    : item.text
                )
              : null}
          </div>
          {tab === "comments" && props.historyHasMore ? (
            <button
              className="sheet-action"
              disabled={props.historyLoading}
              onClick={props.onLoadMoreHistory}
            >
              {props.historyLoading ? "正在加载…" : "加载更多评论"}
            </button>
          ) : null}
        </section>

        <section className="management-section">
          <h3>短评清理</h3>
          <button className="sheet-action" onClick={() => props.onClearComments("recent")}>
            清除最近短评
          </button>
          <button className="sheet-action" onClick={() => props.onClearComments("history")}>
            清除历史短评
          </button>
        </section>

        <section className="management-section danger-zone">
          <h3>危险操作</h3>
          {deleteStep === 0 ? (
            <button className="danger-button" onClick={() => setDeleteStep(1)}>
              删除这本书
            </button>
          ) : null}
          {deleteStep >= 1 ? (
            <div className="delete-confirmation">
              <label className="remember-row">
                <input type="checkbox" checked disabled />
                删除这本书的云端阅读记录
              </label>
              <p>会从书架移除这本书，并删除进度、偏好、短评、书签、摘录和反应。</p>
              <label className="remember-row">
                <input
                  type="checkbox"
                  checked={deleteCloudSource}
                  onChange={(event) => setDeleteCloudSource(event.target.checked)}
                />
                同时删除云端正文副本
              </label>
              <p>会删除私人云端中保存的小说正文或漫画图片，其他设备将无法从云端恢复。</p>
              <label className="remember-row">
                <input
                  type="checkbox"
                  checked={deleteLocalCache}
                  onChange={(event) => setDeleteLocalCache(event.target.checked)}
                />
                同时删除本设备正文缓存
              </label>
              <p>只清除当前设备上的本地缓存，不影响云端。</p>
              {deleteStep === 1 ? (
                <button className="danger-button" onClick={() => setDeleteStep(2)}>
                  继续删除
                </button>
              ) : (
                <>
                  <p className="final-warning">请再次确认，这个操作无法撤销。</p>
                  <button
                    className="danger-button"
                    onClick={() => props.onDelete({ deleteCloudSource, deleteLocalCache })}
                  >
                    确认删除这本书
                  </button>
                </>
              )}
            </div>
          ) : null}
        </section>

        <button className="text-button" onClick={props.onClose}>关闭</button>
      </section>
    </div>
  );
}

function recordItems<T extends { id: string; position: { label: string } }>(
  items: T[],
  content: (item: T) => string
) {
  if (items.length === 0) return <p className="record-empty">这里还没有记录。</p>;
  return items.map((item) => (
    <article key={item.id} className="record-item">
      <span>{item.position.label}</span>
      <p>{content(item)}</p>
    </article>
  ));
}
