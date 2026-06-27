import { createHash, randomUUID } from "node:crypto";
import {
  NOVEL_SEGMENTATION_VERSION,
  splitNovelText,
  splitNovelTextForVersion,
  type SourceKind,
  type SourceManifest
} from "@ss/shared";
import { AppError } from "../errors/app-error.js";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import {
  buildSourceManifestObjectKey,
  buildSourceObjectKey,
  buildSourcePageObjectKey
} from "../storage/source-object-keys.js";
import {
  SourceObjectNotFoundError,
  sourceBytesToArrayBuffer,
  type SourceObjectStorage
} from "../storage/source-object-storage.js";

type Dependencies = {
  now: () => Date;
  id: () => string;
};

const defaultDependencies: Dependencies = {
  now: () => new Date(),
  id: () => randomUUID()
};

export class CloudSourceService {
  constructor(
    private readonly repository: ReadingRepository,
    private readonly storage: SourceObjectStorage,
    private readonly deps: Dependencies = defaultDependencies
  ) {}

  async uploadNovelSource(input: {
    sessionId: string;
    sourceText: string;
    sourceKind: Extract<SourceKind, "pasted_text" | "file_import">;
    title?: string;
  }): Promise<{ sourceManifest: SourceManifest }> {
    const normalizedText = normalizeNovelSourceText(input.sourceText);
    const bytes = new TextEncoder().encode(normalizedText);
    const sourceId = this.deps.id();
    const objectKey = buildSourceObjectKey(sourceId);
    const manifestObjectKey = buildSourceManifestObjectKey(sourceId);
    const sourceManifest: SourceManifest = {
      sourceId,
      sourceKind: input.sourceKind,
      ...(input.title ? { title: input.title } : {}),
      contentHash: sha256Hex(bytes),
      segmentationVersion: NOVEL_SEGMENTATION_VERSION,
      paragraphCount: splitNovelText(normalizedText).length,
      cloudSync: {
        enabled: true,
        provider: "r2",
        objectKey,
        manifestObjectKey,
        uploadedAt: this.deps.now().toISOString(),
        sizeBytes: bytes.byteLength,
        mimeType: "text/plain;charset=utf-8"
      }
    };
    await this.storage.putObject({
      key: objectKey,
      bytes,
      contentType: "text/plain;charset=utf-8"
    });
    await this.storage.putObject({
      key: manifestObjectKey,
      bytes: new TextEncoder().encode(JSON.stringify(sourceManifest)),
      contentType: "application/json"
    });
    await this.repository.mutate((database) => {
      const session = database.sessions.find((item) => item.id === input.sessionId);
      if (!session) throw new AppError("SESSION_NOT_FOUND", `找不到共读 session：${input.sessionId}`);
      session.sourceManifest = structuredClone(sourceManifest);
      session.updatedAt = this.deps.now().toISOString();
    });
    return { sourceManifest };
  }

  async restoreNovelSource(sessionId: string): Promise<{
    sourceText: string;
    sourceManifest: SourceManifest;
  }> {
    const sourceManifest = await this.requireCloudSourceManifest(sessionId);
    const objectKey = sourceManifest.cloudSync.objectKey;
    if (!objectKey) {
      throw new AppError("INVALID_OPERATION", "云端正文对象不存在。");
    }
    let object;
    try {
      object = await this.storage.getObject(objectKey);
    } catch (error) {
      if (error instanceof SourceObjectNotFoundError) {
        throw new AppError("INVALID_OPERATION", "云端正文对象不存在。");
      }
      throw error;
    }
    const sourceText = new TextDecoder().decode(object.bytes);
    const normalizedText = normalizeNovelSourceText(sourceText);
    const bytes = new TextEncoder().encode(normalizedText);
    if (sha256Hex(bytes) !== sourceManifest.contentHash) {
      throw new AppError("INVALID_OPERATION", "云端正文 hash 校验失败。");
    }
    if (
      countNovelParagraphsForManifest(normalizedText, sourceManifest) !==
      sourceManifest.paragraphCount
    ) {
      throw new AppError("INVALID_OPERATION", "云端正文分段数量校验失败。");
    }
    return { sourceText: normalizedText, sourceManifest };
  }

