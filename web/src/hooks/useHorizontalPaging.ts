import { useRef } from "react";
import { getHorizontalPageDirection } from "./horizontal-paging.js";

export function useHorizontalPaging(onPrevious: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number; interactive: boolean } | null>(null);

  return {
    onTouchStart(event: React.TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      const target = event.target as HTMLElement;
      start.current = {
        x: touch.clientX,
        y: touch.clientY,
        interactive: Boolean(target.closest("input, textarea, button, select, [contenteditable=true]"))
      };
    },
    onTouchEnd(event: React.TouchEvent) {
      const touch = event.changedTouches[0];
      if (!touch || !start.current) return;
      const selection = window.getSelection()?.toString() ?? "";
      const direction = getHorizontalPageDirection({
        dx: touch.clientX - start.current.x,
        dy: touch.clientY - start.current.y,
        interactive: start.current.interactive,
        selectingText: Boolean(selection)
      });
      start.current = null;
      if (direction === "previous") onPrevious();
      if (direction === "next") onNext();
    }
  };
}
