import { readFile } from "node:fs/promises";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_PREFERENCES, type ReadingDatabase } from "@ss/shared";
import { createApp } from "./app.js";
import { buildCurrentReadingContext } from "./mcp/register-tools.js";
import { toolResult } from "./mcp/tool-result.js";
import type { ReadingRepository } from "./repositories/reading-repository.js";
import { ReadingService } from "./services/reading-service.js";
import { CloudSourceService } from "./services/cloud-source-service.js";
import { MemorySourceObjectStorage } from "./storage/memory-source-object-storage.js";
import {
  buildSourceManifestObjectKey,
  buildSourceObjectKey,
  buildSourcePageObjectKey
} from "./storage/source-object-keys.js";
import { handleSourceRoute } from "./source-routes.js";
import { getWorkerRoute } from "./worker-router.js";

const NOW = "2026-06-24T00:00:00.000Z";
const NOVEL_SECRET = "TASK8_NOVEL_SOURCE_SECRET";
const CURRENT_TEXT = "TASK8_CURRENT_TEXT";
const SELECTED_TEXT = "TASK8_SELECTED_TEXT";
const INCLUDED_TEXT = "TASK8_INCLUDED_TEXT";
const SKIPPED_TEXT = "TASK8_SKIPPED_RANGE_TEXT";
const CHAT_TRANSCRIPT = "TASK8_FULL_CHAT_TRANSCRIPT";
const PROMPT_TEXT = "TASK8_PROMPT_TEXT";
const DEEP_ANALYSIS = "TASK8_DEEP_ANALYSIS_BODY";
const IMAGE_BASE64 = "AQID";
const API_SECRET = "OPENAI_API_KEY";

const forbidden = [
  NOVEL_SECRET,
  CURRENT_TEXT,
  SELECTED_TEXT,
  INCLUDED_TEXT,
  SKIPPED_TEXT,
  CHAT_TRANSCRIPT,
  PROMPT_TEXT,
  DEEP_ANALYSIS,
  IMAGE_BASE64,
  "data:image",
  "bytesBase64",
  "sourceText",
  "download_url",
  "file_id",
  "publicUrl",
  "signedUrl",
  API_SECRET
];