  async uploadMangaSource(input: {
    sessionId: string;
    title?: string;
    pages: Array<{
      index: number;
      bytes: Uint8Array | ArrayBuffer | Blob;
      mimeType: string;
      fileName?: string;
    }>;
  }): Promise<{ sourceManifest: SourceManifest }> {
    if (input.pages.length === 0) {
      throw new AppError("INVALID_OPERATION", "请至少上传一页漫画。");
    }
    const sourceId = this.deps.id();
    const manifestObjectKey = buildSourceManifestObjectKey(sourceId);
    const orderedPages = [...input.pages].sort((left, right) => left.index - right.index);
    const uploadedAt = this.deps.now().toISOString();
    const pageMetadata = [];

    for (const [offset, page] of orderedPages.entries()) {
      if (!Number.isInteger(page.index) || page.index !== offset + 1) {
        throw new AppError("INVALID_OPERATION", "漫画页码必须从 1 开始连续排列。");
      }
      const bytes = new Uint8Array(await sourceBytesToArrayBuffer(page.bytes));
      const extension = inferImageExtension(page.mimeType, page.fileName);
      const objectKey = buildSourcePageObjectKey(sourceId, page.index, extension);
      const contentHash = sha256Hex(bytes);
      const stored = await this.storage.putObject({
        key: objectKey,
        bytes,
        contentType: page.mimeType
      });
      pageMetadata.push({
        index: page.index,
        objectKey,
        contentHash,
        sizeBytes: stored.sizeBytes,
        mimeType: page.mimeType
      });
    }

    const sourceManifest: SourceManifest = {
      sourceId,
      sourceKind: "manga_import",
      ...(input.title ? { title: input.title } : {}),
      contentHash: sha256Hex(
        new TextEncoder().encode(pageMetadata.map((page) => page.contentHash).join("\n"))
      ),
      segmentationVersion: NOVEL_SEGMENTATION_VERSION,
      pageCount: pageMetadata.length,
      cloudSync: {
        enabled: true,
        provider: "r2",
        manifestObjectKey,
        uploadedAt,
        pages: pageMetadata
      }
    };

    await this.storage.putObject({
      key: manifestObjectKey,
      bytes: new TextEncoder().encode(JSON.stringify(sourceManifest)),
      contentType: "application/json"
    });
    await this.repository.mutate((database) => {
      const session = database.sessions.find((item) => item.id === input.sessionId);
      if (!session) throw new AppError("SESSION_NOT_FOUND", `找不到共读 session：${input.sessionId}`);
      session.sourceManifest = structuredClone(sourceManifest);
      session.updatedAt = this.deps.now().toISOString();
    });
    return { sourceManifest };
  }

  async restoreMangaPage(sessionId: string, pageIndex: number): Promise<{
    bytes: ArrayBuffer;
    mimeType: string;
    page: NonNullable<SourceManifest["cloudSync"]["pages"]>[number];
    sourceManifest: SourceManifest;
  }> {
    if (!Number.isInteger(pageIndex) || pageIndex < 1) {
      throw new AppError("INVALID_OPERATION", "漫画页码无效。");
    }
    const sourceManifest = await this.requireCloudSourceManifest(sessionId);
    if (sourceManifest.sourceKind !== "manga_import") {
      throw new AppError("INVALID_OPERATION", "这不是漫画云端来源。");
    }
    const page = sourceManifest.cloudSync.pages?.find((item) => item.index === pageIndex);
    if (!page) throw new AppError("INVALID_OPERATION", "云端漫画页不存在。");

    let object;
    try {
      object = await this.storage.getObject(page.objectKey);
    } catch (error) {
      if (error instanceof SourceObjectNotFoundError) {
        throw new AppError("INVALID_OPERATION", "云端漫画页不存在。");
      }
      throw error;
    }
    const bytes = new Uint8Array(object.bytes);
    if (sha256Hex(bytes) !== page.contentHash) {
      throw new AppError("INVALID_OPERATION", "云端漫画页 hash 校验失败。");
    }
    return {
      bytes: object.bytes.slice(0),
      mimeType: page.mimeType ?? object.contentType ?? "application/octet-stream",
      page,
      sourceManifest
    };
  }

  async getCloudSourceStatus(sessionId: string): Promise<{
    status: "available" | "missing" | "disabled";
  }> {
    const database = await this.repository.read();
    const session = database.sessions.find((item) => item.id === sessionId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", `找不到共读 session：${sessionId}`);
    const objectKey = session.sourceManifest?.cloudSync.objectKey;
    if (!session.sourceManifest?.cloudSync.enabled || !objectKey) {
      return { status: "disabled" };
    }
    const head = await this.storage.headObject(objectKey);
    return { status: head.exists ? "available" : "missing" };
  }

  async deleteCloudSource(sessionId: string): Promise<{
    deleted: boolean;
    cloudSourceDeleted: boolean;
    cloudSourceDeleteError?: string;
  }> {
    const database = await this.repository.read();
    const session = database.sessions.find((item) => item.id === sessionId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", `找不到共读 session：${sessionId}`);
    const cloudSync = session.sourceManifest?.cloudSync;
    if (!cloudSync?.enabled) return { deleted: false, cloudSourceDeleted: false };

    const keys = [
      cloudSync.objectKey,
      ...(cloudSync.pages?.map((page) => page.objectKey) ?? []),
      cloudSync.manifestObjectKey
    ].filter((key): key is string => Boolean(key));

    let deleted = false;
    const errors: string[] = [];
    for (const key of keys) {
      try {
        deleted = (await this.storage.deleteObject(key)).deleted || deleted;
      } catch (error) {
        errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return {
      deleted,
      cloudSourceDeleted: deleted && errors.length === 0,
      ...(errors.length ? { cloudSourceDeleteError: errors.join("; ") } : {})
    };
  }

  private async requireCloudSourceManifest(sessionId: string): Promise<SourceManifest> {
    const database = await this.repository.read();
    const session = database.sessions.find((item) => item.id === sessionId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", `找不到共读 session：${sessionId}`);
    if (!session.sourceManifest?.cloudSync.enabled) {
      throw new AppError("INVALID_OPERATION", "这本书尚未同步到私人云端。");
    }
    return session.sourceManifest;
  }
}

export function normalizeNovelSourceText(sourceText: string): string {
  return sourceText.replace(/\r\n?/g, "\n");
}

function countNovelParagraphsForManifest(
  sourceText: string,
  sourceManifest: SourceManifest
): number {
  return splitNovelTextForVersion(sourceText, sourceManifest.segmentationVersion).length;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function inferImageExtension(mimeType: string, fileName?: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  const extension = fileName?.split(".").pop();
  if (extension) return extension;
  throw new AppError("INVALID_OPERATION", "不支持的漫画图片格式。");
}
