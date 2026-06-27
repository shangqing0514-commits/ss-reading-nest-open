import { describe, expect, it } from "vitest";
import { checkSourceSyncPermission } from "./sync-guard.js";

describe("checkSourceSyncPermission", () => {
  it("allows automatic synchronization only for verified sources", () => {
    for (const mode of ["range_sync", "live_reading"] as const) {
      expect(
        checkSourceSyncPermission({ mode, sourceAvailability: "available_local" })
      ).toMatchObject({ allowed: true, canAdvanceAssistantPosition: true });
    }
    expect(
      checkSourceSyncPermission({
        mode: "recent_only",
        sourceAvailability: "available_local"
      })
    ).toMatchObject({ allowed: true, canAdvanceAssistantPosition: false });
  });

  it("blocks missing, mismatch, segmentation mismatch, and unknown automatic sync", () => {
    for (const sourceAvailability of [
      "available_cloud",
      "restoring_from_cloud",
      "cloud_missing",
      "cloud_restore_failed",
      "local_only_missing",
      "mismatch",
      "segmentation_mismatch",
      "unknown"
    ] as const) {
      expect(
        checkSourceSyncPermission({ mode: "range_sync", sourceAvailability })
      ).toMatchObject({ allowed: false, canAdvanceAssistantPosition: false });
    }
  });

  it("allows explicitly forced current-only without advancing assistant position", () => {
    expect(
      checkSourceSyncPermission({
        mode: "current_only",
        sourceAvailability: "mismatch",
        forceCurrentOnly: true
      })
    ).toEqual({
      allowed: true,
      canAdvanceAssistantPosition: false,
      userNote: "当前正文来源未验证；用户已明确选择只发送当前内容。不要假装知道中间剧情。"
    });
  });

  it("blocks unverified current-only without explicit confirmation", () => {
    expect(
      checkSourceSyncPermission({
        mode: "current_only",
        sourceAvailability: "unknown"
      }).allowed
    ).toBe(false);
  });
});
