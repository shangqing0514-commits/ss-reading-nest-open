import { useEffect, useState } from "react";
import {
  subscribeHostContext,
  type ReadingHostContext
} from "../bridge/host.js";

export type CompanionLayout = "wide" | "compact";

export function useReadingHostLayout() {
  const [context, setContext] = useState<ReadingHostContext>(
    () => window.openai?.hostContext ?? {}
  );
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setRevision((value) => value + 1);
    };
    const unsubscribe = subscribeHostContext((next) => {
      setContext((current) => ({ ...current, ...next }));
      setRevision((value) => value + 1);
    });
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useEffect(() => {
    const insets = context.safeAreaInsets;
    if (!insets) return;
    const root = document.documentElement.style;
    root.setProperty("--safe-top", `${insets.top}px`);
    root.setProperty("--safe-right", `${insets.right}px`);
    root.setProperty("--safe-bottom", `${insets.bottom}px`);
    root.setProperty("--safe-left", `${insets.left}px`);
    return () => {
      root.removeProperty("--safe-top");
      root.removeProperty("--safe-right");
      root.removeProperty("--safe-bottom");
      root.removeProperty("--safe-left");
    };
  }, [context.safeAreaInsets]);

  const width =
    context.containerDimensions?.width ??
    context.containerDimensions?.maxWidth ??
    viewport.width;
  const height =
    context.containerDimensions?.height ??
    context.containerDimensions?.maxHeight ??
    viewport.height;
  const layout: CompanionLayout =
    width >= 900 && width > height ? "wide" : "compact";
  const available = context.availableDisplayModes;

  return {
    layout,
    revision,
    displayMode: context.displayMode ?? "inline",
    canRequestPip:
      available?.includes("pip") ?? Boolean(window.openai?.requestDisplayMode)
  };
}
