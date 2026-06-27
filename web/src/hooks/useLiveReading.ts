import { useEffect, useRef } from "react";

export function useLiveReading(input: {
  enabled: boolean;
  userPositionIndex: number;
  triggerKey?: string;
  isScrolling: boolean;
  hasPendingConfirmation: boolean;
  hasUnconfirmedGap: boolean;
  sourceVerified: boolean;
  delayMs?: number;
  onStablePosition: (index: number) => void;
}) {
  const sentKeys = useRef(new Set<string>());

  useEffect(() => {
    const triggerKey = input.triggerKey ?? String(input.userPositionIndex);
    if (
      !input.enabled ||
      sentKeys.current.has(triggerKey) ||
      input.isScrolling ||
      input.hasPendingConfirmation ||
      input.hasUnconfirmedGap ||
      !input.sourceVerified
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        sentKeys.current.add(triggerKey);
        input.onStablePosition(input.userPositionIndex);
      },
      input.delayMs ?? 1_800
    );
    return () => window.clearTimeout(timer);
  }, [
    input.enabled,
    input.userPositionIndex,
    input.triggerKey,
    input.isScrolling,
    input.hasPendingConfirmation,
    input.hasUnconfirmedGap,
    input.sourceVerified,
    input.delayMs,
    input.onStablePosition
  ]);
}
