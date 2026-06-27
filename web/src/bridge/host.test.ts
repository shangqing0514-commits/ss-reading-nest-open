import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = {
  connect: vi.fn().mockResolvedValue(undefined),
  callServerTool: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  updateModelContext: vi.fn().mockResolvedValue({}),
  requestDisplayMode: vi.fn().mockResolvedValue({ mode: "fullscreen" })
};

vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: class {
    connect = bridge.connect;
    callServerTool = bridge.callServerTool;
    sendMessage = bridge.sendMessage;
    updateModelContext = bridge.updateModelContext;
    requestDisplayMode = bridge.requestDisplayMode;
  }
}));

describe("host bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: {}
    });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: {
        setWidgetState: vi.fn(),
        widgetState: {
          screen: "novel",
          sessionId: "session-1",
          positionIndex: 2,
          scrollTop: 120
        }
      }
    });
  });

  it("updates model-visible context through the MCP Apps bridge", async () => {
    const { updateModelContext } = await import("./host.js");

    await expect(updateModelContext({ title: "Book", currentText: "paragraph" })).resolves.toBe(true);
    expect(bridge.updateModelContext).toHaveBeenCalledWith({
      content: [
        {
          type: "text",
          text: expect.stringContaining('"currentText":"paragraph"')
        }
      ]
    });
  });

  it("requests fullscreen and sends a message without forcing chat scroll", async () => {
    const { askChatGpt, requestReaderFullscreen } = await import("./host.js");

    await expect(requestReaderFullscreen()).resolves.toBe(true);
    await askChatGpt("陪我看看这里", { scrollToBottom: false });

    expect(bridge.requestDisplayMode).toHaveBeenCalledWith({ mode: "fullscreen" });
    expect(bridge.sendMessage).toHaveBeenCalledWith({
      role: "user",
      content: [{ type: "text", text: "陪我看看这里" }]
    });
  });

  it("stores and restores only lightweight reader widget state", async () => {
    const { initialWidgetState, saveReaderWidgetState } = await import("./host.js");
    const state = {
      screen: "novel" as const,
      sessionId: "session-1",
      positionIndex: 3,
      scrollTop: 240
    };

    saveReaderWidgetState(state);

    expect(window.openai?.setWidgetState).toHaveBeenCalledWith(state);
    expect(initialWidgetState()).toEqual({
      screen: "novel",
      sessionId: "session-1",
      positionIndex: 2,
      scrollTop: 120
    });
  });
});
