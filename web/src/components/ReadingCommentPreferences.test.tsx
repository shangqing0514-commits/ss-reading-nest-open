import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION_PREFERENCES } from "@ss/shared";
import { ReadingCommentPreferences } from "./ReadingCommentPreferences.js";

describe("ReadingCommentPreferences", () => {
  it("shows six modes, three lengths, and the privacy toggle", () => {
    render(
      <ReadingCommentPreferences
        preferences={DEFAULT_SESSION_PREFERENCES}
        liveReadingEnabled={false}
        saving={false}
        onChange={vi.fn()}
        onQuickAction={vi.fn()}
      />
    );

    for (const label of [
      "轻松聊聊",
      "吐槽一下",
      "嗑一下",
      "猜后续",
      "认真分析",
      "写读书日记",
      "简短",
      "正常",
      "长评"
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "自动保存小叔叔陪读短评" })).not.toBeChecked();
    expect(screen.getByText(/不会保存小说正文、prompt 或完整聊天/)).toBeInTheDocument();
  });

  it("disables long for light modes and enables it for deep analysis and diary", () => {
    const { rerender } = render(
      <ReadingCommentPreferences
        preferences={DEFAULT_SESSION_PREFERENCES}
        liveReadingEnabled={false}
        saving={false}
        onChange={vi.fn()}
        onQuickAction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "长评" })).toBeDisabled();

    rerender(
      <ReadingCommentPreferences
        preferences={{
          ...DEFAULT_SESSION_PREFERENCES,
          readingCommentMode: "deep_analysis",
          commentLength: "long"
        }}
        liveReadingEnabled={false}
        saving={false}
        onChange={vi.fn()}
        onQuickAction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "长评" })).toBeEnabled();

    rerender(
      <ReadingCommentPreferences
        preferences={{
          ...DEFAULT_SESSION_PREFERENCES,
          readingCommentMode: "diary_summary",
          commentLength: "long"
        }}
        liveReadingEnabled={false}
        saving={false}
        onChange={vi.fn()}
        onQuickAction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "长评" })).toBeEnabled();
  });

  it("emits normalized preference patches and quick-action mappings", () => {
    const onChange = vi.fn();
    const onQuickAction = vi.fn();
    render(
      <ReadingCommentPreferences
        preferences={{
          ...DEFAULT_SESSION_PREFERENCES,
          readingCommentMode: "deep_analysis",
          commentLength: "long"
        }}
        liveReadingEnabled={false}
        saving={false}
        onChange={onChange}
        onQuickAction={onQuickAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "轻松聊聊" }));
    expect(onChange).toHaveBeenCalledWith({
      readingCommentMode: "light_chat",
      commentLength: "normal"
    });

    fireEvent.click(screen.getByRole("button", { name: "立即吐槽" }));
    fireEvent.click(screen.getByRole("button", { name: "立即嗑一下" }));
    fireEvent.click(screen.getByRole("button", { name: "立即猜后续" }));
    fireEvent.click(screen.getByRole("button", { name: "立即认真分析" }));
    fireEvent.click(screen.getByRole("button", { name: "立即写日记" }));

    expect(onQuickAction).toHaveBeenCalledWith("reaction_only", "short");
    expect(onQuickAction).toHaveBeenCalledWith("cp_talk", "normal");
    expect(onQuickAction).toHaveBeenCalledWith("plot_guess", "normal");
    expect(onQuickAction).toHaveBeenCalledWith("deep_analysis", "long");
    expect(onQuickAction).toHaveBeenCalledWith("diary_summary", "long");

    fireEvent.click(screen.getByRole("checkbox", { name: "自动保存小叔叔陪读短评" }));
    expect(onChange).toHaveBeenCalledWith({ autoSaveCompanionComments: true });
  });

  it("keeps preference buttons immediately interactive while preference saving is in progress", () => {
    const onChange = vi.fn();
    const onQuickAction = vi.fn();
    const { rerender } = render(
      <ReadingCommentPreferences
        preferences={{
          ...DEFAULT_SESSION_PREFERENCES,
          readingCommentMode: "light_chat",
          commentLength: "normal"
        }}
        liveReadingEnabled={false}
        saving
        quickActionDisabled
        onChange={onChange}
        onQuickAction={onQuickAction}
      />
    );

    const deepButton = screen.getByRole("button", { name: "认真分析" });
    fireEvent.click(deepButton);
    fireEvent.click(screen.getByRole("checkbox", { name: "自动保存小叔叔陪读短评" }));

    expect(deepButton).toBeEnabled();
    expect(onChange).toHaveBeenCalledWith({
      readingCommentMode: "deep_analysis",
      commentLength: "normal"
    });
    expect(onChange).toHaveBeenCalledWith({ autoSaveCompanionComments: true });
    expect(screen.getByRole("button", { name: "立即吐槽" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "立即吐槽" }));
    expect(onQuickAction).not.toHaveBeenCalled();

    rerender(
      <ReadingCommentPreferences
        preferences={{
          ...DEFAULT_SESSION_PREFERENCES,
          readingCommentMode: "deep_analysis",
          commentLength: "normal"
        }}
        liveReadingEnabled={false}
        saving
        quickActionDisabled
        onChange={onChange}
        onQuickAction={onQuickAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "长评" }));
    expect(onChange).toHaveBeenCalledWith({ commentLength: "long" });
  });

  it("hides length choices while live reading is enabled", () => {
    render(
      <ReadingCommentPreferences
        preferences={DEFAULT_SESSION_PREFERENCES}
        liveReadingEnabled
        saving={false}
        onChange={vi.fn()}
        onQuickAction={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "简短" })).not.toBeInTheDocument();
    expect(screen.getByText(/实时陪读固定为弹幕式简短回应/)).toBeInTheDocument();
  });

  it("reflects each session's own preferences when the active session changes", () => {
    const { rerender } = render(
      <ReadingCommentPreferences
        preferences={{
          ...DEFAULT_SESSION_PREFERENCES,
          readingCommentMode: "light_chat",
          autoSaveCompanionComments: true
        }}
        liveReadingEnabled={false}
        saving={false}
        onChange={vi.fn()}
        onQuickAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "轻松聊聊" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("checkbox", { name: "自动保存小叔叔陪读短评" })).toBeChecked();

    rerender(
      <ReadingCommentPreferences
        preferences={{
          ...DEFAULT_SESSION_PREFERENCES,
          readingCommentMode: "cp_talk",
          autoSaveCompanionComments: false
        }}
        liveReadingEnabled={false}
        saving={false}
        onChange={vi.fn()}
        onQuickAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "嗑一下" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("checkbox", { name: "自动保存小叔叔陪读短评" })).not.toBeChecked();
  });
});
