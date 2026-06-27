import { describe, expect, it } from "vitest";
import type { SourceManifest } from "@ss/shared";
import { getSourceAvailability } from "./source-availability.js";

const manifest: SourceManifest = {
  sourceId: "source-1",
  sourceKind: "pasted_text",
  contentHash: "a".repeat(64),
  segmentationVersion: 1,
  paragraphCount: 12,
  cloudSync: { enabled: false, provider: "r2" }
};

describe("getSourceAvailability", () => {
  it("returns available_local for matching identity and segmentation", () => {
    expect(getSourceAvailability(manifest, manifest)).toBe("available_local");
  });

  it("distinguishes cloud-aware missing, mismatch, segmentation mismatch, and unknown", () => {
    expect(getSourceAvailability({ ...manifest, cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/source-1/source.txt" } }, null)).toBe("available_cloud");
    expect(getSourceAvailability(manifest, null)).toBe("local_only_missing");
    expect(
      getSourceAvailability(manifest, { ...manifest, contentHash: "b".repeat(64) })
    ).toBe("mismatch");
    expect(
      getSourceAvailability(manifest, { ...manifest, paragraphCount: 11 })
    ).toBe("segmentation_mismatch");
    expect(
      getSourceAvailability(manifest, { ...manifest, segmentationVersion: 2 })
    ).toBe("segmentation_mismatch");
    expect(getSourceAvailability(null, manifest)).toBe("unknown");
    expect(getSourceAvailability(manifest, undefined)).toBe("unknown");
  });

  it("reflects cloud status and restore state overrides", () => {
    const cloudManifest: SourceManifest = {
      ...manifest,
      cloudSync: { enabled: true, provider: "r2", objectKey: "private/sources/source-1/source.txt" }
    };

    expect(getSourceAvailability(cloudManifest, null, { cloudStatus: "missing" })).toBe("cloud_missing");
    expect(getSourceAvailability(cloudManifest, null, { restoreState: "restoring" })).toBe("restoring_from_cloud");
    expect(getSourceAvailability(cloudManifest, null, { restoreState: "failed" })).toBe("cloud_restore_failed");
  });
});
