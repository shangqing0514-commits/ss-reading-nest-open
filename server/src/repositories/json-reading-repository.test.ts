import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors/app-error.js";
import { JsonReadingRepository } from "./json-reading-repository.js";

describe("JsonReadingRepository", () => {
  it("creates a versioned empty database on first read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ss-reading-"));
    const file = join(dir, "data", "sessions.json");
    const repo = new JsonReadingRepository(file);

    const database = await repo.read();

    expect(database.schemaVersion).toBe(4);
    expect(database.sessions).toEqual([]);
    expect(database.companionComments).toEqual([]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(database);
  });

  it("migrates and persists a v1 database on read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ss-reading-"));
    const file = join(dir, "sessions.json");
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        sessions: [
          {
            id: "session-1",
            title: "旧书",
            type: "novel",
            status: "active",
            currentPosition: { kind: "paragraph", index: 12, label: "第 12 段" },
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z",
            lastReadAt: "2026-06-22T00:00:00.000Z"
          }
        ],
        quotes: [quote],
        reactions: [reaction],
        bookmarks: [bookmark],
        currentText: "绝不能写回的正文",
        prompt: "绝不能写回的提示"
      }),
      "utf8"
    );
    const repo = new JsonReadingRepository(file);

    const database = await repo.read();
    const persisted = JSON.parse(await readFile(file, "utf8"));

    expect(database.schemaVersion).toBe(4);
    expect(database.sessions[0].userCurrentPosition.index).toBe(12);
    expect(database.sessions[0].assistantSyncedPosition).toBeNull();
    expect(database.sessions[0].sessionPreferences.autoSaveCompanionComments).toBe(false);
    expect(database.sessions[0].sourceManifest).toBeNull();
    expect(database.quotes).toEqual([quote]);
    expect(database.reactions).toEqual([reaction]);
    expect(database.bookmarks).toEqual([bookmark]);
    expect(database.companionComments).toEqual([]);
    expect(persisted).toEqual(database);
    expect(JSON.stringify(persisted)).not.toContain("绝不能写回");
  });

  it("migrates and persists v2 while preserving dual positions and completion metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ss-reading-"));
    const file = join(dir, "sessions.json");
    await writeFile(file, JSON.stringify(v2Database), "utf8");
    const repo = new JsonReadingRepository(file);

    const database = await repo.read();
    const persisted = JSON.parse(await readFile(file, "utf8"));

    expect(database.schemaVersion).toBe(4);
    expect(database.sessions[0]).toMatchObject({
      status: "completed",
      userCurrentPosition: { index: 20 },
      assistantSyncedPosition: { index: 18 },
      lastAssistantConfirmation: { batchId: "batch-3" },
      completedAt: NOW,
      sessionPreferences: {
        autoSaveCompanionComments: false
      },
      sourceManifest: null
    });
    expect(database.quotes).toEqual([quote]);
    expect(database.reactions).toEqual([reaction]);
    expect(database.bookmarks).toEqual([bookmark]);
    expect(database.companionComments).toEqual([]);
    expect(persisted).toEqual(database);
  });

  it("repairs and writes back incomplete v3 without overwriting valid metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ss-reading-"));
    const file = join(dir, "sessions.json");
    await writeFile(file, JSON.stringify(incompleteV3Database), "utf8");
    const repo = new JsonReadingRepository(file);

    const database = await repo.read();
    const persisted = JSON.parse(await readFile(file, "utf8"));

    expect(database.sessions[0].sessionPreferences).toEqual({
      ...preferences,
      autoSaveCompanionComments: false
    });
    expect(database.sessions[0].sourceManifest).toEqual({
      ...sourceManifest,
      cloudSync: disabledCloudSync
    });
    expect(database.companionComments).toEqual([companionComment]);
    expect(persisted).toEqual(database);
    expect(JSON.stringify(persisted)).not.toContain("不要保存");
  });

  it("round-trips companion flags and strips unknown sensitive comment fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ss-reading-"));
    const file = join(dir, "sessions.json");
    await writeFile(
      file,
      JSON.stringify({
        ...incompleteV3Database,
        sessions: [
          {
            ...incompleteV3Database.sessions[0],
            sessionPreferences: {
              ...preferences,
              autoSaveCompanionComments: true
            }
          }
        ],
        companionComments: [
          {
            ...companionComment,
            prompt: "不要保存的 prompt",
            currentText: "不要保存的正文",
            fullChat: "不要保存的聊天"
          }
        ]
      }),
      "utf8"
    );
    const repo = new JsonReadingRepository(file);

    const database = await repo.read();
    const persisted = await readFile(file, "utf8");

    expect(database.companionComments[0]).toMatchObject({
      inRecent: true,
      inHistory: true,
      operationId: "comment-op-1"
    });
    expect(persisted).not.toMatch(/不要保存的 prompt|不要保存的正文|不要保存的聊天/);
  });

  it("does not overwrite a corrupted database", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ss-reading-"));
    const file = join(dir, "sessions.json");
    await writeFile(file, "{broken", "utf8");
    const repo = new JsonReadingRepository(file);

    const error = await repo.read().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("DATA_STORE_CORRUPTED");
    expect(await readFile(file, "utf8")).toBe("{broken");
  });
});

