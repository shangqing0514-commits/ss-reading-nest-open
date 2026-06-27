import { useEffect, useMemo, useState } from "react";
import type {
  CommentLength,
  CompanionComment,
  ReadingCommentMode,
  ReadingPosition
} from "@ss/shared";
import type { CompanionLayout } from "../hooks/useReadingHostLayout.js";

const DEEP_ANALYSIS_DOCK_TEXT = "已生成长评，可回聊天区查看。";

export interface PendingCompanionCommentDraft {
  position: ReadingPosition;
  mode: ReadingCommentMode;
  length: CommentLength;
  source: "manual_save";
  operationId: string;
}

export function CompanionDock(props: {
  sessionId: string;
  comments: CompanionComment[];
  layout: CompanionLayout;
  layoutRevision?: number;
  loading: boolean;
  error?: string;
  canRequestPip?: boolean;
  onRequestPip?: () => void;
  pendingCommentDraft?: PendingCompanionCommentDraft | null;
  pendingCommentSaving?: boolean;
  onSavePendingComment?: (text: string) => void;
  onJump: (positionIndex: number) => void;
  onClear?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const comments = useMemo(
    () =>
      props.comments
        .filter((comment) => comment.sessionId === props.sessionId && comment.inRecent)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 20),
    [props.comments, props.sessionId]
  );

  useEffect(() => {
    setExpanded(false);
    setCollapsed(false);
    setDraftOpen(false);
    setDraftText("");
  }, [props.layout, props.sessionId]);

  useEffect(() => {
    setDraftText("");
  }, [props.pendingCommentDraft?.operationId]);

  if (collapsed) {
    return (
      <aside
        className={`companion-dock companion-dock-${props.layout} companion-dock-collapsed`}
        data-testid="companion-dock"
      >
        <button type="button" className="companion-tab" onClick={() => setCollapsed(false)}>
          烁构陪读
        </button>
      </aside>
    );
  }

  const visibleCount = expanded ? 20 : props.layout === "wide" ? 3 : 1;
  const visible = comments.slice(0, visibleCount);
  const latestLiveCommentId = comments.find(
    (comment) => comment.source === "live_reading"
  )?.id;

  return (
    <aside
      className={`companion-dock companion-dock-${props.layout}${expanded ? " expanded" : ""}${draftOpen ? " draft-open" : ""}`}
      data-testid="companion-dock"
      aria-label="烁构陪读短评"
    >
      <header className="companion-dock-header">
        <div>
          <strong>烁构陪读</strong>
          <span>最近短评</span>
        </div>
        <div className="companion-dock-controls">
          {props.canRequestPip && props.onRequestPip ? (
            <button type="button" onClick={props.onRequestPip}>悬浮陪读</button>
          ) : null}
          <button type="button" aria-label="收起陪读 Dock" onClick={() => setCollapsed(true)}>
            收起
          </button>
        </div>
      </header>

      <div className="companion-comment-list">
        {props.loading ? <p className="companion-empty">正在看看烁构留下了什么……</p> : null}
        {!props.loading && props.error ? <p className="companion-empty">{props.error}</p> : null}
        {!props.loading && !props.error && visible.length === 0 ? (
          <p className="companion-empty">烁构还没留下短评。</p>
        ) : null}
        {!props.loading && !props.error
          ? visible.map((comment) => (
              <button
                type="button"
                key={comment.id}
                className={`companion-comment${
                  comment.id === latestLiveCommentId ? " live-comment" : ""
                }`}
                onClick={() => props.onJump(comment.position.index)}
              >
                <span>{comment.position.label}</span>
                <p>
                  {comment.mode === "deep_analysis"
                    ? DEEP_ANALYSIS_DOCK_TEXT
                    : comment.text}
                </p>
              </button>
            ))
          : null}
      </div>

      <footer className="companion-dock-footer">
        {props.pendingCommentDraft && props.onSavePendingComment ? (
          <div className="pending-comment-save">
            {!draftOpen ? (
              <button type="button" onClick={() => setDraftOpen(true)}>
                保存烁构短评
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = draftText.trim();
                  if (!text || props.pendingCommentSaving) return;
                  props.onSavePendingComment?.(text);
                }}
              >
                <label>
                  短评内容
                  <textarea
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder="把聊天区里想留下的短评贴到这里"
                  />
                </label>
                <button type="submit" disabled={!draftText.trim() || props.pendingCommentSaving}>
                  {props.pendingCommentSaving ? "正在保存…" : "收入烁构短评"}
                </button>
              </form>
            )}
          </div>
        ) : null}
        {comments.length > (props.layout === "wide" ? 3 : 1) ? (
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "只看最新短评" : "查看最近短评"}
          </button>
        ) : null}
        {comments.length > 0 && props.onClear ? (
          <button type="button" className="clear-comments" onClick={props.onClear}>
            清除最近短评
          </button>
        ) : null}
      </footer>
    </aside>
  );
}
