import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import { BookManagementSheet } from "./BookManagementSheet.js";

const bundle = {
  session: {
    id: "book-a",
    title: "管理测试书",
    type: "novel" as const,
    status: "active" as const,
    userCurrentPosition: { kind: "paragraph" as const, index: 6, label: "第 6 段" },
    assistantSyncedPosition: null,
    liveReadingEnabled: false,
    sessionPreferences: DEFAULT_SESSION_PREFERENCES,
    sourceManifest: null,
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    lastReadAt: "2026-06-23T00:00:00.000Z"
  },
  quotes: [{ id: "q", sessionId: "book-a", content: "摘录内容", position: { kind: "paragraph" as const, index: 2, label: "第 2 段" }, createdAt: "2026-06-23T00:00:00.000Z" }],
  reactions: [{ id: "r", sessionId: "book-a", content: "用户反应", position: { kind: "paragraph" as const, index: 3, label: "第 3 段" }, speaker: "user" as const, createdAt: "2026-06-23T00:00:00.000Z" }],
  bookmarks: [{ id: "b", sessionId: "book-a", position: { kind: "paragraph" as const, index: 4, label: "第 4 段" }, label: "书签标签", createdAt: "2026-06-23T00:00:00.000Z" }]
};

describe("BookManagementSheet", () => {
  it("supports rename, status toggle, and lightweight record tabs", () => {
    const onRename = vi.fn();
    const onStatus = vi.fn();
    render(
      <BookManagementSheet
        bundle={bundle}
        comments={[{ id: "c", sessionId: "book-a", position: { kind: "paragraph", index: 5, label: "第 5 段" }, mode: "light_chat", length: "normal", text: "历史短评", source: "current_context", inRecent: false, inHistory: true, createdAt: "2026-06-23T00:00:00.000Z" }]}
        historyHasMore
        historyLoading={false}
        onLoadMoreHistory={vi.fn()}
        onRename={onRename}
        onStatus={onStatus}
        onClearComments={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("新的书名"), { target: { value: "新书名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存新书名" }));
    expect(onRename).toHaveBeenCalledWith("新书名");
    fireEvent.click(screen.getByRole("button", { name: "标记为已完成" }));
    expect(onStatus).toHaveBeenCalledWith("completed");

    fireEvent.click(screen.getByRole("button", { name: "摘录" }));
    expect(screen.getByText("摘录内容")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "用户反应" }));
    expect(screen.getAllByText("用户反应")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "书签" }));
    expect(screen.getByText("书签标签")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "烁构评论" }));
    expect(screen.getByText("历史短评")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载更多评论" })).toBeInTheDocument();
  });

  it("clears recent/history separately and requires two delete confirmations", () => {
    const onClearComments = vi.fn();
    const onDelete = vi.fn();
    render(
      <BookManagementSheet
        bundle={bundle}
        comments={[]}
        historyHasMore={false}
        historyLoading={false}
        onLoadMoreHistory={vi.fn()}
        onRename={vi.fn()}
        onStatus={vi.fn()}
        onClearComments={onClearComments}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "清除最近短评" }));
    fireEvent.click(screen.getByRole("button", { name: "清除历史短评" }));
    expect(onClearComments).toHaveBeenNthCalledWith(1, "recent");
    expect(onClearComments).toHaveBeenNthCalledWith(2, "history");

    fireEvent.click(screen.getByRole("button", { name: "删除这本书" }));
    expect(screen.getByText("删除这本书的云端阅读记录")).toBeInTheDocument();
    expect(screen.getByText(/会从书架移除这本书/)).toBeInTheDocument();
    const cloudCheckbox = screen.getByRole("checkbox", { name: "同时删除云端正文副本" });
    const localCheckbox = screen.getByRole("checkbox", { name: "同时删除本设备正文缓存" });
    expect(cloudCheckbox).not.toBeChecked();
    expect(localCheckbox).not.toBeChecked();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "继续删除" }));
    expect(screen.getByText("请再次确认，这个操作无法撤销。")).toBeInTheDocument();
    fireEvent.click(cloudCheckbox);
    fireEvent.click(localCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "确认删除这本书" }));
    expect(onDelete).toHaveBeenCalledWith({
      deleteCloudSource: true,
      deleteLocalCache: true
    });
  });
});
