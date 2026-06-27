const SOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const EXTENSION_PATTERN = /^[A-Za-z0-9]+$/;

export function buildSourceObjectKey(sourceId: string): string {
  const safeSourceId = validateSourceId(sourceId);
  return `private/sources/${safeSourceId}/source.txt`;
}

export function buildSourceManifestObjectKey(sourceId: string): string {
  const safeSourceId = validateSourceId(sourceId);
  return `private/sources/${safeSourceId}/manifest.json`;
}

export function buildSourcePageObjectKey(
  sourceId: string,
  pageIndex: number,
  extension: string
): string {
  const safeSourceId = validateSourceId(sourceId);
  const safeExtension = validateExtension(extension);
  if (!Number.isInteger(pageIndex) || pageIndex < 1) {
    throw new Error("pageIndex must be a positive integer");
  }
  return `private/sources/${safeSourceId}/pages/${pageIndex}.${safeExtension}`;
}

function validateSourceId(sourceId: string): string {
  if (!SOURCE_ID_PATTERN.test(sourceId) || sourceId.includes("..")) {
    throw new Error("sourceId must be an opaque path-safe id");
  }
  return sourceId;
}

function validateExtension(extension: string): string {
  if (!EXTENSION_PATTERN.test(extension) || extension.includes("..")) {
    throw new Error("extension must be path-safe");
  }
  return extension.toLowerCase();
}
