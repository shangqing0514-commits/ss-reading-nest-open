import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import { MangaReader } from "./MangaReader.js";

describe("MangaReader v0.2 positions", () => {
  it("shows separate user and assistant positions and navigation only updates the user", () => {
    const onPosition = vi.fn();
    const onLook = vi.fn();
    render(
      <MangaReader
        session={{
          id: "manga-1",
          title: "漫画",
          type: "manga",
          status: "active",
          userCurrentPosition: { kind: "page", index: 2, total: 3, label: "第 2 页" },
          assistantSyncedPosition: { kind: "page", index: 1, total: 3, label: "第 1 页" },
          liveReadingEnabled: false,
          sessionPreferences: DEFAULT_SESSION_PREFERENCES,
          sourceManifest: null,
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z",
          lastReadAt: "2026-06-22T00:00:00.000Z"
        }}
        pages={[
          { file: new File(["1"], "1.png"), url: "blob:1" },
          { file: new File(["2"], "2.png"), url: "blob:2" },
          { file: new File(["3"], "3.png"), url: "blob:3" }
        ]}
        description=""
        note=""
        onDescription={vi.fn()}
        onNote={vi.fn()}
        onPosition={onPosition}
        onLook={onLook}
        onSaveReaction={vi.fn()}
        onFinish={vi.fn()}
        onBack={vi.fn()}
        onFullscreen={vi.fn()}
        onSettings={vi.fn()}
        onMore={vi.fn()}
        companionComments={[]}
        companionLoading={false}
        companionLayout="compact"
        companionLayoutRevision={0}
        syncRequestInFlight={false}
        canRequestPip={false}
        onRequestPip={vi.fn()}
        onClearCompanionComments={vi.fn()}
        initialScrollTop={0}
        onScrollPosition={vi.fn()}
      />
    );

    expect(screen.getByText("用户读到：第 2 页")).toBeInTheDocument();
    expect(screen.getByText("小叔叔确认读到：第 1 页")).toBeInTheDocument();
    expect(screen.getByText(/待补课：第 2–2 页/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onPosition).toHaveBeenCalledWith(3);
    expect(onLook).not.toHaveBeenCalled();
  });

  it("restores the reading scroll position after a display layout change", () => {
    const props = {
      session: {
        id: "manga-scroll",
        title: "漫画",
        type: "manga" as const,
        status: "active" as const,
        userCurrentPosition: { kind: "page" as const, index: 1, total: 1, label: "第 1 页" },
        assistantSyncedPosition: null,
        liveReadingEnabled: false,
        sessionPreferences: DEFAULT_SESSION_PREFERENCES,
        sourceManifest: null,
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
        lastReadAt: "2026-06-22T00:00:00.000Z"
      },
      pages: [{ file: new File(["1"], "1.png"), url: "blob:1" }],
      description: "",
      note: "",
      onDescription: vi.fn(),
      onNote: vi.fn(),
      onPosition: vi.fn(),
      onLook: vi.fn(),
      onSaveReaction: vi.fn(),
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
      initialScrollTop: 120,
      onScrollPosition: vi.fn()
    };
    const { container, rerender } = render(
      <MangaReader {...props} companionLayoutRevision={0} />
    );
    const scroll = container.querySelector<HTMLElement>(".reader-scroll")!;
    expect(scroll.scrollTop).toBe(120);
    scroll.scrollTop = 0;

    rerender(<MangaReader {...props} companionLayout="compact" companionLayoutRevision={1} />);
    expect(scroll.scrollTop).toBe(120);
  });
});