const NOW = "2026-06-22T00:00:00.000Z";
const quote = {
  id: "quote-1",
  sessionId: "session-1",
  content: "旧摘录",
  position: { kind: "paragraph", index: 2, label: "第 2 段" },
  createdAt: NOW
};
const reaction = {
  id: "reaction-1",
  sessionId: "session-1",
  content: "旧反应",
  position: { kind: "paragraph", index: 3, label: "第 3 段" },
  speaker: "user",
  createdAt: NOW
};
const bookmark = {
  id: "bookmark-1",
  sessionId: "session-1",
  position: { kind: "paragraph", index: 4, label: "第 4 段" },
  label: "旧书签",
  createdAt: NOW
};
const preferences = {
  readingCommentMode: "cp_talk",
  commentLength: "normal",
  allowDeepAnalysisByDefault: false,
  liveReadingStyle: "danmaku"
};
const sourceManifest = {
  sourceId: "source-1",
  sourceKind: "pasted_text",
  title: "完整 v3",
  contentHash: "a".repeat(64),
  segmentationVersion: 1,
  paragraphCount: 20
};
const disabledCloudSync = {
  enabled: false,
  provider: "r2"
};
const companionComment = {
  id: "comment-1",
  sessionId: "session-1",
  position: { kind: "paragraph", index: 5, label: "第 5 段" },
  mode: "cp_talk",
  length: "normal",
  text: "这里的关系张力很明显。",
  source: "quick_action",
  inRecent: true,
  inHistory: true,
  operationId: "comment-op-1",
  createdAt: NOW
};
const v2Database = {
  schemaVersion: 2,
  sessions: [
    {
      id: "session-1",
      title: "双位置书",
      type: "novel",
      status: "completed",
      userCurrentPosition: { kind: "paragraph", index: 20, label: "第 20 段" },
      assistantSyncedPosition: { kind: "paragraph", index: 18, label: "第 18 段" },
      liveReadingEnabled: true,
      lastAssistantConfirmation: {
        operationId: "confirm-op-1",
        batchId: "batch-3",
        confirmedAt: NOW
      },
      createdAt: NOW,
      updatedAt: NOW,
      lastReadAt: NOW,
      completedAt: NOW
    }
  ],
  quotes: [quote],
  reactions: [reaction],
  bookmarks: [bookmark]
};
const incompleteV3Database = {
  schemaVersion: 3,
  sessions: [
    {
      ...v2Database.sessions[0],
      title: "完整 v3",
      status: "active",
      sessionPreferences: preferences,
      sourceManifest,
      selectedText: "不要保存"
    }
  ],
  quotes: [quote],
  reactions: [reaction],
  bookmarks: [bookmark],
  companionComments: [companionComment],
  fullChat: "不要保存"
};
