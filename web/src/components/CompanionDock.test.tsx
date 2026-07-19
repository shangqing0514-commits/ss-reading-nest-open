import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CompanionComment } from "@ss/shared";
import { CompanionDock } from "./CompanionDock.js";

const comments: CompanionComment[] = [
  makeComment("c-4", "session-a", 4, "第四段短评", "current_context", "2026-06-23T04:00:00.000Z"),
  makeComment("c-3", "session-a", 3, "第三段弹幕", "live_reading", "2026-06-23T03:00:00.000Z"),
  makeComment("c-2", "session-a", 2, "第二段短评", "quick_action", "2026-06-23T02:00:00.000Z"),
  makeComment("c-1", "session-a", 1, "第一段短评", "current_context", "2026-06-23T01:00:00.000Z")
];

describe("CompanionDock", () => {
  it("shows the latest three comments in wide mode and expands to recent comments", () => {
    render(
      <CompanionDock
        sessionId="session-a"
        comments={comments}
        layout="wide"
        loading={false}
        onJump={vi.fn()}
      />
    );

    expect(screen.getByTestId("companion-dock")).toHaveClass("companion-dock-wide");
    expect(screen.getByText("第四段短评")).toBeInTheDocument();
    expect(screen.getByText("第三段弹幕")).toBeInTheDocument();
    expect(screen.getByText("第二段短评")).toBeInTheDocument();
    expect(screen.queryByText("第一段短评")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看最近短评" }));
    expect(screen.getByText("第一段短评")).toBeInTheDocument();
  });

  it("uses a compact latest-comment card on narrow screens", () => {
    render(
      <CompanionDock
        sessionId="session-a"
        comments={comments}
        layout="compact"
        loading={false}
        onJump={vi.fn()}
      />
    );

    expect(screen.getByTestId("companion-dock")).toHaveClass("companion-dock-compact");
    expect(screen.getByText("第四段短评")).toBeInTheDocument();
    expect(screen.queryByText("第三段弹幕")).not.toBeInTheDocument();
  });

  it("lets a single long recent comment expand to full text in compact mode", () => {
    const longText =
      "Long companion comment that should start as a preview but become fully readable after expanding the Dock. ".repeat(4).trim();

    render(
      <CompanionDock
        sessionId="session-a"
        comments={[makeComment("long", "session-a", 1, longText, "current_context", "2026-06-23T05:00:00.000Z")]}
        layout="compact"
        loading={false}
        onJump={vi.fn()}
      />
    );

    const dock = screen.getByTestId("companion-dock");
    expect(dock).not.toHaveClass("expanded");
    expect(screen.getByText(longText).closest("p")).not.toHaveClass("full-text");

    fireEvent.click(screen.getByRole("button", { name: "展开短评" }));

    expect(dock).toHaveClass("expanded");
    expect(screen.getByText(longText).closest("p")).toHaveClass("full-text");
    expect(screen.getByRole("button", { name: "收起短评" })).toBeInTheDocument();
  });

  it("orders recent comments newest first and never displays more than twenty", () => {
    const manyComments = Array.from({ length: 21 }, (_, index) =>
      makeComment(
        `many-${index + 1}`,
        "session-a",
        index + 1,
        `短评 ${index + 1}`,
        "current_context",
        `2026-06-23T${String(index).padStart(2, "0")}:00:00.000Z`
      )
    );
    render(
      <CompanionDock
        sessionId="session-a"
        comments={manyComments}
        layout="wide"
        loading={false}
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看最近短评" }));
    expect(screen.getByText("短评 21")).toBeInTheDocument();
    expect(screen.getByText("短评 2")).toBeInTheDocument();
    expect(screen.queryByText("短评 1")).not.toBeInTheDocument();
  });

  it("never renders deep-analysis body text and highlights the latest live comment", () => {
    render(
      <CompanionDock
        sessionId="session-a"
        comments={[
          {
            ...comments[0]!,
            id: "deep",
            mode: "deep_analysis",
            text: "这是一大段不该出现在 Dock 的分析正文"
          },
          comments[1]!
        ]}
        layout="wide"
        loading={false}
        onJump={vi.fn()}
      />
    );

    expect(screen.queryByText(/不该出现在 Dock/)).not.toBeInTheDocument();
    expect(screen.getByText("已生成长评，可回聊天区查看。")).toBeInTheDocument();
    expect(screen.getByText("第三段弹幕").closest("button")).toHaveClass("live-comment");
  });

  it("supports jump, collapse, empty/error states, and clear recent", () => {
    const onJump = vi.fn();
    const onClear = vi.fn();
    const { rerender } = render(
      <CompanionDock
        sessionId="session-a"
        comments={comments}
        layout="wide"
        loading={false}
        onJump={onJump}
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /第 4 段.*第四段短评/ }));
    expect(onJump).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "收起陪读 Dock" }));
    expect(screen.getByRole("button", { name: "小叔叔陪读" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "小叔叔陪读" }));
    fireEvent.click(screen.getByRole("button", { name: "清除最近短评" }));
    expect(onClear).toHaveBeenCalledTimes(1);

    rerender(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="wide"
        loading={false}
        onJump={onJump}
      />
    );
    expect(screen.getByText("小叔叔还没留下短评。")) .toBeInTheDocument();

    rerender(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="wide"
        loading={false}
        error="短评暂时没有读取成功。"
        onJump={onJump}
      />
    );
    expect(screen.getByText("短评暂时没有读取成功。")).toBeInTheDocument();
  });

  it("shows the PiP entry only when the host supports it", () => {
    const onRequestPip = vi.fn();
    const { rerender } = render(
      <CompanionDock
        sessionId="session-a"
        comments={comments}
        layout="wide"
        loading={false}
        canRequestPip
        onRequestPip={onRequestPip}
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "悬浮陪读" }));
    expect(onRequestPip).toHaveBeenCalledTimes(1);

    rerender(
      <CompanionDock
        sessionId="session-a"
        comments={comments}
        layout="wide"
        loading={false}
        canRequestPip={false}
        onRequestPip={onRequestPip}
        onJump={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "悬浮陪读" })).not.toBeInTheDocument();
  });
  it("lets the user manually save a pending companion draft", () => {
    const onSavePendingComment = vi.fn();
    render(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="wide"
        loading={false}
        pendingCommentDraft={{
          position: { kind: "paragraph", index: 4, label: "ç¬¬ 4 æ®µ" },
          mode: "reaction_only",
          length: "short",
          source: "manual_save",
          operationId: "manual-save-draft-1"
        }}
        pendingCommentSaving={false}
        onSavePendingComment={onSavePendingComment}
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存小叔叔短评" }));
    fireEvent.change(screen.getByLabelText("短评内容"), {
      target: { value: "这句吐槽值得留下。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "收入小叔叔短评" }));

    expect(onSavePendingComment).toHaveBeenCalledWith("这句吐槽值得留下。");
  });
  it("always offers a manual companion-comment save entry when saving is available", () => {
    const onSavePendingComment = vi.fn();
    render(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="compact"
        loading={false}
        pendingCommentDraft={{
          position: { kind: "paragraph", index: 10, label: "第 10 段" },
          mode: "reaction_only",
          length: "short",
          source: "manual_save",
          operationId: "manual-save-always-visible"
        }}
        pendingCommentSaving={false}
        onSavePendingComment={onSavePendingComment}
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存小叔叔短评" }));
    fireEvent.change(screen.getByLabelText("短评内容"), {
      target: { value: "这条短评要收入小窝。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "收入小叔叔短评" }));

    expect(onSavePendingComment).toHaveBeenCalledWith("这条短评要收入小窝。");
  });
  it("keeps the manual save action visible in compact draft mode", () => {
    render(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="compact"
        loading={false}
        pendingCommentDraft={{
          position: { kind: "paragraph", index: 4, label: "Ã§Â¬Â¬ 4 Ã¦Â®Âµ" },
          mode: "reaction_only",
          length: "short",
          source: "manual_save",
          operationId: "manual-save-compact"
        }}
        pendingCommentSaving={false}
        onSavePendingComment={vi.fn()}
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存小叔叔短评" }));

    expect(screen.getByTestId("companion-dock")).toHaveClass("draft-open");
    expect(screen.getByLabelText("短评内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收入小叔叔短评" })).toBeInTheDocument();
  });
  it("keeps the draft panel open when a saved draft is replaced", () => {
    const { rerender } = render(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="compact"
        loading={false}
        pendingCommentDraft={{
          position: { kind: "paragraph", index: 12, label: "第 12 段" },
          mode: "reaction_only",
          length: "short",
          source: "manual_save",
          operationId: "manual-save-before"
        }}
        pendingCommentSaving={false}
        onSavePendingComment={vi.fn()}
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存小叔叔短评" }));
    fireEvent.change(screen.getByLabelText("短评内容"), {
      target: { value: "刚贴进来的短评。" }
    });

    rerender(
      <CompanionDock
        sessionId="session-a"
        comments={[makeComment("saved", "session-a", 12, "刚贴进来的短评。", "manual_save", "2026-06-23T05:00:00.000Z")]}
        layout="compact"
        loading={false}
        pendingCommentDraft={{
          position: { kind: "paragraph", index: 12, label: "第 12 段" },
          mode: "reaction_only",
          length: "short",
          source: "manual_save",
          operationId: "manual-save-after"
        }}
        pendingCommentSaving={false}
        onSavePendingComment={vi.fn()}
        onJump={vi.fn()}
      />
    );

    expect(screen.getByTestId("companion-dock")).toHaveClass("draft-open");
    expect(screen.getByLabelText("短评内容")).toHaveValue("");
    expect(screen.getByRole("button", { name: "收入小叔叔短评" })).toBeInTheDocument();
  });
  it("does not close the draft panel when the host layout revision changes", () => {
    const draft = {
      position: { kind: "paragraph" as const, index: 12, label: "第 12 段" },
      mode: "reaction_only" as const,
      length: "short" as const,
      source: "manual_save" as const,
      operationId: "manual-save-layout"
    };
    const { rerender } = render(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="compact"
        layoutRevision={1}
        loading={false}
        pendingCommentDraft={draft}
        pendingCommentSaving={false}
        onSavePendingComment={vi.fn()}
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存小叔叔短评" }));
    fireEvent.change(screen.getByLabelText("短评内容"), {
      target: { value: "布局刷新时别关。" }
    });

    rerender(
      <CompanionDock
        sessionId="session-a"
        comments={[]}
        layout="compact"
        layoutRevision={2}
        loading={false}
        pendingCommentDraft={draft}
        pendingCommentSaving={false}
        onSavePendingComment={vi.fn()}
        onJump={vi.fn()}
      />
    );

    expect(screen.getByTestId("companion-dock")).toHaveClass("draft-open");
    expect(screen.getByLabelText("短评内容")).toHaveValue("布局刷新时别关。");
  });
});

function makeComment(
  id: string,
  sessionId: string,
  index: number,
  text: string,
  source: CompanionComment["source"],
  createdAt: string
): CompanionComment {
  return {
    id,
    sessionId,
    position: { kind: "paragraph", index, label: `第 ${index} 段` },
    mode: source === "live_reading" ? "reaction_only" : "light_chat",
    length: source === "live_reading" ? "short" : "normal",
    text,
    source,
    inRecent: true,
    inHistory: true,
    createdAt
  };
}
