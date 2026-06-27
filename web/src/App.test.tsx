import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MangaLocalCache, NovelLocalCache, SessionBundle, SourceManifest } from "@ss/shared";
import { App } from "./App.js";
import { createNovelSourceManifest } from "./features/source-identity/source-manifest.js";
import { IndexedDbReadingCache } from "./storage/indexeddb-cache.js";

describe("App", () => {
  beforeEach(() => {
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool: vi.fn()
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the two reading modes and bookshelf section", () => {
    render(<App />);
    expect(screen.getByText("S×S 小窝共读")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /小说共读/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /漫画共读/ })).toBeInTheDocument();
    expect(screen.getByText("我的书架")).toBeInTheDocument();
  });

  it("opens the novel setup without exposing model API settings", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    expect(screen.getByLabelText("作品名")).toBeInTheDocument();
    expect(screen.queryByText(/API key/i)).not.toBeInTheDocument();
  });

  it("includes the current paragraph in the follow-up when model-context sync is unavailable", async () => {
    const visualViewport = new EventTarget() as VisualViewport;
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      value: 900
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewport
    });
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-1",
              title: "测试小说",
              type: "novel",
              status: "active",
              userCurrentPosition: {
                kind: "paragraph",
                index: 1,
                total: 1,
                label: "第 1 段"
              },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        const sourceManifest = {
          sourceId: "bridge-source",
          sourceKind: "pasted_text" as const,
          contentHash: "a".repeat(64),
          segmentationVersion: 1,
          paragraphCount: 1,
          cloudSync: {
            enabled: true,
            provider: "r2" as const,
            objectKey: "private/sources/bridge-source/source.txt"
          }
        };
        return {
          structuredContent: {
            uploaded: true,
            sessionId: args.sessionId,
            sourceId: "bridge-source",
            contentHash: "a".repeat(64),
            paragraphCount: 1,
            cloudSync: { enabled: true, provider: "r2" }
          },
          _meta: { sourceManifest }
        };
      }
      if (name === "send_current_context") {
        return {
          structuredContent: {
            context: {
              title: "测试小说",
              position: args.position,
              currentText: args.currentText
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return {
          structuredContent: {
            sourceManifest: args.sourceManifest
          }
        };
      }
      return { structuredContent: {} };
    });
    const sendFollowUpMessage = vi.fn();
    const requestDisplayMode = vi.fn().mockResolvedValue(undefined);
    const setWidgetState = vi.fn();
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        sendFollowUpMessage,
        requestDisplayMode,
        setWidgetState
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "测试小说" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "这是 GPT 必须看到的当前段落。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    await screen.findByText("这是 GPT 必须看到的当前段落。");
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        "set_source_manifest",
        expect.objectContaining({
          sessionId: "session-1",
          sourceManifest: expect.objectContaining({
            sourceKind: "pasted_text",
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            segmentationVersion: 1,
            paragraphCount: 1
          })
        })
      );
      expect(requestDisplayMode).not.toHaveBeenCalledWith({ mode: "fullscreen" });
      expect(screen.getByRole("button", { name: "全屏阅读" })).toBeInTheDocument();
      expect(setWidgetState).toHaveBeenCalledWith(
        expect.objectContaining({
          screen: "novel",
          sessionId: "session-1",
          positionIndex: 1
        })
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
    await waitFor(() => {
      expect(requestDisplayMode).toHaveBeenCalledWith({ mode: "fullscreen" });
    });
    expect(screen.getByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出全屏" }).closest("main")).toHaveClass(
      "reader-immersive"
    );
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      value: 520
    });
    visualViewport.dispatchEvent(new Event("resize"));
    await waitFor(() => {
      expect(requestDisplayMode).toHaveBeenCalledWith({ mode: "inline" });
      expect(screen.getByRole("button", { name: "全屏阅读" })).toBeInTheDocument();
    });
    expect(screen.getByText("这是 GPT 必须看到的当前段落。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "陪我看看这里" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        "send_current_context",
        expect.objectContaining({
          sourceContext: expect.objectContaining({
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            segmentationVersion: 1,
            paragraphCount: 1
          })
        })
      );
      expect(sendFollowUpMessage).toHaveBeenCalledWith({
        prompt: expect.stringContaining("这是 GPT 必须看到的当前段落。"),
        scrollToBottom: false
      });
    });
  });

  it("does not ask ChatGPT to publish a Dock comment when companion auto-save is off", async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-no-dock",
              title: "No Dock Book",
              type: "novel",
              status: "active",
              userCurrentPosition: { kind: "paragraph", index: 1, total: 1, label: "ç¬¬ 1 æ®µ" },
              assistantSyncedPosition: { kind: "paragraph", index: 1, total: 1, label: "ç¬¬ 1 æ®µ" },
              liveReadingEnabled: false,
              sessionPreferences: {
                readingCommentMode: "reaction_only",
                commentLength: "short",
                allowDeepAnalysisByDefault: false,
                liveReadingStyle: "danmaku",
                autoSaveCompanionComments: false
              },
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        return {
          structuredContent: {
            uploaded: true,
            sessionId: args.sessionId,
            sourceId: "no-dock-source",
            contentHash: "c".repeat(64),
            paragraphCount: 1,
            cloudSync: { enabled: true, provider: "r2" }
          },
          _meta: {
            sourceManifest: {
              sourceId: "no-dock-source",
              sourceKind: "pasted_text",
              contentHash: "c".repeat(64),
              segmentationVersion: 1,
              paragraphCount: 1,
              cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/no-dock-source/source.txt" }
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      if (name === "send_current_context") {
        return {
          structuredContent: {
            context: {
              title: "No Dock Book",
              position: args.position,
              currentText: args.currentText
            }
          }
        };
      }
      return { structuredContent: {} };
    });
    const sendFollowUpMessage = vi.fn();
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        sendFollowUpMessage,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "No Dock Book" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "不要写回 Dock。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    fireEvent.click(await screen.findByRole("button", { name: "陪我看看这里" }));

    await waitFor(() => expect(sendFollowUpMessage).toHaveBeenCalled());
    const prompt = String(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt ?? "");
    expect(prompt).not.toContain("publish_companion_comment");
    expect(prompt).toContain("不自动保存短评到 Dock");
    expect(prompt).toContain("不要调用任何应用写回工具");
    expect(prompt).toContain("直接在聊天区回复短评");
  });

  it("disables the current-paragraph action while a sync request is in flight", async () => {
    let resolveContext: ((value: unknown) => void) | undefined;
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-pending",
              title: "Pending Book",
              type: "novel",
              status: "active",
              userCurrentPosition: { kind: "paragraph", index: 1, total: 1, label: "第 1 段" },
              assistantSyncedPosition: { kind: "paragraph", index: 1, total: 1, label: "第 1 段" },
              liveReadingEnabled: false,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        return {
          structuredContent: {
            uploaded: true,
            sessionId: args.sessionId,
            sourceId: "pending-source",
            contentHash: "b".repeat(64),
            paragraphCount: 1,
            cloudSync: { enabled: true, provider: "r2" }
          },
          _meta: {
            sourceManifest: {
              sourceId: "pending-source",
              sourceKind: "pasted_text",
              contentHash: "b".repeat(64),
              segmentationVersion: 1,
              paragraphCount: 1,
              cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/pending-source/source.txt" }
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      if (name === "send_current_context") {
        return await new Promise((resolve) => {
          resolveContext = resolve;
        });
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        sendFollowUpMessage: vi.fn(),
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "Pending Book" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "等一下。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    const action = await screen.findByRole("button", { name: "陪我看看这里" });

    fireEvent.click(action);
    await waitFor(() => expect(action).toBeDisabled());
    fireEvent.click(action);
    expect(callTool.mock.calls.filter(([name]) => name === "send_current_context")).toHaveLength(1);

    resolveContext?.({
      structuredContent: {
        context: {
          title: "Pending Book",
          position: { kind: "paragraph", index: 1, label: "第 1 段" },
          currentText: "等一下。"
        }
      }
    });
    await waitFor(() => expect(action).not.toBeDisabled());
  });

  it("shows dual-position status and asks before a large catch-up", async () => {
    const callTool = vi.fn(async (name: string) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-large",
              title: "长篇测试",
              type: "novel",
              status: "active",
              userCurrentPosition: {
                kind: "paragraph",
                index: 1,
                total: 28,
                label: "第 1 段"
              },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        sendFollowUpMessage: vi.fn(),
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "长篇测试" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: {
        value: Array.from({ length: 28 }, (_, index) => `第 ${index + 1} 段内容`).join("\n\n")
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    await screen.findByText(/烁构确认读到：尚未同步/);

    for (let index = 0; index < 27; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "下一段" }));
    }
    await screen.findByText(/用户读到：第 28 段/);
    fireEvent.click(screen.getByRole("button", { name: "陪我看看这里" }));

    expect(await screen.findByText("中间有较多剧情，要怎么同步？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完整补课后再陪读/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "只看当前段" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "补最近 5 段" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /完整补课后再陪读/ }));
    const confirmButton = await screen.findByRole("button", {
      name: /我看到烁构回复“已读到第 28 段”，开始正式陪读/
    });
    expect(callTool).not.toHaveBeenCalledWith(
      "confirm_assistant_synced_position",
      expect.anything()
    );

    fireEvent.click(confirmButton);
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        "confirm_assistant_synced_position",
        expect.objectContaining({
          confirmedPosition: expect.objectContaining({ index: 28 })
        })
      );
    });
  });

  it("serializes catch-up and formal comments without resending the same batch", async () => {
    const deviceCache = new IndexedDbReadingCache();
    const sourceManifest = {
      ...manifest("sequence-source", "8"),
      segmentationVersion: 2,
      paragraphCount: 8
    };
    await deviceCache.put(
      novelCache(
        "sequence-session",
        "编排测试",
        sourceManifest,
        Array.from({ length: 8 }, (_, index) => `第 ${index + 1} 段内容`)
      )
    );
    const baseBundle = bookshelfBundle(
      "sequence-session",
      "编排测试",
      8,
      "light_chat",
      sourceManifest
    );
    const bundle = {
      ...baseBundle,
      session: {
        ...baseBundle.session,
        assistantSyncedPosition: {
          kind: "paragraph" as const,
          index: 6,
          total: 8,
          label: "第 6 段"
        },
        sessionPreferences: {
          ...baseBundle.session.sessionPreferences,
          autoSaveCompanionComments: false
        }
      }
    };
    const callTool = vi.fn(async (name: string) => {
      if (name === "list_companion_comments") {
        return { structuredContent: { comments: [] } };
      }
      if (name === "send_current_context") {
        return { structuredContent: { context: { ok: true } } };
      }
      if (name === "confirm_assistant_synced_position") {
        return { structuredContent: { confirmed: true } };
      }
      return { structuredContent: {} };
    });
    const sendFollowUpMessage = vi.fn((input: { prompt: string }) =>
      input.prompt.includes("补课已确认完成")
        ? new Promise(() => undefined)
        : Promise.resolve(undefined)
    );
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle] },
        callTool,
        sendFollowUpMessage,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "继续阅读《编排测试》" }));
    const lookButton = await screen.findByRole("button", { name: "陪我看看这里" });
    fireEvent.click(lookButton);

    await waitFor(() => expect(sendFollowUpMessage).toHaveBeenCalledTimes(1));
    expect(String(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt)).toContain("第 7");
    expect(String(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt)).toContain("第 8");
    expect(String(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt)).toContain("只简短回复");

    fireEvent.click(lookButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sendFollowUpMessage).toHaveBeenCalledTimes(1);

    fireEvent.click(
      await screen.findByRole("button", {
        name: /已读到第 8 段.*正式陪读/
      })
    );
    await waitFor(() => expect(sendFollowUpMessage).toHaveBeenCalledTimes(2));
    expect(String(sendFollowUpMessage.mock.calls[1]?.[0]?.prompt)).toContain("补课已确认完成");
    expect(String(sendFollowUpMessage.mock.calls[1]?.[0]?.prompt)).not.toContain("只简短回复");
    expect(screen.queryByText("烁构补课中")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "保存烁构短评" })).toBeInTheDocument();

    await deviceCache.remove("sequence-session");
  });

  it("persists per-session preferences from the secondary actions sheet", async () => {
    let preferences = {
      readingCommentMode: "light_chat",
      commentLength: "normal",
      allowDeepAnalysisByDefault: false,
      liveReadingStyle: "danmaku",
      autoSaveCompanionComments: true
    };
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-preferences",
              title: "偏好测试",
              type: "novel",
              status: "active",
              userCurrentPosition: {
                kind: "paragraph",
                index: 1,
                total: 1,
                label: "第 1 段"
              },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              sessionPreferences: preferences,
              sourceManifest: null,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      if (name === "update_session_preferences") {
        preferences = { ...preferences, ...args.preferences };
        return { structuredContent: { sessionPreferences: preferences } };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        sendFollowUpMessage: vi.fn(),
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "偏好测试" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "第一段。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    fireEvent.click(await screen.findByRole("button", { name: "更多操作" }));

    expect(await screen.findByText("这次想怎么陪读")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "认真分析" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("update_session_preferences", {
        sessionId: "session-preferences",
        preferences: {
          readingCommentMode: "deep_analysis",
          commentLength: "normal"
        }
      });
      expect(screen.getByRole("button", { name: "认真分析" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("button", { name: "长评" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "自动保存烁构陪读短评" }));
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("update_session_preferences", {
        sessionId: "session-preferences",
        preferences: { autoSaveCompanionComments: false }
      });
      expect(screen.getByRole("checkbox", { name: "自动保存烁构陪读短评" })).not.toBeChecked();
    });

    fireEvent.click(screen.getByRole("button", { name: "立即吐槽" }));
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("update_session_preferences", {
        sessionId: "session-preferences",
        preferences: {
          readingCommentMode: "reaction_only",
          commentLength: "short"
        }
      });
      expect(callTool).toHaveBeenCalledWith(
        "send_current_context",
        expect.objectContaining({
          sessionId: "session-preferences",
          mode: "current_only",
          readingCommentMode: "reaction_only",
          commentLength: "short",
          currentText: "第一段。"
        })
      );
    });
  });

  it("updates the current bookshelf management records after saving a bookmark and quote", async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-records",
              title: "记录测试",
              type: "novel",
              status: "active",
              userCurrentPosition: { kind: "paragraph", index: 1, total: 1, label: "第 1 段" },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              sessionPreferences: {
                readingCommentMode: "light_chat",
                commentLength: "normal",
                allowDeepAnalysisByDefault: false,
                liveReadingStyle: "danmaku",
                autoSaveCompanionComments: false
              },
              sourceManifest: null,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        return {
          structuredContent: {
            uploaded: true,
            sessionId: args.sessionId,
            sourceId: "records-source",
            contentHash: "d".repeat(64),
            paragraphCount: 1,
            cloudSync: { enabled: true, provider: "r2" }
          },
          _meta: {
            sourceManifest: {
              sourceId: "records-source",
              sourceKind: "pasted_text",
              contentHash: "d".repeat(64),
              segmentationVersion: 2,
              paragraphCount: 1,
              cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/records-source/source.txt" }
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      if (name === "save_bookmark") {
        return {
          structuredContent: {
            bookmark: {
              id: "bookmark-records",
              sessionId: args.sessionId,
              position: args.position,
              label: "第 1 段",
              createdAt: "2026-06-23T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "save_quote") {
        return {
          structuredContent: {
            quote: {
              id: "quote-records",
              sessionId: args.sessionId,
              content: args.content,
              position: args.position,
              createdAt: "2026-06-23T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "list_companion_comments") {
        return { structuredContent: { comments: [] } };
      }
      return { structuredContent: {} };
    });
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "值得保存的句子"
    } as Selection);
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        sendFollowUpMessage: vi.fn(),
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "记录测试" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "值得保存的句子" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    await screen.findByRole("button", { name: "陪我看看这里" });

    fireEvent.mouseUp(screen.getByText("值得保存的句子"));
    fireEvent.click(screen.getByRole("button", { name: "保存这句" }));
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(await screen.findByRole("button", { name: "保存书签" }));
    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));
    fireEvent.click(await screen.findByRole("button", { name: "管理《记录测试》" }));

    expect(await screen.findByRole("dialog", { name: "管理《记录测试》" })).toBeInTheDocument();
    expect(screen.getAllByText("第 1 段").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "摘录" }));
    expect(screen.getByText("值得保存的句子")).toBeInTheDocument();
  });

  it("manually saves a companion draft without blocking the chat flow", async () => {
    let savedComment: Record<string, any> | null = null;
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-manual-comment",
              title: "短评保存测试",
              type: "novel",
              status: "active",
              userCurrentPosition: { kind: "paragraph", index: 1, total: 1, label: "第 1 段" },
              assistantSyncedPosition: { kind: "paragraph", index: 1, total: 1, label: "第 1 段" },
              liveReadingEnabled: false,
              sessionPreferences: {
                readingCommentMode: "reaction_only",
                commentLength: "short",
                allowDeepAnalysisByDefault: false,
                liveReadingStyle: "danmaku",
                autoSaveCompanionComments: false
              },
              sourceManifest: null,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        return {
          structuredContent: {
            uploaded: true,
            sessionId: args.sessionId,
            sourceId: "manual-comment-source",
            contentHash: "e".repeat(64),
            paragraphCount: 1,
            cloudSync: { enabled: true, provider: "r2" }
          },
          _meta: {
            sourceManifest: {
              sourceId: "manual-comment-source",
              sourceKind: "pasted_text",
              contentHash: "e".repeat(64),
              segmentationVersion: 2,
              paragraphCount: 1,
              cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/manual-comment-source/source.txt" }
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      if (name === "send_current_context") {
        return {
          structuredContent: {
            context: {
              title: "短评保存测试",
              position: args.currentPosition,
              currentText: args.currentText
            }
          }
        };
      }
      if (name === "publish_companion_comment") {
        savedComment = {
          id: "manual-comment-1",
          ...args,
          inRecent: true,
          inHistory: true,
          createdAt: "2026-06-23T00:00:00.000Z"
        };
        return { structuredContent: { comment: savedComment } };
      }
      if (name === "list_companion_comments") {
        return { structuredContent: { comments: savedComment ? [savedComment] : [] } };
      }
      return { structuredContent: {} };
    });
    const sendFollowUpMessage = vi.fn();
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        sendFollowUpMessage,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "短评保存测试" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "这段需要烁构吐槽一下。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    await screen.findByRole("button", { name: "陪我看看这里" });
    expect(await screen.findByRole("button", { name: "保存烁构短评" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全屏阅读" }));
    expect(await screen.findByRole("button", { name: "退出全屏" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "陪我看看这里" }));
    await waitFor(() => expect(sendFollowUpMessage).toHaveBeenCalled());
    expect(callTool).not.toHaveBeenCalledWith(
      "publish_companion_comment",
      expect.anything()
    );

    fireEvent.click(await screen.findByRole("button", { name: "保存烁构短评" }));
    fireEvent.change(screen.getByLabelText("短评内容"), {
      target: { value: "这句吐槽值得贴到小窝。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "收入烁构短评" }));

    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        "publish_companion_comment",
        expect.objectContaining({
          sessionId: "session-manual-comment",
          text: "这句吐槽值得贴到小窝。",
          source: "manual_save",
          position: expect.objectContaining({ index: 1 })
        })
      );
    });
    expect(await screen.findByText("这句吐槽值得贴到小窝。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    expect(screen.getByLabelText("短评内容")).toHaveValue("");
    expect(screen.getByRole("button", { name: "收入烁构短评" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("短评内容"), {
      target: { value: "这句吐槽值得贴到小窝。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "收入烁构短评" }));
    await waitFor(() => {
      expect(
        callTool.mock.calls.filter(([name]) => name === "publish_companion_comment")
      ).toHaveLength(1);
    });
    expect(await screen.findByText("这条短评已经保存过啦。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));
    fireEvent.click(await screen.findByRole("button", { name: "管理《短评保存测试》" }));
    fireEvent.click(await screen.findByRole("button", { name: "烁构评论" }));
    expect(screen.getByText("这句吐槽值得贴到小窝。")).toBeInTheDocument();
  });

  it("does not fake a saved preference when the tool fails", async () => {
    const sessionPreferences = {
      readingCommentMode: "light_chat",
      commentLength: "normal",
      allowDeepAnalysisByDefault: false,
      liveReadingStyle: "danmaku",
      autoSaveCompanionComments: true
    };
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-failed-preference",
              title: "失败测试",
              type: "novel",
              status: "active",
              userCurrentPosition: {
                kind: "paragraph",
                index: 1,
                total: 1,
                label: "第 1 段"
              },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              sessionPreferences,
              sourceManifest: null,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z",
              lastReadAt: "2026-06-22T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      if (name === "update_session_preferences") throw new Error("network");
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "失败测试" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "第一段。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    fireEvent.click(await screen.findByRole("button", { name: "更多操作" }));
    fireEvent.click(await screen.findByRole("button", { name: "猜后续" }));

    expect(await screen.findByText("陪读偏好没有保存成功，请重试。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "轻松聊聊" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("loads only the current session's published comments and keeps paging after display changes", async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "session-dock",
              title: "陪读 Dock 测试",
              type: "novel",
              status: "active",
              userCurrentPosition: { kind: "paragraph", index: 1, total: 2, label: "第 1 段" },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              sessionPreferences: {
                readingCommentMode: "light_chat",
                commentLength: "normal",
                allowDeepAnalysisByDefault: false,
                liveReadingStyle: "danmaku",
                autoSaveCompanionComments: true
              },
              sourceManifest: null,
              createdAt: "2026-06-23T00:00:00.000Z",
              updatedAt: "2026-06-23T00:00:00.000Z",
              lastReadAt: "2026-06-23T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      if (name === "list_companion_comments") {
        return {
          structuredContent: {
            comments: [
              {
                id: "current-comment",
                sessionId: "session-dock",
                position: { kind: "paragraph", index: 1, label: "第 1 段" },
                mode: "reaction_only",
                length: "short",
                text: "这句也太会了。",
                source: "live_reading",
                inRecent: true,
                inHistory: true,
                createdAt: "2026-06-23T01:00:00.000Z"
              },
              {
                id: "other-comment",
                sessionId: "another-session",
                position: { kind: "paragraph", index: 1, label: "第 1 段" },
                mode: "light_chat",
                length: "normal",
                text: "别的书的短评",
                source: "current_context",
                inRecent: true,
                inHistory: true,
                createdAt: "2026-06-23T02:00:00.000Z"
              }
            ]
          }
        };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [] },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "陪读 Dock 测试" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: "第一段。\n\n第二段。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));

    expect(await screen.findByText("这句也太会了。")).toBeInTheDocument();
    expect(screen.queryByText("别的书的短评")).not.toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith("list_companion_comments", {
      sessionId: "session-dock",
      scope: "recent",
      limit: 20
    });

    fireEvent.click(screen.getByRole("button", { name: "清除最近短评" }));
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith("clear_companion_comments", {
        sessionId: "session-dock",
        scope: "recent"
      });
      expect(screen.queryByText("这句也太会了。")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "下一段" }));
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        "update_reading_position",
        expect.objectContaining({
          sessionId: "session-dock",
          userCurrentPosition: expect.objectContaining({ index: 2 })
        })
      );
    });

    fireEvent(
      window,
      new CustomEvent("openai:host-context-changed", {
        detail: {
          displayMode: "inline",
          containerDimensions: { width: 768, height: 1024 }
        }
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "上一段" }));
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        "update_reading_position",
        expect.objectContaining({
          sessionId: "session-dock",
          userCurrentPosition: expect.objectContaining({ index: 1 })
        })
      );
    });
  });

  it("shows published catch-up comments while an existing book is waiting for source reimport", async () => {
    const sessionManifest = {
      ...manifest("setup-source", "f"),
      paragraphCount: 8
    };
    const bundle = bookshelfBundle("setup-comment-session", "Setup Comment Book", 3, "light_chat", sessionManifest);
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "list_companion_comments") {
        return {
          structuredContent: {
            comments: [
              {
                id: "catch-up-comment",
                sessionId: "setup-comment-session",
                position: { kind: "paragraph", index: 8, label: "第 8 段" },
                mode: "light_chat",
                length: "normal",
                text: "第八段这个反转像小钩子，先别放过它。",
                source: "catch_up_complete",
                inRecent: true,
                inHistory: true,
                operationId: "catch-up-comment-batch-final",
                createdAt: "2026-06-23T03:00:00.000Z"
              }
            ]
          }
        };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle] },
        widgetState: {
          screen: "setup",
          sessionId: "setup-comment-session",
          positionIndex: 3
        },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);

    expect(await screen.findByText("继续《Setup Comment Book》")).toBeInTheDocument();
    expect(await screen.findByText("第八段这个反转像小钩子，先别放过它。")).toBeInTheDocument();
    expect(screen.getByText(/重新导入正文后，陪读 Dock 会继续显示这些短评/)).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith("list_companion_comments", {
      sessionId: "setup-comment-session",
      scope: "recent",
      limit: 20
    });
  });

  it("shows recent catch-up comments in the reader even when the comment position differs from the current paragraph", async () => {
    const deviceCache = new IndexedDbReadingCache();
    const sessionManifest = {
      ...manifest("reader-source", "1"),
      paragraphCount: 8
    };
    await deviceCache.put(
      novelCache(
        "reader-comment-session",
        "Reader Comment Book",
        sessionManifest,
        [
          "第一段",
          "第二段",
          "第三段",
          "第四段",
          "第五段",
          "第六段",
          "第七段",
          "第八段"
        ]
      )
    );
    const bundle = bookshelfBundle("reader-comment-session", "Reader Comment Book", 3, "light_chat", sessionManifest);
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "list_companion_comments") {
        return {
          structuredContent: {
            comments: [
              {
                id: "reader-catch-up-comment",
                sessionId: "reader-comment-session",
                position: { kind: "paragraph", index: 8, label: "第 8 段" },
                mode: "light_chat",
                length: "normal",
                text: "烁构已经追到第八段啦，这里可以接着聊。",
                source: "catch_up_complete",
                inRecent: true,
                inHistory: true,
                operationId: "catch-up-comment-final-reader",
                createdAt: "2026-06-23T03:00:00.000Z"
              }
            ]
          }
        };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle] },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "继续阅读《Reader Comment Book》" }));

    expect(await screen.findByText("用户读到：第 3 段")).toBeInTheDocument();
    expect(await screen.findByText("烁构已经追到第八段啦，这里可以接着聊。")).toBeInTheDocument();
    expect(screen.getByText("第 8 段")).toBeInTheDocument();
    await deviceCache.remove("reader-comment-session");
  });

  it("keeps a reimported existing novel available after an iPad-like widget refresh", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("ipad-refresh-session");
    const sourceText = "第一段。\n\n第二段。";
    const sourceManifest = await createNovelSourceManifest({
      sourceId: "ipad-refresh-source",
      sourceKind: "pasted_text",
      title: "iPad Refresh Book",
      sourceText
    });
    const bundle = bookshelfBundle(
      "ipad-refresh-session",
      "iPad Refresh Book",
      2,
      "light_chat",
      sourceManifest
    );
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "list_companion_comments") {
        return { structuredContent: { comments: [] } };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle] },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    const firstRender = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "重新导入正文《iPad Refresh Book》" }));
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: sourceText }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));
    expect(await screen.findByText("用户读到：第 2 段")).toBeInTheDocument();
    expect(await deviceCache.get("ipad-refresh-session")).not.toBeNull();

    firstRender.unmount();
    render(<App />);

    expect(await screen.findByText("当前设备可读")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "继续阅读《iPad Refresh Book》" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续阅读《iPad Refresh Book》" }));
    expect(await screen.findByText("用户读到：第 2 段")).toBeInTheDocument();
    await deviceCache.remove("ipad-refresh-session");
  });

  it("uploads new novels through the app bridge and keeps source text out of assistant-visible state", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("cloud-upload-session");
    const sourceText = "云端第一段。\n\n云端第二段。";
    const localManifest = await createNovelSourceManifest({
      sourceId: "cloud-upload-source",
      sourceKind: "pasted_text",
      title: "云端上传书",
      sourceText
    });
    const cloudManifest: SourceManifest = {
      ...localManifest,
      cloudSync: {
        enabled: true,
        provider: "r2",
        objectKey: "private/sources/cloud-upload-source/source.txt",
        manifestObjectKey: "private/sources/cloud-upload-source/manifest.json"
      }
    };
    const fetchMock = vi.fn(async () => jsonResponse({ sourceManifest: cloudManifest }));
    vi.stubGlobal("fetch", fetchMock);
    const setWidgetState = vi.fn();
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "cloud-upload-session",
              title: "云端上传书",
              type: "novel",
              status: "active",
              userCurrentPosition: { kind: "paragraph", index: 1, total: 2, label: "第 1 段" },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              sessionPreferences: undefined,
              sourceManifest: null,
              createdAt: "2026-06-24T00:00:00.000Z",
              updatedAt: "2026-06-24T00:00:00.000Z",
              lastReadAt: "2026-06-24T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        return {
          structuredContent: {
            uploaded: true,
            sessionId: "cloud-upload-session",
            sourceId: "cloud-upload-source",
            contentHash: cloudManifest.contentHash,
            paragraphCount: 2,
            cloudSync: { enabled: true, provider: "r2" }
          },
          _meta: { sourceManifest: cloudManifest }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: {
          recentSessions: [],
          sourceEndpointBase: "https://worker.example.test/source/secret"
        },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "云端上传书" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: sourceText }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));

    expect(await screen.findByText("用户读到：第 1 段")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callTool).toHaveBeenCalledWith(
      "upload_cloud_source",
      expect.objectContaining({
        sessionId: "cloud-upload-session",
        sourceKind: "pasted_text",
        sourceText
      })
    );
    expect(callTool).toHaveBeenCalledWith(
      "set_source_manifest",
      expect.objectContaining({
        sessionId: "cloud-upload-session",
        sourceManifest: expect.objectContaining({
          cloudSync: expect.objectContaining({ enabled: true })
        })
      })
    );
    expect(await deviceCache.get("cloud-upload-session")).toMatchObject({
      metadata: {
        sourceManifest: expect.objectContaining({
          cloudSync: expect.objectContaining({ enabled: true })
        })
      }
    });
    expect(JSON.stringify(setWidgetState.mock.calls)).not.toContain(sourceText);
    await deviceCache.remove("cloud-upload-session");
  });

  it("does not overwrite a server-side bridge upload when private manifest metadata is unavailable", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("bridge-no-meta-session");
    const sourceText = "bridge only paragraph";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "bridge-no-meta-session",
              title: "Bridge No Meta",
              type: "novel",
              status: "active",
              userCurrentPosition: { kind: "paragraph", index: 1, total: 1, label: "第 1 段" },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              sessionPreferences: undefined,
              sourceManifest: null,
              createdAt: "2026-06-24T00:00:00.000Z",
              updatedAt: "2026-06-24T00:00:00.000Z",
              lastReadAt: "2026-06-24T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        return {
          structuredContent: {
            uploaded: true,
            sessionId: args.sessionId,
            sourceId: "bridge-no-meta-source",
            contentHash: "d".repeat(64),
            paragraphCount: 1,
            cloudSync: { enabled: true, provider: "r2" }
          }
        };
      }
      if (name === "get_cloud_source_status") {
        return { structuredContent: { status: "available" } };
      }
      if (name === "set_source_manifest") {
        throw new Error("set_source_manifest should not be called");
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: {
          recentSessions: [],
          sourceEndpointBase: "https://worker.example.test/source/secret"
        },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /小说共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "Bridge No Meta" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 TXT 或 Markdown 文本"), {
      target: { value: sourceText }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));

    expect(await screen.findByText("bridge only paragraph")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(callTool).toHaveBeenCalledWith(
        "upload_cloud_source",
        expect.objectContaining({
          sessionId: "bridge-no-meta-session",
          sourceKind: "pasted_text",
          sourceText
        })
      );
      expect(callTool).toHaveBeenCalledWith("get_cloud_source_status", {
        sessionId: "bridge-no-meta-session"
      });
    });
    expect(callTool).not.toHaveBeenCalledWith("set_source_manifest", expect.anything());
    expect(screen.queryByText(/云端同步失败/)).not.toBeInTheDocument();
    await deviceCache.remove("bridge-no-meta-session");
  });

  it("automatically restores a cloud novel on Home when local cache is missing", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("cloud-restore-session");
    const sourceText = "恢复第一段。\n\n恢复第二段。";
    const baseManifest = await createNovelSourceManifest({
      sourceId: "cloud-restore-source",
      sourceKind: "pasted_text",
      title: "云端恢复书",
      sourceText
    });
    const cloudManifest = withCloudSync(baseManifest, "cloud-restore-source");
    const bundle = bookshelfBundle("cloud-restore-session", "云端恢复书", 2, "light_chat", cloudManifest);
    const fetchMock = vi.fn(async () =>
      jsonResponse({ sourceText, sourceManifest: cloudManifest })
    );
    vi.stubGlobal("fetch", fetchMock);
    const callTool = vi.fn(async (name: string) => {
      if (name === "list_companion_comments") return { structuredContent: { comments: [] } };
      return { structuredContent: {} };
    });
    const setWidgetState = vi.fn();
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle], sourceEndpointBase: "/source/secret" },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState
      }
    });

    render(<App />);

    expect(await screen.findByText("正在从私人云端恢复正文")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/source/secret/restore",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByText("当前设备可读")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "继续阅读《云端恢复书》" })
    ).toBeEnabled();
    expect(await deviceCache.get("cloud-restore-session")).toMatchObject({
      sourceText,
      metadata: { sourceManifest: expect.objectContaining({ sourceId: "cloud-restore-source" }) }
    });
    expect(JSON.stringify(callTool.mock.calls)).not.toContain(sourceText);
    expect(JSON.stringify(setWidgetState.mock.calls)).not.toContain(sourceText);
    await deviceCache.remove("cloud-restore-session");
  });

  it("shows restore failure without changing reading records or writing failed source text", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("cloud-fail-session");
    const cloudManifest = withCloudSync(manifest("cloud-fail-source", "f"), "cloud-fail-source");
    const bundle = bookshelfBundle("cloud-fail-session", "恢复失败书", 3, "cp_talk", cloudManifest);
    const fetchMock = vi.fn(async () => jsonResponse({ error: "missing" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    const callTool = vi.fn(async (name: string) => {
      if (name === "list_companion_comments") return { structuredContent: { comments: [] } };
      return { structuredContent: {} };
    });
    const setWidgetState = vi.fn();
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle], sourceEndpointBase: "/source/secret" },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState
      }
    });

    render(<App />);

    expect(await screen.findByText("恢复失败，请重新导入")).toBeInTheDocument();
    expect(screen.getByText("用户：第 3 段")).toBeInTheDocument();
    expect(screen.getByText("嗑一下")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新导入正文《恢复失败书》" })).toBeInTheDocument();
    expect(await deviceCache.get("cloud-fail-session")).toBeNull();
  });

  it("restores again after an iPad-like remount clears local cache", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("ipad-cloud-session");
    const sourceText = "刷新第一段。\n\n刷新第二段。";
    const baseManifest = await createNovelSourceManifest({
      sourceId: "ipad-cloud-source",
      sourceKind: "pasted_text",
      title: "iPad 云端书",
      sourceText
    });
    const cloudManifest = withCloudSync(baseManifest, "ipad-cloud-source");
    const bundle = bookshelfBundle("ipad-cloud-session", "iPad 云端书", 2, "light_chat", cloudManifest);
    const fetchMock = vi.fn(async () => jsonResponse({ sourceText, sourceManifest: cloudManifest }));
    vi.stubGlobal("fetch", fetchMock);
    const callTool = vi.fn(async (name: string) => {
      if (name === "list_companion_comments") return { structuredContent: { comments: [] } };
      return { structuredContent: {} };
    });
    const setWidgetState = vi.fn();
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle], sourceEndpointBase: "/source/secret" },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState
      }
    });

    const firstRender = render(<App />);
    expect(await screen.findByText("当前设备可读")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstRender.unmount();
    const secondRender = render(<App />);
    expect(await screen.findByText("当前设备可读")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await deviceCache.remove("ipad-cloud-session");
    secondRender.unmount();
    const thirdRender = render(<App />);
    expect(await screen.findByText("当前设备可读")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/必须重新导入正文/)).not.toBeInTheDocument();
    thirdRender.unmount();
    await deviceCache.remove("ipad-cloud-session");
  });

  it("uploads new manga through the app bridge and stores returned metadata in IndexedDB", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("cloud-manga-session");
    const pageFile = new File([new Uint8Array([1, 2, 3])], "001.png", { type: "image/png" });
    const cloudManifest = mangaManifest("cloud-manga-source", [
      {
        index: 1,
        objectKey: "private/sources/cloud-manga-source/pages/1.png",
        contentHash: "c".repeat(64),
        sizeBytes: 3,
        mimeType: "image/png"
      }
    ]);
    const fetchMock = vi.fn(async () => jsonResponse({ sourceManifest: cloudManifest }));
    vi.stubGlobal("fetch", fetchMock);
    const setWidgetState = vi.fn();
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "start_reading_session") {
        return {
          structuredContent: {
            session: {
              id: "cloud-manga-session",
              title: "云端漫画",
              type: "manga",
              status: "active",
              userCurrentPosition: { kind: "page", index: 1, total: 1, label: "第 1 页" },
              assistantSyncedPosition: null,
              liveReadingEnabled: false,
              sessionPreferences: undefined,
              sourceManifest: null,
              createdAt: "2026-06-24T00:00:00.000Z",
              updatedAt: "2026-06-24T00:00:00.000Z",
              lastReadAt: "2026-06-24T00:00:00.000Z"
            }
          }
        };
      }
      if (name === "upload_cloud_source") {
        return {
          structuredContent: {
            uploaded: true,
            sessionId: "cloud-manga-session",
            sourceId: "cloud-manga-source",
            contentHash: cloudManifest.contentHash,
            pageCount: 1,
            cloudSync: { enabled: true, provider: "r2" }
          },
          _meta: { sourceManifest: cloudManifest }
        };
      }
      if (name === "set_source_manifest") {
        return { structuredContent: { sourceManifest: args.sourceManifest } };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { recentSessions: [], sourceEndpointBase: "/source/secret" },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState
      }
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /漫画共读/ }));
    fireEvent.change(screen.getByLabelText("作品名"), { target: { value: "云端漫画" } });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [pageFile] }
    });
    fireEvent.click(screen.getByRole("button", { name: "进入阅读小窝" }));

    expect(await screen.findByText("第 1 页 / 共 1 页")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callTool).toHaveBeenCalledWith(
      "upload_cloud_source",
      expect.objectContaining({
        sessionId: "cloud-manga-session",
        sourceKind: "manga_import",
        pages: [{ index: 1, bytesBase64: "AQID", mimeType: "image/png", fileName: "001.png" }]
      })
    );
    expect(callTool).toHaveBeenCalledWith(
      "set_source_manifest",
      expect.objectContaining({
        sessionId: "cloud-manga-session",
        sourceManifest: expect.objectContaining({
          sourceKind: "manga_import",
          cloudSync: expect.objectContaining({ enabled: true })
        })
      })
    );
    const cacheValue = (await deviceCache.get("cloud-manga-session")) as MangaLocalCache | null;
    expect(cacheValue?.metadata.sourceManifest.cloudSync.enabled).toBe(true);
    expect(cacheValue?.pages).toHaveLength(1);
    expect(JSON.stringify(setWidgetState.mock.calls)).not.toMatch(/AQID|data:image/);
    await deviceCache.remove("cloud-manga-session");
  });

  it("restores cloud manga pages into IndexedDB when local manga cache is missing", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("cloud-manga-restore-session");
    const cloudManifest = mangaManifest("cloud-manga-restore-source", [
      {
        index: 1,
        objectKey: "private/sources/cloud-manga-restore-source/pages/1.png",
        contentHash: "1".repeat(64),
        sizeBytes: 3,
        mimeType: "image/png"
      },
      {
        index: 2,
        objectKey: "private/sources/cloud-manga-restore-source/pages/2.png",
        contentHash: "2".repeat(64),
        sizeBytes: 3,
        mimeType: "image/png"
      }
    ]);
    const bundle = {
      ...bookshelfBundle("cloud-manga-restore-session", "云端漫画恢复", 2, "light_chat", cloudManifest),
      session: {
        ...bookshelfBundle("cloud-manga-restore-session", "云端漫画恢复", 2, "light_chat", cloudManifest).session,
        type: "manga" as const,
        userCurrentPosition: { kind: "page" as const, index: 2, total: 2, label: "第 2 页" }
      }
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { pageIndex?: number };
      return jsonResponse({
        pageIndex: body.pageIndex,
        bytesBase64: body.pageIndex === 1 ? "AQID" : "BAUG",
        mimeType: "image/png",
        page: cloudManifest.cloudSync.pages!.find((page) => page.index === body.pageIndex),
        sourceManifest: cloudManifest
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const callTool = vi.fn(async (name: string) => {
      if (name === "list_companion_comments") return { structuredContent: { comments: [] } };
      return { structuredContent: {} };
    });
    const setWidgetState = vi.fn();
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle], sourceEndpointBase: "/source/secret" },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState
      }
    });

    render(<App />);

    expect(await screen.findByText("正在从私人云端恢复正文")).toBeInTheDocument();
    expect(await screen.findByText("当前设备可读")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const cacheValue = (await deviceCache.get("cloud-manga-restore-session")) as MangaLocalCache | null;
    expect(cacheValue?.pages).toHaveLength(2);
    expect(cacheValue?.metadata.sourceManifest.sourceKind).toBe("manga_import");
    expect(JSON.stringify(callTool.mock.calls)).not.toMatch(/AQID|BAUG|data:image/);
    expect(JSON.stringify(setWidgetState.mock.calls)).not.toMatch(/AQID|BAUG|bytesBase64|data:image/);
    await deviceCache.remove("cloud-manga-restore-session");
  });

  it("does not write manga cache when cloud page restore fails", async () => {
    const deviceCache = new IndexedDbReadingCache();
    await deviceCache.remove("cloud-manga-fail-session");
    const cloudManifest = mangaManifest("cloud-manga-fail-source", [
      {
        index: 1,
        objectKey: "private/sources/cloud-manga-fail-source/pages/1.png",
        contentHash: "1".repeat(64),
        sizeBytes: 3,
        mimeType: "image/png"
      }
    ]);
    const bundle = {
      ...bookshelfBundle("cloud-manga-fail-session", "漫画恢复失败", 1, "light_chat", cloudManifest),
      session: {
        ...bookshelfBundle("cloud-manga-fail-session", "漫画恢复失败", 1, "light_chat", cloudManifest).session,
        type: "manga" as const,
        userCurrentPosition: { kind: "page" as const, index: 1, total: 1, label: "第 1 页" }
      }
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "hash mismatch" }, 400)));
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundle], sourceEndpointBase: "/source/secret" },
        callTool: vi.fn(async (name: string) =>
          name === "list_companion_comments"
            ? { structuredContent: { comments: [] } }
            : { structuredContent: {} }
        ),
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);

    expect(await screen.findByText("恢复失败，请重新导入")).toBeInTheDocument();
    expect(await deviceCache.get("cloud-manga-fail-session")).toBeNull();
  });

  it("switches between cached bookshelf sessions without mixing position, preferences, or comments", async () => {
    const deviceCache = new IndexedDbReadingCache();
    const manifestA = manifest("source-a", "a");
    const manifestB = manifest("source-b", "b");
    await deviceCache.put(novelCache("bookshelf-a", "A 书", manifestA, ["A 第一段", "A 第二段"]));
    await deviceCache.put(
      novelCache("bookshelf-b", "B 书", manifestB, ["B 第一段", "B 第二段", "B 第三段"])
    );
    const bundles = [
      bookshelfBundle("bookshelf-a", "A 书", 2, "light_chat", manifestA),
      bookshelfBundle("bookshelf-b", "B 书", 3, "cp_talk", manifestB)
    ];
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "list_companion_comments") {
        return {
          structuredContent: {
            comments: [
              {
                id: `comment-${args.sessionId}`,
                sessionId: args.sessionId,
                position: {
                  kind: "paragraph",
                  index: args.sessionId === "bookshelf-a" ? 2 : 3,
                  label: args.sessionId === "bookshelf-a" ? "第 2 段" : "第 3 段"
                },
                mode: "light_chat",
                length: "normal",
                text: args.sessionId === "bookshelf-a" ? "A 书短评" : "B 书短评",
                source: "current_context",
                inRecent: true,
                inHistory: true,
                createdAt: "2026-06-23T01:00:00.000Z"
              }
            ]
          }
        };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: bundles },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "继续阅读《A 书》" })
    );
    expect(await screen.findByText("用户读到：第 2 段")).toBeInTheDocument();
    expect(await screen.findByText("A 书短评")).toBeInTheDocument();
    expect(screen.queryByText("B 书短评")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByRole("button", { name: "轻松聊聊" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "继续阅读《B 书》" })
    );
    expect(await screen.findByText("用户读到：第 3 段")).toBeInTheDocument();
    expect(await screen.findByText("B 书短评")).toBeInTheDocument();
    expect(screen.queryByText("A 书短评")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByRole("button", { name: "嗑一下" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await deviceCache.remove("bookshelf-a");
    await deviceCache.remove("bookshelf-b");
  });

  it("manages and deletes one bookshelf session without affecting another or deleting cache by default", async () => {
    const deviceCache = new IndexedDbReadingCache();
    const manifestA = manifest("manage-source-a", "c");
    const manifestB = manifest("manage-source-b", "d");
    await deviceCache.put(novelCache("manage-a", "管理 A", manifestA, ["A 正文"]));
    await deviceCache.put(novelCache("manage-b", "管理 B", manifestB, ["B 正文"]));
    const bundleA = bookshelfBundle("manage-a", "管理 A", 1, "light_chat", manifestA);
    const bundleB = bookshelfBundle("manage-b", "管理 B", 1, "cp_talk", manifestB);
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "list_companion_comments") {
        return { structuredContent: { comments: [] } };
      }
      if (name === "rename_reading_session") {
        return {
          structuredContent: {
            session: { ...bundleA.session, title: args.title }
          }
        };
      }
      if (name === "set_reading_session_status") {
        return {
          structuredContent: {
            session: { ...bundleA.session, title: "管理 A 新名", status: args.status }
          }
        };
      }
      if (name === "delete_reading_session") {
        return { structuredContent: { sessionId: args.sessionId, deleted: true } };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundleA, bundleB] },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "管理《管理 A》" }));
    fireEvent.change(screen.getByLabelText("新的书名"), {
      target: { value: "管理 A 新名" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存新书名" }));
    expect(await screen.findByText("书名已经改好啦。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "标记为已完成" }));
    expect(await screen.findByText("已经标记为完成。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除这本书" }));
    fireEvent.click(screen.getByRole("button", { name: "继续删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除这本书" }));
    expect(callTool).toHaveBeenCalledWith(
      "delete_reading_session",
      expect.not.objectContaining({ deleteCloudSource: true })
    );
    await waitFor(() => {
      expect(screen.queryByText("管理 A 新名")).not.toBeInTheDocument();
      expect(screen.getByText("管理 B")).toBeInTheDocument();
    });
    expect(await deviceCache.get("manage-a")).not.toBeNull();
    expect(await deviceCache.get("manage-b")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "管理《管理 B》" }));
    fireEvent.click(screen.getByRole("button", { name: "删除这本书" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "同时删除本设备正文缓存" }));
    fireEvent.click(screen.getByRole("button", { name: "继续删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除这本书" }));
    await waitFor(async () => {
      expect(await deviceCache.get("manage-b")).toBeNull();
    });
    expect(await deviceCache.get("manage-a")).not.toBeNull();
    await deviceCache.remove("manage-a");
  });

  it("passes cloud deletion intent and reports cloud/local partial failures separately", async () => {
    const manifestA = manifest("failure-source", "e");
    const bundleA = bookshelfBundle("failure-book", "缓存失败书", 1, "light_chat", manifestA);
    const callTool = vi.fn(async (name: string, args: Record<string, any>) => {
      if (name === "list_companion_comments") {
        return { structuredContent: { comments: [] } };
      }
      if (name === "delete_reading_session") {
        return {
          structuredContent: {
            sessionId: args.sessionId,
            deleted: true,
            cloudSourceDeleted: false,
            cloudSourceDeleteError: "manifest delete failed"
          }
        };
      }
      return { structuredContent: {} };
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        toolOutput: { bookshelfSessions: [bundleA] },
        callTool,
        requestDisplayMode: vi.fn(),
        setWidgetState: vi.fn()
      }
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "管理《缓存失败书》" }));
    fireEvent.click(screen.getByRole("button", { name: "删除这本书" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "同时删除云端正文副本" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "同时删除本设备正文缓存" }));
    fireEvent.click(screen.getByRole("button", { name: "继续删除" }));
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined
    });
    fireEvent.click(screen.getByRole("button", { name: "确认删除这本书" }));
    expect(callTool).toHaveBeenCalledWith(
      "delete_reading_session",
      expect.objectContaining({
        sessionId: "failure-book",
        deleteCloudSource: true
      })
    );
    expect(JSON.stringify(callTool.mock.calls)).not.toMatch(/sourceText|imageData|data:image/);
    expect(
      await screen.findByText("云端阅读数据已删除，但云端正文副本删除失败；本设备正文缓存清除失败。")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("缓存失败书")).not.toBeInTheDocument();
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb
    });
  });
});

