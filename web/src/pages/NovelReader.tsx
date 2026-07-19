import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { CompanionComment, ReadingSession } from "@ss/shared";
import { useHorizontalPaging } from "../hooks/useHorizontalPaging.js";
import type { CompanionLayout } from "../hooks/useReadingHostLayout.js";
import {
  CompanionDock,
  type PendingCompanionCommentDraft
} from "../components/CompanionDock.js";
import { ReaderHeader } from "../components/ReaderHeader.js";
import { ReaderActions } from "../components/ReaderActions.js";
import { ReadingSyncStatus } from "../components/ReadingSyncStatus.js";

export function NovelReader(props: {
  session: ReadingSession;
  chunks: string[];
  onPosition: (index: number) => void;
  onLook: (currentText: string, selectedText: string) => void;
  onSaveQuote: (content: string) => void;
  onFinish: () => void;
  onBack: () => void;
  onFullscreen: () => void;
  fullscreenLabel?: string;
  immersive?: boolean;
  onSettings: () => void;
  onMore: () => void;
  companionComments: CompanionComment[];
  companionLoading: boolean;
  companionError?: string;
  companionLayout: CompanionLayout;
  companionLayoutRevision: number;
  syncRequestInFlight: boolean;
  canRequestPip: boolean;
  onRequestPip: () => void;
  pendingCommentDraft?: PendingCompanionCommentDraft | null;
  pendingCommentSaving?: boolean;
  onSavePendingComment?: (text: string) => void;
  onClearCompanionComments: () => void;
  initialScrollTop: number;
  onScrollPosition: (scrollTop: number) => void;
}) {
  const index = Math.max(
    0,
    Math.min(props.chunks.length - 1, props.session.userCurrentPosition.index - 1)
  );
  const current = props.chunks[index] ?? "";
  const currentPosition = index + 1;
  const [selected, setSelected] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpInput, setJumpInput] = useState(String(currentPosition));
  const previous = () => props.onPosition(Math.max(1, index));
  const next = () => props.onPosition(Math.min(props.chunks.length, index + 2));
  const swipe = useHorizontalPaging(previous, next);
  const scrollRef = useRef<HTMLElement>(null);

  const chapterEntries = useMemo(() => {
    return props.chunks.reduce<Array<{ title: string; position: number }>>((entries, chunk, chunkIndex) => {
      const heading = chunk.trim().match(
        /^(第(?:[0-9零一二三四五六七八九十百千万]+)?(?:章|节|卷|回|部|篇)|序章|楔子|引子|番外|后记|尾声)(?:[：:\-—\s]+(.*))?$/u
      );
      if (!heading) return entries;
      const headingText = heading[1];
      const bodyText = heading[2]?.trim();
      const title = bodyText ? `${headingText} ${bodyText}` : headingText;
      entries.push({ title, position: chunkIndex + 1 });
      return entries;
    }, []);
  }, [props.chunks]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = props.initialScrollTop;
  }, [index, props.companionLayoutRevision]);

  useEffect(() => {
    if (jumpOpen) {
      setJumpInput(String(currentPosition));
    }
  }, [jumpOpen, currentPosition]);

  const normalizeTargetInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return "1";
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return "1";
    const numeric = Number(digits);
    if (!Number.isFinite(numeric)) return "1";
    return String(Math.min(Math.max(Math.trunc(numeric), 1), props.chunks.length));
  };

  const handleJumpInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setJumpInput(normalizeTargetInput(event.target.value));
  };

  const jumpTarget = Math.min(Math.max(Number(jumpInput) || 1, 1), props.chunks.length);

  const jumpToTarget = () => {
    props.onPosition(jumpTarget);
    setJumpOpen(false);
  };

  const jumpToChapter = (position: number) => {
    props.onPosition(position);
    setJumpOpen(false);
  };

  return (
    <main
      className={`reader-shell reader-with-dock companion-layout-${props.companionLayout}${
        props.immersive ? " reader-immersive" : ""
      }`}
    >
      <ReaderHeader
        title={props.session.title}
        progress={`第 ${index + 1} 段 / 共 ${props.chunks.length} 段`}
        fullscreenLabel={props.fullscreenLabel}
        onBack={props.onBack}
        onFullscreen={props.onFullscreen}
        onSettings={props.onSettings}
        onMore={props.onMore}
      />
      <ReadingSyncStatus session={props.session} />
      <div className="reader-workspace">
        <section
          ref={scrollRef}
          className="reader-scroll novel-scroll"
          {...swipe}
          onScroll={(event) => props.onScrollPosition(event.currentTarget.scrollTop)}
          onMouseUp={() => setSelected(window.getSelection()?.toString().trim() ?? "")}
          onTouchEnd={(event) => {
            swipe.onTouchEnd(event);
            setSelected(window.getSelection()?.toString().trim() ?? "");
          }}
        >
          <article className="novel-paper">
            {current.split("\n").map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
          </article>
          <div className="page-buttons">
            <button type="button" onClick={previous} disabled={index === 0}>上一段</button>
            <button type="button" className="reader-jump-button" onClick={() => setJumpOpen(true)}>
              目录 / 跳转
            </button>
            <span>{index + 1} / {props.chunks.length}</span>
            <button type="button" onClick={next} disabled={index >= props.chunks.length - 1}>下一段</button>
          </div>
        </section>
        <CompanionDock
          sessionId={props.session.id}
          comments={props.companionComments}
          layout={props.companionLayout}
          layoutRevision={props.companionLayoutRevision}
          loading={props.companionLoading}
          error={props.companionError}
          canRequestPip={props.canRequestPip}
          onRequestPip={props.onRequestPip}
          pendingCommentDraft={props.pendingCommentDraft}
          pendingCommentSaving={props.pendingCommentSaving}
          onSavePendingComment={props.onSavePendingComment}
          onJump={props.onPosition}
          onClear={props.onClearCompanionComments}
        />
      </div>
      <ReaderActions
        primaryLabel="陪我看看这里"
        secondaryLabel="保存这句"
        onPrimary={() => props.onLook(current, selected)}
        primaryDisabled={props.syncRequestInFlight}
        onSecondary={() => props.onSaveQuote(selected)}
        secondaryDisabled={!selected}
        onFinish={props.onFinish}
      />
      {jumpOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setJumpOpen(false)}>
          <section
            className="bottom-sheet jump-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="目录 / 跳转"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-grip" />
            <div className="jump-sheet-header">
              <div>
                <h2>目录 / 跳转</h2>
                <p>当前第 {currentPosition} 段 / 共 {props.chunks.length} 段</p>
              </div>
              <button type="button" className="text-button" onClick={() => setJumpOpen(false)}>
                关闭
              </button>
            </div>
            <label className="jump-target-input">
              <span>目标段数</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={props.chunks.length}
                value={jumpInput}
                onChange={handleJumpInputChange}
              />
            </label>
            <input
              type="range"
              min={1}
              max={props.chunks.length}
              value={jumpTarget}
              onChange={(event) => setJumpInput(normalizeTargetInput(event.target.value))}
            />
            <div className="jump-actions">
              <button type="button" className="action-primary" onClick={jumpToTarget}>
                跳到这里
              </button>
            </div>
            <div className="jump-chapter-list">
              <h3>章节目录</h3>
              {chapterEntries.length > 0 ? (
                chapterEntries.map((entry) => (
                  <button
                    key={`${entry.position}-${entry.title}`}
                    type="button"
                    className="jump-chapter-item"
                    onClick={() => jumpToChapter(entry.position)}
                  >
                    <span>{entry.title}</span>
                    <small>第 {entry.position} 段</small>
                  </button>
                ))
              ) : (
                <p className="companion-empty">没有识别到章节标题，可以使用段数跳转</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
