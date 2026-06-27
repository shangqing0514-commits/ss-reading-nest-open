import type {
  CommentLength,
  ReadingCommentMode,
  SessionPreferences
} from "@ss/shared";

type PreferencePatch = Partial<
  Pick<
    SessionPreferences,
    | "readingCommentMode"
    | "commentLength"
    | "liveReadingStyle"
    | "autoSaveCompanionComments"
  >
>;

const MODES: Array<{ value: ReadingCommentMode; label: string }> = [
  { value: "light_chat", label: "轻松聊聊" },
  { value: "reaction_only", label: "吐槽一下" },
  { value: "cp_talk", label: "嗑一下" },
  { value: "plot_guess", label: "猜后续" },
  { value: "deep_analysis", label: "认真分析" },
  { value: "diary_summary", label: "写读书日记" }
];

const LENGTHS: Array<{ value: CommentLength; label: string }> = [
  { value: "short", label: "简短" },
  { value: "normal", label: "正常" },
  { value: "long", label: "长评" }
];

export function ReadingCommentPreferences(props: {
  preferences: SessionPreferences;
  liveReadingEnabled: boolean;
  saving: boolean;
  quickActionDisabled?: boolean;
  onChange: (patch: PreferencePatch) => void;
  onQuickAction: (mode: ReadingCommentMode, length: CommentLength) => void;
}) {
  const allowsLong =
    props.preferences.readingCommentMode === "deep_analysis" ||
    props.preferences.readingCommentMode === "diary_summary";

  function selectMode(mode: ReadingCommentMode) {
    let commentLength = props.preferences.commentLength;
    if (mode === "reaction_only") commentLength = "short";
    if (!["deep_analysis", "diary_summary"].includes(mode) && commentLength === "long") {
      commentLength = "normal";
    }
    if (["deep_analysis", "diary_summary"].includes(mode) && commentLength === "short") {
      commentLength = "normal";
    }
    props.onChange({ readingCommentMode: mode, commentLength });
  }

  const selectedLongActionLength =
    props.preferences.commentLength === "short" ? "normal" : props.preferences.commentLength;

  return (
    <section className="comment-preferences" aria-label="陪读偏好">
      <div className="preference-heading">
        <h3>这次想怎么陪读</h3>
        <span>按每本书分别记住</span>
      </div>
      <div className="choice-grid mode-choices">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className="choice-chip"
            aria-pressed={props.preferences.readingCommentMode === mode.value}
            onClick={() => selectMode(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {props.liveReadingEnabled ? (
        <p className="preference-note">实时陪读固定为弹幕式简短回应，每次只说 1–3 句。</p>
      ) : (
        <>
          <h4>评论长度</h4>
          <div className="choice-grid length-choices">
            {LENGTHS.map((length) => (
              <button
                key={length.value}
                type="button"
                className="choice-chip"
                aria-pressed={props.preferences.commentLength === length.value}
                disabled={length.value === "long" && !allowsLong}
                onClick={() => props.onChange({ commentLength: length.value })}
              >
                {length.label}
              </button>
            ))}
          </div>
        </>
      )}

      <h4>立即陪我聊</h4>
      <div className="quick-action-grid">
        <button type="button" disabled={props.quickActionDisabled} onClick={() => props.onQuickAction("reaction_only", "short")}>
          立即吐槽
        </button>
        <button type="button" disabled={props.quickActionDisabled} onClick={() => props.onQuickAction("cp_talk", "normal")}>
          立即嗑一下
        </button>
        <button type="button" disabled={props.quickActionDisabled} onClick={() => props.onQuickAction("plot_guess", "normal")}>
          立即猜后续
        </button>
        <button type="button" disabled={props.quickActionDisabled} onClick={() => props.onQuickAction("deep_analysis", selectedLongActionLength)}>
          立即认真分析
        </button>
        <button type="button" disabled={props.quickActionDisabled} onClick={() => props.onQuickAction("diary_summary", selectedLongActionLength)}>
          立即写日记
        </button>
      </div>

      <label className="toggle-row comment-save-toggle">
        <span>自动保存烁构陪读短评</span>
        <input
          type="checkbox"
          checked={props.preferences.autoSaveCompanionComments}
          onChange={(event) =>
            props.onChange({ autoSaveCompanionComments: event.target.checked })
          }
        />
      </label>
      <p className="privacy-note">
        开启后，本书会自动保存烁构的轻量陪读短评，方便以后翻回旧段落查看。不会保存小说正文、prompt 或完整聊天。
      </p>
    </section>
  );
}
