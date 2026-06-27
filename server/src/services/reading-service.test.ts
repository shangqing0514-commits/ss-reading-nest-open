import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonReadingRepository } from "../repositories/json-reading-repository.js";
import { ReadingService } from "./reading-service.js";

describe("ReadingService", () => {
  let service: ReadingService;
  let repository: JsonReadingRepository;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "ss-reading-"));
    repository = new JsonReadingRepository(join(dir, "sessions.json"));
    service = new ReadingService(repository, {
      now: () => new Date("2026-06-22T10:00:00.000Z"),
      id: vi.fn()
        .mockReturnValueOnce("session-1")
        .mockReturnValueOnce("quote-1")
        .mockReturnValueOnce("bookmark-1")
    });
  });

  it("creates sessions with complete v3 repository defaults", async () => {
    const session = await service.startSession("雨夜里的信", "novel");

    expect(session.sessionPreferences).toEqual({
      readingCommentMode: "light_chat",
      commentLength: "normal",
      allowDeepAnalysisByDefault: false,
      liveReadingStyle: "danmaku",
      autoSaveCompanionComments: false
    });
    expect(session.sourceManifest).toBeNull();
  });

  it("lists every session for the bookshelf with active sessions first", async () => {
    let id = 0;
    const bookshelfService = new ReadingService(repository, {
      now: () => new Date(`2026-06-${String(10 + id).padStart(2, "0")}T10:00:00.000Z`),
      id: () => `bookshelf-${++id}`
    });
    const sessions = [];
    for (let index = 0; index < 12; index += 1) {
      sessions.push(await bookshelfService.startSession(`书 ${index + 1}`, "novel"));
    }
    await bookshelfService.completeSession(sessions[10]!.id);
    await bookshelfService.completeSession(sessions[11]!.id);

    const bookshelf = await bookshelfService.listAllSessions();

    expect(bookshelf).toHaveLength(12);
    expect(bookshelf.slice(0, 10).every((session) => session.status === "active")).toBe(true);
    expect(bookshelf.slice(10).every((session) => session.status === "completed")).toBe(true);
  });

  it("renames and changes status without touching related session data", async () => {
    const first = await service.startSession("第一本", "novel");
    const second = await service.startSession("第二本", "novel");
    await service.updateUserPosition(first.id, {
      kind: "paragraph",
      index: 7,
      label: "第 7 段"
    });
    await service.updateSessionPreferences(first.id, { readingCommentMode: "cp_talk" });
    await service.saveQuote({
      sessionId: first.id,
      content: "第一本摘录",
      position: { kind: "paragraph", index: 2, label: "第 2 段" }
    });
    await service.saveReaction({
      sessionId: first.id,
      content: "第一本反应",
      position: { kind: "paragraph", index: 3, label: "第 3 段" },
      speaker: "user"
    });
    await service.saveBookmark({
      sessionId: first.id,
      position: { kind: "paragraph", index: 4, label: "第 4 段" }
    });
    await service.publishCompanionComment({
      sessionId: first.id,
      position: { kind: "paragraph", index: 5, label: "第 5 段" },
      mode: "light_chat",
      length: "normal",
      text: "第一本短评",
      source: "current_context",
      operationId: "comment-first"
    });
    const before = await service.getSessionBundle(first.id);

    const renamed = await service.renameSession(first.id, "改名后的第一本");
    const completed = await service.setSessionStatus(first.id, "completed");
    const active = await service.setSessionStatus(first.id, "active");
    const after = await service.getSessionBundle(first.id);
    const secondAfter = await service.getSessionBundle(second.id);

    expect(renamed.title).toBe("改名后的第一本");
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeDefined();
    expect(active.status).toBe("active");
    expect(active.completedAt).toBeUndefined();
    expect(after.session.userCurrentPosition).toEqual(before.session.userCurrentPosition);
    expect(after.session.sessionPreferences).toEqual({
      ...before.session.sessionPreferences,
      readingCommentMode: "cp_talk"
    });
    expect(after.quotes).toEqual(before.quotes);
    expect(after.reactions).toEqual(before.reactions);
    expect(after.bookmarks).toEqual(before.bookmarks);
    expect((await service.listCompanionComments({ sessionId: first.id, scope: "recent" })).comments)
      .toHaveLength(1);
    expect(secondAfter.session.title).toBe("第二本");
  });

  it("deletes only one session and all of its structured records", async () => {
    const first = await service.startSession("第一本", "novel");
    const second = await service.startSession("第二本", "novel");
    await service.saveQuote({
      sessionId: first.id,
      content: "第一本摘录",
      position: { kind: "paragraph", index: 1, label: "第 1 段" }
    });
    await service.saveReaction({
      sessionId: first.id,
      content: "第一本反应",
      position: { kind: "paragraph", index: 1, label: "第 1 段" },
      speaker: "user"
    });
    await service.saveBookmark({
      sessionId: first.id,
      position: { kind: "paragraph", index: 1, label: "第 1 段" }
    });
    await service.publishCompanionComment({
      sessionId: first.id,
      position: { kind: "paragraph", index: 1, label: "第 1 段" },
      mode: "light_chat",
      length: "normal",
      text: "第一本短评",
      source: "current_context",
      operationId: "delete-comment"
    });

    expect(await service.deleteSession(first.id, "delete-first")).toEqual({
      sessionId: first.id,
      deleted: true,
      cloudSourceDeleted: false
    });
    expect(await service.deleteSession(first.id, "delete-first")).toEqual({
      sessionId: first.id,
      deleted: false,
      cloudSourceDeleted: false
    });
    const database = await repository.read();
    expect(database.sessions.some((session) => session.id === first.id)).toBe(false);
    expect(database.quotes.some((item) => item.sessionId === first.id)).toBe(false);
    expect(database.reactions.some((item) => item.sessionId === first.id)).toBe(false);
    expect(database.bookmarks.some((item) => item.sessionId === first.id)).toBe(false);
    expect(database.companionComments.some((item) => item.sessionId === first.id)).toBe(false);
    expect(await service.getSessionBundle(second.id)).toMatchObject({
      session: { id: second.id, title: "第二本" }
    });
  });

  it("optionally deletes the private cloud source and exposes partial failure metadata", async () => {
    const cloudSource = {
      deleteCloudSource: vi.fn().mockResolvedValue({
        deleted: false,
        cloudSourceDeleted: false,
        cloudSourceDeleteError: "manifest delete failed"
      })
    };
    const deleteService = new ReadingService(
      repository,
      {
        now: () => new Date("2026-06-22T10:00:00.000Z"),
        id: vi.fn().mockReturnValueOnce("delete-cloud-session")
      },
      cloudSource
    );
    const session = await deleteService.startSession("云端书", "novel");

    const result = await deleteService.deleteSession(session.id, "delete-cloud", {
      deleteCloudSource: true
    });

    expect(cloudSource.deleteCloudSource).toHaveBeenCalledWith(session.id);
    expect(result).toEqual({
      sessionId: session.id,
      deleted: true,
      cloudSourceDeleted: false,
      cloudSourceDeleteError: "manifest delete failed"
    });
    expect((await deleteService.listAllSessions()).some((item) => item.id === session.id)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/sourceText|data:image|publicUrl|signedUrl/);
  });

  it("deduplicates quote writes by operationId", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    const input = {
      sessionId: session.id,
      content: "她把信折好。",
      position: { kind: "paragraph" as const, index: 2, label: "第 2 段" },
      operationId: "op-quote"
    };

    const first = await service.saveQuote(input);
    const second = await service.saveQuote(input);
    const bundle = await service.getSessionBundle(session.id);

    expect(second.id).toBe(first.id);
    expect(bundle.quotes).toHaveLength(1);
  });

  it("keeps user and assistant positions separate", async () => {
    const session = await service.startSession("雨夜里的信", "novel");

    expect(session.userCurrentPosition.index).toBe(1);
    expect(session.assistantSyncedPosition).toBeNull();
    expect(session.liveReadingEnabled).toBe(false);

    await service.updateUserPosition(session.id, {
      kind: "paragraph",
      index: 12,
      label: "第 12 段"
    });
    const afterUserMove = await service.getSessionBundle(session.id);

    expect(afterUserMove.session.userCurrentPosition.index).toBe(12);
    expect(afterUserMove.session.assistantSyncedPosition).toBeNull();
  });

  it("persists source manifest without changing session or related records", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    await service.updateUserPosition(session.id, {
      kind: "paragraph",
      index: 12,
      label: "第 12 段"
    });
    await service.saveQuote({
      sessionId: session.id,
      content: "摘录",
      position: { kind: "paragraph", index: 2, label: "第 2 段" }
    });
    await service.saveReaction({
      sessionId: session.id,
      content: "反应",
      position: { kind: "paragraph", index: 3, label: "第 3 段" },
      speaker: "user"
    });
    await service.saveBookmark({
      sessionId: session.id,
      position: { kind: "paragraph", index: 4, label: "第 4 段" }
    });
    const before = await service.getSessionBundle(session.id);
    const manifest = {
      sourceId: "source-1",
      sourceKind: "pasted_text" as const,
      contentHash: "a".repeat(64),
      segmentationVersion: 1,
      paragraphCount: 12
    };

    const updated = await service.setSourceManifest(session.id, manifest);
    const after = await service.getSessionBundle(session.id);

    expect(updated.sourceManifest).toEqual(manifest);
    expect(updated.userCurrentPosition).toEqual(before.session.userCurrentPosition);
    expect(updated.assistantSyncedPosition).toEqual(before.session.assistantSyncedPosition);
    expect(updated.sessionPreferences).toEqual(before.session.sessionPreferences);
    expect(after.quotes).toEqual(before.quotes);
    expect(after.reactions).toEqual(before.reactions);
    expect(after.bookmarks).toEqual(before.bookmarks);
    expect((await repository.read()).companionComments).toEqual([]);
  });

  it("advances assistant position only through explicit idempotent confirmation", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    await service.updateUserPosition(session.id, {
      kind: "paragraph",
      index: 12,
      label: "第 12 段"
    });
    const input = {
      sessionId: session.id,
      confirmedPosition: { kind: "paragraph" as const, index: 8, label: "第 8 段" },
      batchId: "batch-1",
      operationId: "confirm-1"
    };

    const first = await service.confirmAssistantPosition(input);
    const second = await service.confirmAssistantPosition(input);

    expect(first.assistantSyncedPosition?.index).toBe(8);
    expect(second.assistantSyncedPosition?.index).toBe(8);
    expect(second.lastAssistantConfirmation?.operationId).toBe("confirm-1");
  });

  it("rejects confirmations beyond the user or behind the confirmed position", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    await service.updateUserPosition(session.id, {
      kind: "paragraph",
      index: 12,
      label: "第 12 段"
    });
    await expect(
      service.confirmAssistantPosition({
        sessionId: session.id,
        confirmedPosition: { kind: "paragraph", index: 13, label: "第 13 段" },
        batchId: "too-far",
        operationId: "confirm-too-far"
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });

    await service.confirmAssistantPosition({
      sessionId: session.id,
      confirmedPosition: { kind: "paragraph", index: 8, label: "第 8 段" },
      batchId: "batch-1",
      operationId: "confirm-1"
    });
    await expect(
      service.confirmAssistantPosition({
        sessionId: session.id,
        confirmedPosition: { kind: "paragraph", index: 7, label: "第 7 段" },
        batchId: "backwards",
        operationId: "confirm-backwards"
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
  });

  it("persists live-reading preference without changing assistant position", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    const updated = await service.setLiveReadingMode(session.id, true);

    expect(updated.liveReadingEnabled).toBe(true);
    expect(updated.assistantSyncedPosition).toBeNull();
  });

  it("partially updates one session preference without changing reading data", async () => {
    const first = await service.startSession("第一本", "novel");
    const second = await service.startSession("第二本", "novel");
    await service.updateUserPosition(first.id, {
      kind: "paragraph",
      index: 12,
      label: "第 12 段"
    });
    await service.setSourceManifest(first.id, {
      sourceId: "source-1",
      sourceKind: "pasted_text",
      contentHash: "a".repeat(64),
      segmentationVersion: 1,
      paragraphCount: 12
    });
    const before = await service.getSessionBundle(first.id);

    const updated = await service.updateSessionPreferences(first.id, {
      readingCommentMode: "cp_talk",
      autoSaveCompanionComments: false
    });
    const firstAfter = await service.getSessionBundle(first.id);
    const secondAfter = await service.getSessionBundle(second.id);

    expect(updated.sessionPreferences).toEqual({
      readingCommentMode: "cp_talk",
      commentLength: "normal",
      allowDeepAnalysisByDefault: false,
      liveReadingStyle: "danmaku",
      autoSaveCompanionComments: false
    });
    expect(firstAfter.session.userCurrentPosition).toEqual(
      before.session.userCurrentPosition
    );
    expect(firstAfter.session.assistantSyncedPosition).toEqual(
      before.session.assistantSyncedPosition
    );
    expect(firstAfter.session.sourceManifest).toEqual(before.session.sourceManifest);
    expect(firstAfter.session.status).toBe(before.session.status);
    expect(secondAfter.session.sessionPreferences).toEqual(
      second.sessionPreferences
    );
  });

  it("keeps an empty or repeated preference patch idempotent", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    const first = await service.updateSessionPreferences(session.id, {
      commentLength: "short",
      liveReadingStyle: "danmaku"
    });
    const repeated = await service.updateSessionPreferences(session.id, {
      commentLength: "short",
      liveReadingStyle: "danmaku"
    });
    const empty = await service.updateSessionPreferences(session.id, {});

    expect(repeated.updatedAt).toBe(first.updatedAt);
    expect(empty.updatedAt).toBe(first.updatedAt);
    expect(empty.sessionPreferences).toEqual(first.sessionPreferences);
  });

  it("finishes today without completing the work and creates one dated bookmark", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    const input = {
      sessionId: session.id,
      position: { kind: "paragraph" as const, index: 8, label: "第 8 段" },
      createBookmark: true,
      operationId: "op-finish"
    };

    await service.finishToday(input);
    await service.finishToday(input);
    const bundle = await service.getSessionBundle(session.id);

    expect(bundle.session.status).toBe("active");
    expect(bundle.session.userCurrentPosition.index).toBe(8);
    expect(bundle.session.assistantSyncedPosition).toBeNull();
    expect(bundle.bookmarks).toHaveLength(1);
    expect(bundle.bookmarks[0]?.label).toBe("今天看到这里 · 2026-06-22");
  });

  it("only completes the work through completeSession", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    const completed = await service.completeSession(session.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe("2026-06-22T10:00:00.000Z");
  });

  it("persists only structured sync metadata", async () => {
    const session = await service.startSession("雨夜里的信", "novel");
    await service.updateUserPosition(session.id, {
      kind: "paragraph",
      index: 8,
      label: "第 8 段"
    });
    await service.confirmAssistantPosition({
      sessionId: session.id,
      confirmedPosition: { kind: "paragraph", index: 3, label: "第 3 段" },
      batchId: "batch-1",
      operationId: "confirm-1"
    });
    const stored = JSON.stringify(await repository.read());

    expect(stored).not.toMatch(
      /includedText|currentText|selectedText|download_url|file_id|ChatGPT reply|OPENAI_API_KEY|token/
    );
  });
});
