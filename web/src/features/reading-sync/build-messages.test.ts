import { describe, expect, it } from "vitest";
import {
  buildBatchChatMessage,
  buildBatchUserNote,
  buildFormalReadingPrompt,
  buildCurrentOnlyPrompt,
  buildRecentOnlyPrompt
} from "./build-messages.js";
import type { ReadingSyncJob, SyncBatch } from "./types.js";

const batch: SyncBatch = {
  id: "batch-1",
  ordinal: 1,
  totalBatches: 4,
  rangeStart: 3,
  rangeEnd: 8,
  characterCount: 100,
  text: "【第 3 段】\n原文",
  isFinal: false,
  oversizedParagraph: false,
  status: "pending"
};

const job: ReadingSyncJob = {
  sessionId: "session-1",
  title: "测试小说",
  type: "novel",
  mode: "range_sync",
  targetPosition: { kind: "paragraph", index: 28, label: "第 28 段" },
  confirmedThrough: { kind: "paragraph", index: 2, label: "第 2 段" },
  batches: [batch],
  activeBatchIndex: 0,
  createdAt: "2026-06-22T00:00:00.000Z"
};

describe("reading-sync messages", () => {
  it("formats a recognizable non-final catch-up message", () => {
    const message = buildBatchChatMessage(job, batch);

    expect(message).toContain("【补课第 1/4 批：第 3–8 段】");
    expect(message).toContain("烁构先安静追到用户当前位置");
    expect(message).toContain("只简短回复：“已读到第 8 段。”");
    expect(message).toContain(batch.text);
    expect(message).not.toMatch(/剧情摘要|关键事件|人物关系/);
    expect(message).not.toContain("publish_companion_comment");
  });

  it("puts only factual synchronization metadata in userNote", () => {
    const note = buildBatchUserNote(job, batch);

    expect(note).toContain("sessionId=session-1");
    expect(note).toContain("batchRange=3-8");
    expect(note).toContain("hasMoreBatches=true");
    expect(note).not.toMatch(/总结|判断|推测/);
  });

  it("builds a separate formal prompt without repeating source text", () => {
    const prompt = buildFormalReadingPrompt(job, {
      mode: "light_chat",
      length: "normal",
      operationId: "catch-up-op-1",
      autoSaveCompanionComments: true
    });

    expect(prompt).toContain("补课已确认完成");
    expect(prompt).toContain("第 3-28 段");
    expect(prompt).not.toContain(batch.text);
    expect(prompt).toContain("先调用 publish_companion_comment");
    expect(prompt).toContain("source=catch_up_completion");
    expect(prompt).not.toMatch(/剧情变化.*人物变化.*伏笔猜测.*当前感受/s);
  });

  it("routes current-only and recent-only formal requests through prompt policy", () => {
    const current = buildCurrentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      position: 8,
      text: "当前原文",
      hasUnconfirmedGap: true,
      mode: "reaction_only",
      length: "short",
      operationId: "current-op-1",
      autoSaveCompanionComments: true
    });
    const recent = buildRecentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      rangeStart: 4,
      rangeEnd: 8,
      text: "最近原文",
      mode: "plot_guess",
      length: "normal",
      operationId: "recent-op-1",
      autoSaveCompanionComments: true
    });

    expect(current).toContain("当前原文");
    expect(current).toContain("中间存在未同步剧情");
    expect(current).toContain("1-5 句");
    expect(recent).toContain("最近原文");
    expect(recent).toContain("后续走向");
    expect(current).toContain("operationId=current-op-1");
    expect(recent).toContain("operationId=recent-op-1");
    expect(current).toContain("source=current_context");
    expect(recent).toContain("source=quick_action");
  });

  it("does not request companion publish for any formal route when auto-save is off", () => {
    const formal = buildFormalReadingPrompt(job, {
      mode: "light_chat",
      length: "normal",
      operationId: "catch-up-op-1",
      autoSaveCompanionComments: false
    });
    const current = buildCurrentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      position: 8,
      text: "当前原文",
      hasUnconfirmedGap: false,
      mode: "reaction_only",
      length: "short",
      operationId: "current-op-1",
      autoSaveCompanionComments: false
    });
    const recent = buildRecentOnlyPrompt({
      sessionId: "session-1",
      title: "测试小说",
      rangeStart: 4,
      rangeEnd: 8,
      text: "最近原文",
      mode: "plot_guess",
      length: "normal",
      operationId: "recent-op-1",
      autoSaveCompanionComments: false
    });

    expect(formal).not.toContain("publish_companion_comment");
    expect(current).not.toContain("publish_companion_comment");
    expect(recent).not.toContain("publish_companion_comment");
    expect(current).toContain("不自动保存短评到 Dock");
    expect(current).toContain("直接在聊天区回复短评");
  });
});