function manifest(sourceId: string, hashCharacter: string): SourceManifest {
  return {
    sourceId,
    sourceKind: "pasted_text",
    contentHash: hashCharacter.repeat(64),
    segmentationVersion: 1,
    paragraphCount: sourceId === "source-a" ? 2 : 3,
    cloudSync: { enabled: false, provider: "r2" }
  };
}

function withCloudSync(sourceManifest: SourceManifest, sourceId: string): SourceManifest {
  return {
    ...sourceManifest,
    cloudSync: {
      enabled: true,
      provider: "r2",
      objectKey: `private/sources/${sourceId}/source.txt`,
      manifestObjectKey: `private/sources/${sourceId}/manifest.json`
    }
  };
}

function mangaManifest(
  sourceId: string,
  pages: NonNullable<SourceManifest["cloudSync"]["pages"]>
): SourceManifest {
  return {
    sourceId,
    sourceKind: "manga_import",
    contentHash: "m".repeat(64),
    segmentationVersion: 1,
    pageCount: pages.length,
    cloudSync: {
      enabled: true,
      provider: "r2",
      manifestObjectKey: `private/sources/${sourceId}/manifest.json`,
      pages
    }
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function novelCache(
  sessionId: string,
  title: string,
  sourceManifest: SourceManifest,
  chunks: string[]
): NovelLocalCache {
  return {
    metadata: {
      sessionId,
      type: "novel",
      title,
      cacheVersion: 2,
      remembered: true,
      itemCount: chunks.length,
      sourceManifest,
      updatedAt: "2026-06-23T00:00:00.000Z"
    },
    sourceText: chunks.join("\n\n"),
    chunks
  };
}

function bookshelfBundle(
  id: string,
  title: string,
  position: number,
  readingCommentMode: "light_chat" | "cp_talk",
  sourceManifest: SourceManifest
): SessionBundle {
  return {
    session: {
      id,
      title,
      type: "novel",
      status: "active",
      userCurrentPosition: {
        kind: "paragraph",
        index: position,
        total: sourceManifest.paragraphCount,
        label: `第 ${position} 段`
      },
      assistantSyncedPosition: null,
      liveReadingEnabled: false,
      sessionPreferences: {
        readingCommentMode,
        commentLength: "normal",
        allowDeepAnalysisByDefault: false,
        liveReadingStyle: "danmaku",
        autoSaveCompanionComments: true
      },
      sourceManifest,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z",
      lastReadAt: "2026-06-23T00:00:00.000Z"
    },
    quotes: [{ id: `quote-${id}`, sessionId: id, content: `${title}摘录`, position: { kind: "paragraph", index: 1, label: "第 1 段" }, createdAt: "2026-06-23T00:00:00.000Z" }],
    reactions: [{ id: `reaction-${id}`, sessionId: id, content: `${title}反应`, position: { kind: "paragraph", index: 1, label: "第 1 段" }, speaker: "user", createdAt: "2026-06-23T00:00:00.000Z" }],
    bookmarks: [{ id: `bookmark-${id}`, sessionId: id, position: { kind: "paragraph", index: position, label: `第 ${position} 段` }, createdAt: "2026-06-23T00:00:00.000Z" }]
  };
}
