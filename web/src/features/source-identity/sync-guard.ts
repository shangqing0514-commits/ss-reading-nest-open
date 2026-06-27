import type { SourceAvailability } from "@ss/shared";

type GuardedSyncMode = "range_sync" | "recent_only" | "live_reading" | "current_only";

export function checkSourceSyncPermission(input: {
  mode: GuardedSyncMode;
  sourceAvailability: SourceAvailability;
  forceCurrentOnly?: boolean;
}): {
  allowed: boolean;
  canAdvanceAssistantPosition: boolean;
  userNote?: string;
} {
  if (input.sourceAvailability === "available_local") {
    return {
      allowed: true,
      canAdvanceAssistantPosition:
        input.mode === "range_sync" || input.mode === "live_reading"
    };
  }
  if (input.mode === "current_only" && input.forceCurrentOnly) {
    return {
      allowed: true,
      canAdvanceAssistantPosition: false,
      userNote: "当前正文来源未验证；用户已明确选择只发送当前内容。不要假装知道中间剧情。"
    };
  }
  return { allowed: false, canAdvanceAssistantPosition: false };
}