describe("privacy boundary", () => {
  it("keeps novel upload and restore text out of D1-like state", async () => {
    const { cloudSource, repository, sessionId } = setup();

    await cloudSource.uploadNovelSource({
      sessionId,
      sourceKind: "pasted_text",
      title: "Secret Title",
      sourceText: `${NOVEL_SECRET}\n\nSecond paragraph`
    });
    assertNoForbidden(JSON.stringify(await repository.read()));

    await cloudSource.restoreNovelSource(sessionId);
    assertNoForbidden(JSON.stringify(await repository.read()));
  });

  it("keeps manga image bytes out of D1-like state while allowing component-only restore bytes", async () => {
    const { cloudSource, repository, sessionId } = setup();
    await cloudSource.uploadMangaSource({
      sessionId,
      title: "Secret Manga",
      pages: [{ index: 1, bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" }]
    });
    assertNoForbidden(JSON.stringify(await repository.read()));

    const componentResponse = await handleSourceRoute(
      new Request("https://example.test/source/private-token/restore", {
        method: "POST",
        body: JSON.stringify({ sessionId, sourceKind: "manga_import", pageIndex: 1 })
      }),
      cloudSource
    );
    expect(componentResponse.status).toBe(200);
    expect(await componentResponse.clone().json()).toMatchObject({ bytesBase64: IMAGE_BASE64 });
    assertNoForbidden(JSON.stringify(await repository.read()));
  });

  it("does not persist context-send payloads or rejected companion comment bodies", async () => {
    const { repository, readingService, sessionId } = setup();
    const before = await repository.read();
    const session = before.sessions.find((item) => item.id === sessionId)!;

    const context = buildCurrentReadingContext(session, {
      sessionId,
      mode: "current_only",
      position: session.userCurrentPosition,
      currentText: CURRENT_TEXT,
      selectedText: SELECTED_TEXT,
      includedText: INCLUDED_TEXT,
      contextRange: { startIndex: 1, endIndex: 8, skippedCount: 6 },
      batch: { id: "batch-1", label: "catch-up", startIndex: 1, endIndex: 8, text: SKIPPED_TEXT },
      sourceContext: {
        contentHash: "a".repeat(64),
        segmentationVersion: 1,
        paragraphCount: 8
      }
    });
    expect(JSON.stringify(context)).toContain(CURRENT_TEXT);
    expect(await repository.read()).toEqual(before);

    await expect(
      readingService.publishCompanionComment({
        sessionId,
        position: session.userCurrentPosition,
        mode: "deep_analysis",
        length: "long",
        text: DEEP_ANALYSIS,
        source: "current_context",
        operationId: "deep-analysis"
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
    await expect(
      readingService.publishCompanionComment({
        sessionId,
        position: session.userCurrentPosition,
        mode: "light_chat",
        length: "short",
        text: `${NOVEL_SECRET} ${"x".repeat(501)}`,
        source: "current_context",
        operationId: "long-source"
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
    assertNoForbidden(JSON.stringify(await repository.read()));
  });

  it("keeps assistant-visible delete and status results metadata-only", async () => {
    const { cloudSource, sessionId } = setup();
    await cloudSource.uploadNovelSource({
      sessionId,
      sourceKind: "pasted_text",
      sourceText: `${NOVEL_SECRET}\n\nSecond paragraph`
    });

    const statusResult = toolResult(
      await cloudSource.getCloudSourceStatus(sessionId),
      "checked cloud source status"
    );
    const deleteResult = toolResult(
      await cloudSource.deleteCloudSource(sessionId),
      "deleted cloud source"
    );

    assertNoForbidden(JSON.stringify(statusResult));
    assertNoForbidden(JSON.stringify(deleteResult));
  });

  it("keeps R2 object keys private and free of title, hash, filename, text, and URLs", () => {
    const sourceId = "opaque-source-id";
    const keys = [
      buildSourceObjectKey(sourceId),
      buildSourceManifestObjectKey(sourceId),
      buildSourcePageObjectKey(sourceId, 1, "png")
    ];

    expect(keys.every((key) => key.startsWith("private/sources/"))).toBe(true);
    expect(JSON.stringify(keys)).not.toMatch(
      /Secret Title|[a-f0-9]{64}|chapter-one\.txt|TASK8_NOVEL_SOURCE_SECRET|publicUrl|signedUrl|https?:\/\//
    );
  });

  it("keeps health and wrong private paths free of tokens, object keys, source text, and R2 details", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /private-token|objectKey|sourceText|SOURCES_BUCKET|R2|TASK8_NOVEL_SOURCE_SECRET/
    );
    expect(getWorkerRoute(new URL("https://example.test/source/wrong/upload"), "private-token")).toBe(
      "not-found"
    );
    expect(getWorkerRoute(new URL("https://example.test/source/private-token"), "private-token")).toBe(
      "not-found"
    );
  });

  it("documents the v0.2.2 cloud-first privacy model in README", async () => {
    const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");

    expect(readme).toContain("v0.2.2");
    expect(readme).toMatch(/R2[\s\S]*正文/);
    expect(readme).toMatch(/D1[\s\S]*metadata/);
    expect(readme).toMatch(/IndexedDB[\s\S]*加速缓存/);
    expect(readme).toContain("component-only");
    expect(readme).toContain("ChatGPT 模型不会自动读取整本小说或整套漫画");
    expect(readme).toContain("删除云端阅读记录");
    expect(readme).toContain("同时删除云端正文副本");
    expect(readme).toContain("同时删除本设备正文缓存");
    expect(readme).toContain("不生成 public URL 或 signed URL");
    expect(readme).toContain("remote smoke");
  });
});

function setup() {
  const repository = new MemoryReadingRepository();
  const storage = new MemorySourceObjectStorage();
  const readingService = new ReadingService(repository, {
    now: () => new Date(NOW),
    id: () => "comment-1"
  });
  const cloudSource = new CloudSourceService(repository, storage, {
    now: () => new Date(NOW),
    id: () => "source-1"
  });
  return { cloudSource, readingService, repository, sessionId: "session-1", storage };
}

function assertNoForbidden(serialized: string) {
  for (const token of forbidden) {
    expect(serialized).not.toContain(token);
  }
}

class MemoryReadingRepository implements ReadingRepository {
  private database: ReadingDatabase = {
    schemaVersion: 4,
    sessions: [
      {
        id: "session-1",
        title: "Task 8 privacy book",
        type: "novel",
        status: "active",
        userCurrentPosition: { kind: "paragraph", index: 1, label: "paragraph 1" },
        assistantSyncedPosition: null,
        liveReadingEnabled: false,
        sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
        sourceManifest: null,
        createdAt: NOW,
        updatedAt: NOW,
        lastReadAt: NOW
      }
    ],
    quotes: [],
    reactions: [],
    bookmarks: [],
    companionComments: []
  };

  async read(): Promise<ReadingDatabase> {
    return structuredClone(this.database);
  }

  async mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>): Promise<T> {
    return change(this.database);
  }
}
