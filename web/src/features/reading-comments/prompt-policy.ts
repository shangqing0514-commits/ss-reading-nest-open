import type {
  CommentLength,
  ReadingCommentMode,
  ReadingPosition
} from "@ss/shared";

type PromptSource = "catch_up_complete" | "current_only" | "quick_action";
type PublishSource = "catch_up_completion" | "current_context" | "quick_action";

export function normalizeCommentLength(
  mode: ReadingCommentMode,
  requestedLength: CommentLength
): CommentLength {
  if (
    requestedLength === "long" &&
    mode !== "deep_analysis" &&
    mode !== "diary_summary"
  ) {
    return "normal";
  }
  return requestedLength;
}

export function buildReadingCommentPrompt(input: {
  sessionId: string;
  mode: ReadingCommentMode;
  length: CommentLength;
  title: string;
  position: ReadingPosition;
  syncedRange?: { start: number; end: number };
  source: PromptSource;
  operationId: string;
  autoSaveCompanionComments: boolean;
}): string {
  const length = normalizeCommentLength(input.mode, input.length);
  const intro = [
    input.source === "catch_up_complete"
      ? `补课已确认完成。请整合刚才第 ${input.syncedRange?.start ?? input.position.index}-${input.syncedRange?.end ?? input.position.index} 段的内容，再陪用户聊当前${input.position.label}。`
      : `用户正在读《${input.title}》的${input.position.label}。`,
    lengthInstruction(input.mode, length)
  ];
  const modeInstructions = modeInstruction(input.mode);
  const publishSource = toPublishSource(input.source);
  const publication = input.autoSaveCompanionComments
    ? publishInstructions({
        sessionId: input.sessionId,
        operationId: input.operationId,
        mode: input.mode,
        length,
        source: publishSource,
        position: input.position
      })
    : [
        "本次小窝设置为不自动保存短评到 Dock。",
        "不要调用任何应用写回工具；直接在聊天区回复短评即可。",
        "不要说 Dock 已保存，也不要显示“短评未同步到 Dock”，因为本次没有尝试写回。"
      ];
  return [...intro, ...modeInstructions, ...publication].join("\n\n");
}

function toPublishSource(source: PromptSource): PublishSource {
  if (source === "catch_up_complete") return "catch_up_completion";
  if (source === "quick_action") return "quick_action";
  return "current_context";
}

export function buildLiveReadingPrompt(input: {
  sessionId: string;
  title: string;
  position: ReadingPosition;
  operationId: string;
  autoSaveCompanionComments: boolean;
  requestedMode?: ReadingCommentMode;
  requestedLength?: CommentLength;
}): string {
  const publication = input.autoSaveCompanionComments
    ? [
        "生成短评后，先调用 publish_companion_comment 保存完全相同的短评。",
        publishParameters({
          sessionId: input.sessionId,
          operationId: input.operationId,
          mode: "reaction_only",
          length: "short",
          source: "live_reading",
          position: input.position,
          text: "最终短评全文"
        }),
        "工具成功后，再在聊天区回复完全相同的短评；失败时必须明确说明“短评未同步到 Dock”，不要声称 Dock 已保存。"
      ]
    : [
        "本次小窝设置为不自动保存短评到 Dock。",
        "不要调用任何应用写回工具；直接在聊天区回复短评即可。"
      ];
  return [
    `【实时陪读：${input.position.label}】《${input.title}》`,
    "固定模式：reaction_only；固定长度：short；风格：danmaku。",
    "只输出 1-3 句弹幕式短评。",
    "不总结全文，不重复剧情，不写完整书评。",
    "只做即时反应、吐槽、嗑点或伏笔提醒。",
    ...publication
  ].join("\n\n");
}

function publishInstructions(input: {
  sessionId: string;
  operationId: string;
  mode: ReadingCommentMode;
  length: CommentLength;
  source: PublishSource;
  position: ReadingPosition;
}): string[] {
  if (input.mode === "deep_analysis") {
    return [
      "长评正文只在聊天区回复，不要把长评正文传给 publish_companion_comment。",
      "先调用 publish_companion_comment，仅保存固定短提示：“已生成长评，可回聊天区查看。”",
      publishParameters({
        ...input,
        mode: "deep_analysis",
        length: "short",
        text: "已生成长评，可回聊天区查看。"
      })
    ];
  }
  return [
    "生成最终短评后，先调用 publish_companion_comment 保存这段短评。",
    publishParameters({ ...input, text: "最终短评全文" }),
    "工具成功后，再在聊天区回复完全相同的短评。",
    "如果工具调用失败，可以正常回复，但必须说明短评未同步到 Dock；不要声称 Dock 已保存。"
  ];
}

function publishParameters(input: {
  sessionId: string;
  operationId: string;
  mode: ReadingCommentMode;
  length: CommentLength;
  source: PublishSource | "live_reading";
  position: ReadingPosition;
  text: string;
}) {
  return [
    "调用参数使用：",
    `sessionId=${input.sessionId}`,
    `position.kind=${input.position.kind}`,
    `position.index=${input.position.index}`,
    `position.label=${input.position.label}`,
    `mode=${input.mode}`,
    `length=${input.length}`,
    `text=${input.text}`,
    `source=${input.source}`,
    `operationId=${input.operationId}`
  ].join(" ");
}

function lengthInstruction(mode: ReadingCommentMode, length: CommentLength) {
  if (mode === "reaction_only" && length === "short") return "长度：1-5 句。";
  if (length === "short") return "长度控制在 50-150 字。";
  if (length === "long") return "长度可为 600 字以上。";
  return "长度控制在 150-400 字。";
}

function modeInstruction(mode: ReadingCommentMode): string[] {
  if (mode === "light_chat") {
    return [
      "请用轻松共读模式，只挑最有意思的 1-3 个点回应。",
      "可以短评、吐槽、嗑点或简单猜一点伏笔。",
      "不需要完整书评，不需要逐项总结。",
      "只有用户明确要求认真分析、深度分析、写长评或详细说时，才展开完整分析。"
    ];
  }
  if (mode === "reaction_only") {
    return [
      "像弹幕一样做即时反应，控制在 1-5 句。",
      "不总结剧情，不分析结构。"
    ];
  }
  if (mode === "cp_talk") {
    return [
      "聚焦人物关系张力、暧昧、占有欲、互动反差和好嗑之处。",
      "少复述剧情，不展开完整人物报告。"
    ];
  }
  if (mode === "plot_guess") {
    return [
      "聚焦伏笔、隐藏信息和后续走向。",
      "明确区分原文事实和猜测，不详细总结已经发生的剧情。"
    ];
  }
  if (mode === "deep_analysis") {
    return [
      "这是用户主动选择的深度分析。",
      "按完整结构讨论：剧情变化、人物变化、伏笔猜测、当前感受。"
    ];
  }
  return [
    "这是读书日记总结，不是普通段落点评。",
    "整理今天的阅读进度、摘录、吐槽和余味，写成可复制的日记。"
  ];
}
