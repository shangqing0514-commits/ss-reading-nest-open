import type {
  CommentLength,
  ReadingCommentMode,
  SessionPreferences
} from "@ss/shared";
import { ReadingCommentPreferences } from "./ReadingCommentPreferences.js";

export function MoreActions(props: {
  preferences: SessionPreferences;
  liveReadingEnabled: boolean;
  preferenceSaving: boolean;
  quickActionDisabled?: boolean;
  onPreferencesChange: (
    patch: Partial<
      Pick<
        SessionPreferences,
        | "readingCommentMode"
        | "commentLength"
        | "liveReadingStyle"
        | "autoSaveCompanionComments"
      >
    >
  ) => void;
  onQuickAction: (mode: ReadingCommentMode, length: CommentLength) => void;
  onBookmark: () => void;
  onDiary: () => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={props.onClose}>
      <section className="bottom-sheet" role="dialog" aria-label="更多共读操作" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>更多共读操作</h2>
        <ReadingCommentPreferences
          preferences={props.preferences}
          liveReadingEnabled={props.liveReadingEnabled}
          saving={props.preferenceSaving}
          quickActionDisabled={props.quickActionDisabled}
          onChange={props.onPreferencesChange}
          onQuickAction={props.onQuickAction}
        />
        <button className="sheet-action" onClick={props.onBookmark}>保存书签</button>
        <button className="sheet-action" onClick={props.onDiary}>写小窝日记</button>
        <button className="sheet-action quiet-danger" onClick={props.onComplete}>完成这部作品</button>
        <button className="text-button" onClick={props.onClose}>取消</button>
      </section>
    </div>
  );
}
