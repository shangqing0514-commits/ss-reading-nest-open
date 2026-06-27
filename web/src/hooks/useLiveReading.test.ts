import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLiveReading } from "./useLiveReading.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveReading", () => {
  it("waits 1800ms and resets when the position changes", () => {
    vi.useFakeTimers();
    const onStablePosition = vi.fn();
    const { rerender } = renderHook(
      (props: { index: number }) =>
        useLiveReading({
          enabled: true,
          userPositionIndex: props.index,
          isScrolling: false,
          hasPendingConfirmation: false,
          hasUnconfirmedGap: false,
          sourceVerified: true,
          delayMs: 1_800,
          onStablePosition
        }),
      { initialProps: { index: 2 } }
    );

    act(() => vi.advanceTimersByTime(1_000));
    expect(onStablePosition).not.toHaveBeenCalled();
    rerender({ index: 3 });
    act(() => vi.advanceTimersByTime(1_799));
    expect(onStablePosition).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onStablePosition).toHaveBeenCalledWith(3);
  });

  it("does not send while scrolling, awaiting confirmation, disabled, or behind a gap", () => {
    vi.useFakeTimers();
    const onStablePosition = vi.fn();
    const { rerender } = renderHook(
      (props: {
        enabled: boolean;
        scrolling: boolean;
        pending: boolean;
        gap: boolean;
        sourceVerified: boolean;
      }) =>
        useLiveReading({
          enabled: props.enabled,
          userPositionIndex: 5,
          isScrolling: props.scrolling,
          hasPendingConfirmation: props.pending,
          hasUnconfirmedGap: props.gap,
          sourceVerified: props.sourceVerified,
          delayMs: 1_800,
          onStablePosition
        }),
      {
        initialProps: {
          enabled: false,
          scrolling: false,
          pending: false,
          gap: false,
          sourceVerified: true
        }
      }
    );

    for (const props of [
      { enabled: false, scrolling: false, pending: false, gap: false, sourceVerified: true },
      { enabled: true, scrolling: true, pending: false, gap: false, sourceVerified: true },
      { enabled: true, scrolling: false, pending: true, gap: false, sourceVerified: true },
      { enabled: true, scrolling: false, pending: false, gap: true, sourceVerified: true },
      { enabled: true, scrolling: false, pending: false, gap: false, sourceVerified: false }
    ]) {
      rerender(props);
      act(() => vi.advanceTimersByTime(2_000));
    }

    expect(onStablePosition).not.toHaveBeenCalled();
  });

  it("does not repeat the same stable live-reading trigger across rerenders", () => {
    vi.useFakeTimers();
    const onStablePosition = vi.fn();
    const { rerender } = renderHook(
      (props: { index: number; revision: number }) =>
        useLiveReading({
          enabled: true,
          userPositionIndex: props.index,
          triggerKey: `session-1-paragraph-${props.index}-reaction_only-short`,
          isScrolling: false,
          hasPendingConfirmation: false,
          hasUnconfirmedGap: false,
          sourceVerified: true,
          delayMs: 1_800,
          onStablePosition: (index) => onStablePosition(index, props.revision)
        }),
      { initialProps: { index: 2, revision: 0 } }
    );

    act(() => vi.advanceTimersByTime(1_800));
    rerender({ index: 2, revision: 1 });
    act(() => vi.advanceTimersByTime(1_800));
    rerender({ index: 2, revision: 2 });
    act(() => vi.advanceTimersByTime(1_800));
    expect(onStablePosition).toHaveBeenCalledTimes(1);
    expect(onStablePosition.mock.calls.at(-1)?.[0]).toBe(2);

    rerender({ index: 3, revision: 3 });
    act(() => vi.advanceTimersByTime(1_800));
    expect(onStablePosition).toHaveBeenCalledTimes(2);
    expect(onStablePosition.mock.calls.at(-1)?.[0]).toBe(3);
  });
});
