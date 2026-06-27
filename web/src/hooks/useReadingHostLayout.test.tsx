import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingHostLayout } from "./useReadingHostLayout.js";

describe("useReadingHostLayout", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(window, "openai", {
      configurable: true,
      value: { requestDisplayMode: vi.fn() }
    });
  });

  it("uses wide layout for landscape tablet width and compact layout after rotation", () => {
    const { result } = renderHook(() => useReadingHostLayout());
    expect(result.current.layout).toBe("wide");

    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 1024 });
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.layout).toBe("compact");
  });

  it("reacts to host displayMode changes and exposes supported PiP", () => {
    const { result } = renderHook(() => useReadingHostLayout());
    const revision = result.current.revision;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("openai:host-context-changed", {
          detail: {
            displayMode: "inline",
            availableDisplayModes: ["inline", "pip", "fullscreen"],
            containerDimensions: { width: 1180, height: 820 }
          }
        })
      );
    });

    expect(result.current.displayMode).toBe("inline");
    expect(result.current.canRequestPip).toBe(true);
    expect(result.current.layout).toBe("wide");
    expect(result.current.revision).toBeGreaterThan(revision);
  });

  it("applies host safe-area insets to the reading CSS variables", () => {
    renderHook(() => useReadingHostLayout());

    act(() => {
      window.dispatchEvent(
        new CustomEvent("openai:host-context-changed", {
          detail: {
            safeAreaInsets: { top: 18, right: 7, bottom: 24, left: 9 }
          }
        })
      );
    });

    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe("18px");
    expect(document.documentElement.style.getPropertyValue("--safe-right")).toBe("7px");
    expect(document.documentElement.style.getPropertyValue("--safe-bottom")).toBe("24px");
    expect(document.documentElement.style.getPropertyValue("--safe-left")).toBe("9px");
  });
});
