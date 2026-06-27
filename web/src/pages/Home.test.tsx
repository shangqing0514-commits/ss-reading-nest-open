import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import { Home, type BookshelfItem } from "./Home.js";

const items: BookshelfItem[] = [
  makeItem("a", "可继续的小说", "novel", "active", "available_local", "第 8 段", "第 6 段", "这里像伏笔。"),
  makeItem("b", "缺少正文", "novel", "active", "local_only_missing", "第 12 段", null),
  makeItem("c", "版本不一致", "manga", "active", "mismatch", "第 4 页", "第 2 页"),
  makeItem("d", "分段不一致", "novel", "active", "segmentation_mismatch", "第 9 段", null),
  makeItem("e", "等待校验", "manga", "completed", "unknown", "第 30 页", "第 30 页")
];

describe("Home bookshelf core", () => {
  it("renders all session metadata and the latest comment preview", () => {
    render(<Home bookshelf={items} onNew={vi.fn()} onOpen={vi.fn()} onReimport={vi.fn()} onManage={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "我的书架" })).toBeInTheDocument();
    expect(screen.getByText("可继续的小说")).toBeInTheDocument();
    expect(screen.getByText("等待校验")).toBeInTheDocument();
    expect(screen.getAllByText("小说").length).toBeGreaterThan(0);
    expect(screen.getAllByText("漫画").length).toBeGreaterThan(0);
    expect(screen.getAllByText("阅读中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    expect(screen.getByText("用户：第 8 段")).toBeInTheDocument();
    expect(screen.getByText("烁构：第 6 段")).toBeInTheDocument();
    expect(screen.getAllByText("轻松聊聊").length).toBeGreaterThan(0);
    expect(screen.getByText(/这里像伏笔/)).toBeInTheDocument();
  });

  it("supports all required filters", () => {
    render(<Home bookshelf={items} onNew={vi.fn()} onOpen={vi.fn()} onReimport={vi.fn()} onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "已完成" }));
    expect(screen.getByText("等待校验")).toBeInTheDocument();
    expect(screen.queryByText("可继续的小说")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "正文缺失" }));
    expect(screen.getByText("缺少正文")).toBeInTheDocument();
    expect(screen.queryByText("版本不一致")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "小说" }));
    expect(screen.getByText("可继续的小说")).toBeInTheDocument();
    expect(screen.getByText("分段不一致")).toBeInTheDocument();
    expect(screen.queryByText("等待校验")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "漫画" }));
    expect(screen.getByText("版本不一致")).toBeInTheDocument();
    expect(screen.getByText("等待校验")).toBeInTheDocument();
    expect(screen.queryByText("可继续的小说")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "阅读中" }));
    expect(screen.queryByText("等待校验")).not.toBeInTheDocument();
    expect(screen.getByText("可继续的小说")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.getByText("等待校验")).toBeInTheDocument();
    expect(screen.getByText("可继续的小说")).toBeInTheDocument();
  });

  it("opens only available books and routes all unsafe states to reimport", () => {
    const onOpen = vi.fn();
    const onReimport = vi.fn();
    render(<Home bookshelf={items} onNew={vi.fn()} onOpen={onOpen} onReimport={onReimport} onManage={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "继续阅读《可继续的小说》" }));
    expect(onOpen).toHaveBeenCalledWith(items[0]);

    fireEvent.click(screen.getByRole("button", { name: "重新导入正文《缺少正文》" }));
    fireEvent.click(screen.getByRole("button", { name: "重新导入正确版本《版本不一致》" }));
    fireEvent.click(screen.getByRole("button", { name: "重新分段《分段不一致》" }));
    fireEvent.click(screen.getByRole("button", { name: "验证正文《等待校验》" }));
    expect(onReimport.mock.calls.map(([item]) => item.session.id)).toEqual(["b", "c", "d", "e"]);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows cloud restore states without exposing storage details", () => {
    const cloudItems: BookshelfItem[] = [
      makeItem("cloud", "云端书", "novel", "active", "available_cloud", "第 2 段", null),
      makeItem("restoring", "恢复中书", "novel", "active", "restoring_from_cloud", "第 3 段", null),
      makeItem("failed", "失败书", "novel", "active", "cloud_restore_failed", "第 4 段", null)
    ];
    render(<Home bookshelf={cloudItems} onNew={vi.fn()} onOpen={vi.fn()} onReimport={vi.fn()} onManage={vi.fn()} />);

    expect(screen.getByText("云端可恢复")).toBeInTheDocument();
    expect(screen.getByText("正在从私人云端恢复正文")).toBeInTheDocument();
    expect(screen.getByText("恢复失败，请重新导入")).toBeInTheDocument();
    expect(screen.queryByText(/R2|objectKey|hash/)).not.toBeInTheDocument();
  });
});

function makeItem(
  id: string,
  title: string,
  type: "novel" | "manga",
  status: "active" | "completed",
  sourceAvailability: BookshelfItem["sourceAvailability"],
  userLabel: string,
  assistantLabel: string | null,
  latestComment?: string
): BookshelfItem {
  return {
    session: {
      id,
      title,
      type,
      status,
      userCurrentPosition: {
        kind: type === "novel" ? "paragraph" : "page",
        index: Number(userLabel.match(/\d+/)?.[0] ?? 1),
        label: userLabel
      },
      assistantSyncedPosition: assistantLabel
        ? {
            kind: type === "novel" ? "paragraph" : "page",
            index: Number(assistantLabel.match(/\d+/)?.[0] ?? 1),
            label: assistantLabel
          }
        : null,
      liveReadingEnabled: false,
      sessionPreferences: DEFAULT_SESSION_PREFERENCES,
      sourceManifest: null,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z",
      lastReadAt: "2026-06-23T00:00:00.000Z"
    },
    quotes: [],
    reactions: [],
    bookmarks: [],
    sourceAvailability,
    ...(latestComment ? { latestComment } : {})
  };
}
