import { useEffect, useRef } from "react";
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

export interface MangaPage {
  file: File;
  url: string;
}

export function MangaReader(props: {
  session: ReadingSession;
  pages: MangaPage[];
  description: string;
  note: string;
  onDescription: (value: string) => void;
  onNote: (value: string) => void;
  onPosition: (index: number) => void;
  onLook: () => void;
  onSaveReaction: () => void;
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
    Math.min(props.pages.length - 1, props.session.userCurrentPosition.index - 1)
  );
  const previous = () => props.onPosition(Math.max(1, index));
  const next = () => props.onPosition(Math.min(props.pages.length, index + 2));
  const swipe = useHorizontalPaging(previous, next);
  const page = props.pages[index];
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = props.initialScrollTop;
  }, [index, props.companionLayoutRevision]);

  return (
    <main
      className={`reader-shell manga-shell reader-with-dock companion-layout-${props.companionLayout}${
        props.immersive ? " reader-immersive" : ""
      }`}
    >
      <ReaderHeader
        title={props.session.title}
        progress={`第 ${index + 1} 页 / 共 ${props.pages.length} 页`}
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
          className="reader-scroll manga-scroll"
          {...swipe}
          onScroll={(event) => props.onScrollPosition(event.currentTarget.scrollTop)}
        >
          {page ? <img className="manga-page" src={page.url} alt={`第 ${index + 1} 页漫画`} /> : null}
          <div className="page-buttons">
            <button onClick={previous} disabled={index === 0}>上一页</button>
            <span>{index + 1} / {props.pages.length}</span>
            <button onClick={next} disabled={index >= props.pages.length - 1}>下一页</button>
          </div>
          <div className="page-notes">
            <label>
              这一页发生了什么？
              <textarea value={props.description} onChange={(event) => props.onDescription(event.target.value)} placeholder="例如：这一页男主在哭" />
            </label>
            <label>
              想和小叔叔说
              <input value={props.note} onChange={(event) => props.onNote(event.target.value)} placeholder="写一句备注或吐槽" />
            </label>
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
        primaryLabel="陪我看看这页"
        secondaryLabel="保存吐槽"
        onPrimary={props.onLook}
        primaryDisabled={props.syncRequestInFlight}
        onSecondary={props.onSaveReaction}
        secondaryDisabled={!props.note.trim()}
        onFinish={props.onFinish}
      />
    </main>
  );
}
