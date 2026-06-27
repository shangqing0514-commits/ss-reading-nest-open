import type { SourceAvailability, SourceManifest } from "@ss/shared";

export interface SourceAvailabilityOptions {
  cloudStatus?: "available" | "missing" | "unknown";
  restoreState?: "idle" | "restoring" | "failed";
}

export function getSourceAvailability(
  sessionManifest: SourceManifest | null,
  localManifest: SourceManifest | null | undefined,
  options: SourceAvailabilityOptions = {}
): SourceAvailability {
  if (!sessionManifest || localManifest === undefined) return "unknown";
  if (options.restoreState === "restoring") return "restoring_from_cloud";
  if (options.restoreState === "failed") return "cloud_restore_failed";
  if (!localManifest) {
    if (!sessionManifest.cloudSync.enabled) return "local_only_missing";
    if (options.cloudStatus === "missing") return "cloud_missing";
    return "available_cloud";
  }
  if (sessionManifest.contentHash !== localManifest.contentHash) return "mismatch";
  if (
    sessionManifest.segmentationVersion !== localManifest.segmentationVersion ||
    sessionManifest.paragraphCount !== localManifest.paragraphCount ||
    sessionManifest.pageCount !== localManifest.pageCount
  ) {
    return "segmentation_mismatch";
  }
  return "available_local";
}
