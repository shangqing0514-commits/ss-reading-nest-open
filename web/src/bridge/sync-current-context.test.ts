import { describe, expect, it, vi } from "vitest";
import { syncCurrentContext } from "./sync-current-context.js";

describe("syncCurrentContext", () => {
  it("updates model context before asking ChatGPT to respond", async () => {
    const calls: string[] = [];
    const update = vi.fn(async () => {
      calls.push("context");
      return true;
    });
    const send = vi.fn(async () => {
      calls.push("message");
    });

    const mode = await syncCurrentContext({
      context: { title: "Book", currentText: "current paragraph" },
      successPrompt: "陪我看看这里",
      fallbackPrompt: "当前段落：current paragraph",
      updateModelContext: update,
      sendMessage: send
    });

    expect(mode).toBe("context");
    expect(calls).toEqual(["context", "message"]);
    expect(send).toHaveBeenCalledWith("陪我看看这里", { scrollToBottom: false });
  });

  it("puts the current content in the message when model context is unavailable", async () => {
    const send = vi.fn();

    const mode = await syncCurrentContext({
      context: { title: "Book", currentText: "current paragraph" },
      successPrompt: "陪我看看这里",
      fallbackPrompt: "《Book》第 2 段\n当前段落：current paragraph",
      updateModelContext: vi.fn().mockResolvedValue(false),
      sendMessage: send
    });

    expect(mode).toBe("message-fallback");
    expect(send).toHaveBeenCalledWith("《Book》第 2 段\n当前段落：current paragraph", {
      scrollToBottom: false
    });
  });
});
