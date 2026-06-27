import {
  NOVEL_SEGMENTATION_VERSION,
  type SourceKind,
  type SourceManifest
} from "@ss/shared";
import { splitNovelText } from "../novel/split-text.js";

export async function createNovelSourceManifest(input: {
  sourceId: string;
  sourceKind: Extract<SourceKind, "pasted_text" | "file_import">;
  title?: string;
  sourceText: string;
}): Promise<SourceManifest> {
  const normalizedText = normalizeNovelSourceText(input.sourceText);
  return {
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    ...(input.title ? { title: input.title } : {}),
    contentHash: await sha256Hex(new TextEncoder().encode(normalizedText)),
    segmentationVersion: NOVEL_SEGMENTATION_VERSION,
    paragraphCount: splitNovelText(normalizedText).length,
    cloudSync: disabledCloudSync()
  };
}

export async function createMangaSourceManifest(input: {
  sourceId: string;
  title?: string;
  pages: Blob[];
}): Promise<SourceManifest> {
  const pageHashes: string[] = [];
  for (const page of input.pages) {
    pageHashes.push(await sha256Hex(new Uint8Array(await page.arrayBuffer())));
  }
  return {
    sourceId: input.sourceId,
    sourceKind: "manga_import",
    ...(input.title ? { title: input.title } : {}),
    contentHash: await sha256Hex(new TextEncoder().encode(pageHashes.join(""))),
    segmentationVersion: NOVEL_SEGMENTATION_VERSION,
    pageCount: input.pages.length,
    cloudSync: disabledCloudSync()
  };
}

export function normalizeNovelSourceText(sourceText: string): string {
  return sourceText.replace(/\r\n?/g, "\n");
}

function disabledCloudSync(): SourceManifest["cloudSync"] {
  return { enabled: false, provider: "r2" };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}
