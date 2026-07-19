import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import { NovelReader } from "./NovelReader.js";

describe("NovelReader display layout", () => {
  it("opens the jump drawer and jumps to a chapter from the reader", () => {
    const props = {
      session: {
        id: "novel-jump",
        title: "小说",
        type: "novel" as const,
        status: "active" as const,
        userCurrentPosition: { kind: "paragraph" as const, index: 2, total: 3, label: "第 2 段" },
        assistantSyncedPosition: null,
        liveReadingEnabled: false,
        sessionPreferences: DEFAULT_SESSION_PREFERENCES,
        sourceManifest: null,
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
        lastReadAt: "2026-06-22T00:00:00.000Z"
      },
      chunks: ["序章内容。", "第一章 初见。", "第二章 风雨。"],
      onPosition: vi.fn(),
      onLook: vi.fn(),
      onSaveQuote: vi.fn(),
      onFinish: vi.fn(),
      onBack: vi.fn(),
      onFullscreen: vi.fn(),
      onSettings: vi.fn(),
      onMore: vi.fn(),
      companionComments: [],
      companionLoading: false,
      companionLayout: "wide" as const,
      syncRequestInFlight: false,
      canRequestPip: false,
      onRequestPip: vi.fn(),
      onClearCompanionComments: vi.fn(),
      initialScrollTop: 0,
      onScrollPosition: vi.fn()
    };

    render(<NovelReader {...props} companionLayoutRevision={0} />);

    fireEvent.click(screen.getByRole("button", { name: "目录 / 跳转" }));

    expect(screen.getByRole("dialog", { name: "目录 / 跳转" })).toBeInTheDocument();
    expect(screen.getByLabelText("目标段数")).toHaveValue(2);

    fireEvent.click(screen.getByRole("button", { name: /第一章 初见/ }));
    expect(props.onPosition).toHaveBeenCalledWith(2);
  });

  it("restores the reading scroll position after fullscreen or orientation changes", () => {
    const props = {
      session: {
        id: "novel-scroll",
        title: "小说",
        type: "novel" as const,
        status: "active" as const,
        userCurrentPosition: { kind: "paragraph" as const, index: 1, total: 1, label: "第 1 段" },
        assistantSyncedPosition: null,
        liveReadingEnabled: false,
        sessionPreferences: DEFAULT_SESSION_PREFERENCES,
        sourceManifest: null,
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
        lastReadAt: "2026-06-22T00:00:00.000Z"
      },
      chunks: ["第一段。"],
      onPosition: vi.fn(),
      onLook: vi.fn(),
      onSaveQuote: vi.fn(),
      onFinish: vi.fn(),
      onBack: vi.fn(),
      onFullscreen: vi.fn(),
      onSettings: vi.fn(),
      onMore: vi.fn(),
      companionComments: [],
      companionLoading: false,
      companionLayout: "wide" as const,
      syncRequestInFlight: false,
      canRequestPip: false,
      onRequestPip: vi.fn(),
      onClearCompanionComments: vi.fn(),
      initialScrollTop: 96,
      onScrollPosition: vi.fn()
    };
    const { container, rerender } = render(
      <NovelReader {...props} companionLayoutRevision={0} />
    );
    const scroll = container.querySelector<HTMLElement>(".reader-scroll")!;
    expect(scroll.scrollTop).toBe(96);
    scroll.scrollTop = 0;

    rerender(<NovelReader {...props} companionLayout="compact" companionLayoutRevision={1} />);
    expect(scroll.scrollTop).toBe(96);
  });
});
