import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_PREFERENCES,
  migrateReadingDatabase
} from "./index.js";

const NOW = "2026-06-22T00:00:00.000Z";
const quote = {
  id: "q1",
  sessionId: "s1",
  content: "旧摘录",
  position: { kind: "paragraph" as const, index: 2, label: "第 2 段" },
  createdAt: NOW
};
const reaction = {
  id: "r1",
  sessionId: "s1",
  content: "旧反应",
  position: { kind: "paragraph" as const, index: 3, label: "第 3 段" },
  speaker: "user" as const,
  createdAt: NOW
};
const bookmark = {
  id: "b1",
  sessionId: "s1",
  position: { kind: "paragraph" as const, index: 4, label: "第 4 段" },
  label: "旧书签",
  createdAt: NOW
};

const disabledCloudSync = {
  enabled: false,
  provider: "r2"
};

describe("migrateReadingDatabase v4", () => {
  it("migrates v1 directly to v4 and preserves all records", () => {
    const migrated = migrateReadingDatabase({
      schemaVersion: 1,
      sessions: [
        {
          id: "s1",
          title: "旧书",
          type: "novel",
          status: "active",
          currentPosition: { kind: "paragraph", index: 12, label: "第 12 段" },
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW
        }
      ],
      quotes: [quote],
      reactions: [reaction],
      bookmarks: [bookmark]
    });

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.sessions[0]).toMatchObject({
      userCurrentPosition: { index: 12 },
      assistantSyncedPosition: null,
      liveReadingEnabled: false,
      sessionPreferences: DEFAULT_SESSION_PREFERENCES,
      sourceManifest: null
    });
    expect(migrated.companionComments).toEqual([]);
    expect(migrated.quotes).toEqual([quote]);
    expect(migrated.reactions).toEqual([reaction]);
    expect(migrated.bookmarks).toEqual([bookmark]);
  });

  it("migrates v2 to v4 without losing dual positions or status", () => {
    const migrated = migrateReadingDatabase({
      schemaVersion: 2,
      sessions: [
        {
          id: "s1",
          title: "双位置书",
          type: "novel",
          status: "completed",
          userCurrentPosition: { kind: "paragraph", index: 20, label: "第 20 段" },
          assistantSyncedPosition: { kind: "paragraph", index: 18, label: "第 18 段" },
          liveReadingEnabled: true,
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW,
          completedAt: NOW
        }
      ],
      quotes: [quote],
      reactions: [reaction],
      bookmarks: [bookmark]
    });

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.sessions[0]).toMatchObject({
      status: "completed",
      userCurrentPosition: { index: 20 },
      assistantSyncedPosition: { index: 18 },
      liveReadingEnabled: true,
      completedAt: NOW,
      sessionPreferences: DEFAULT_SESSION_PREFERENCES,
      sourceManifest: null
    });
    expect(migrated.companionComments).toEqual([]);
  });

  it("repairs a v3 session missing preferences with defaults", () => {
    const migrated = migrateReadingDatabase({
      schemaVersion: 3,
      sessions: [
        {
          id: "s1",
          title: "缺偏好",
          type: "novel",
          status: "active",
          userCurrentPosition: { kind: "paragraph", index: 1, label: "第 1 段" },
          assistantSyncedPosition: null,
          liveReadingEnabled: false,
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW
        }
      ],
      quotes: [],
      reactions: [],
      bookmarks: []
    });

    expect(migrated.sessions[0].sessionPreferences).toEqual(DEFAULT_SESSION_PREFERENCES);
    expect(migrated.sessions[0].sourceManifest).toBeNull();
    expect(migrated.companionComments).toEqual([]);
  });

  it("migrates v3 source metadata to v4 disabled cloud sync without object keys", () => {
    const sourceManifest = {
      sourceId: "source-1",
      sourceKind: "pasted_text" as const,
      title: "嗑糖书",
      contentHash: "a".repeat(64),
      segmentationVersion: 1,
      paragraphCount: 20,
      lastVerifiedAt: NOW
    };
    const companionComment = {
      id: "c1",
      sessionId: "s1",
      position: { kind: "paragraph" as const, index: 5, label: "第 5 段" },
      mode: "cp_talk" as const,
      length: "normal" as const,
      text: "这个对视很难说只是普通朋友。",
      source: "quick_action" as const,
      inRecent: true,
      inHistory: true,
      operationId: "comment-op-1",
      createdAt: NOW
    };
    const migrated = migrateReadingDatabase({
      schemaVersion: 3,
      sessions: [
        {
          id: "s1",
          title: "嗑糖书",
          type: "novel",
          status: "active",
          userCurrentPosition: { kind: "paragraph", index: 5, label: "第 5 段" },
          assistantSyncedPosition: null,
          liveReadingEnabled: false,
          sessionPreferences: {
            readingCommentMode: "cp_talk",
            commentLength: "normal",
            allowDeepAnalysisByDefault: false,
            liveReadingStyle: "danmaku"
          },
          sourceManifest,
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW
        }
      ],
      quotes: [],
      reactions: [],
      bookmarks: [],
      companionComments: [companionComment]
    });

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.sessions[0].sessionPreferences).toEqual({
      readingCommentMode: "cp_talk",
      commentLength: "normal",
      allowDeepAnalysisByDefault: false,
      liveReadingStyle: "danmaku",
      autoSaveCompanionComments: false
    });
    expect(migrated.sessions[0].sourceManifest).toEqual({
      ...sourceManifest,
      cloudSync: disabledCloudSync
    });
    expect(migrated.sessions[0].sourceManifest).not.toHaveProperty("cloudSync.objectKey");
    expect(migrated.sessions[0].sourceManifest).not.toHaveProperty(
      "cloudSync.manifestObjectKey"
    );
    expect(migrated.companionComments).toEqual([companionComment]);
  });

  it("preserves complete v3 preferences without replacing explicit auto-save choice", () => {
    const migrated = migrateReadingDatabase({
      schemaVersion: 3,
      sessions: [
        {
          id: "s1",
          title: "安静阅读",
          type: "novel",
          status: "active",
          userCurrentPosition: { kind: "paragraph", index: 6, label: "第 6 段" },
          assistantSyncedPosition: { kind: "paragraph", index: 4, label: "第 4 段" },
          liveReadingEnabled: false,
          sessionPreferences: {
            readingCommentMode: "reaction_only",
            commentLength: "short",
            allowDeepAnalysisByDefault: false,
            liveReadingStyle: "danmaku",
            autoSaveCompanionComments: false
          },
          sourceManifest: null,
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW
        }
      ],
      quotes: [quote],
      reactions: [reaction],
      bookmarks: [bookmark],
      companionComments: []
    });

    expect(migrated.sessions[0].sessionPreferences.autoSaveCompanionComments).toBe(false);
    expect(migrated.sessions[0].sourceManifest).toBeNull();
    expect(migrated.sessions[0].assistantSyncedPosition?.index).toBe(4);
    expect(migrated.quotes).toEqual([quote]);
    expect(migrated.reactions).toEqual([reaction]);
    expect(migrated.bookmarks).toEqual([bookmark]);
  });

  it("repairs incomplete v4 source manifests missing cloudSync", () => {
    const migrated = migrateReadingDatabase({
      schemaVersion: 4,
      sessions: [
        {
          id: "s1",
          title: "不完整 v4",
          type: "manga",
          status: "active",
          userCurrentPosition: { kind: "page", index: 2, label: "第 2 页" },
          assistantSyncedPosition: null,
          liveReadingEnabled: false,
          sessionPreferences: DEFAULT_SESSION_PREFERENCES,
          sourceManifest: {
            sourceId: "source-manga",
            sourceKind: "manga_import",
            contentHash: "b".repeat(64),
            segmentationVersion: 1,
            pageCount: 4
          },
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW
        }
      ],
      quotes: [quote],
      reactions: [reaction],
      bookmarks: [bookmark],
      companionComments: []
    });

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.sessions[0].sourceManifest?.cloudSync).toEqual(disabledCloudSync);
    expect(migrated.quotes).toEqual([quote]);
    expect(migrated.reactions).toEqual([reaction]);
    expect(migrated.bookmarks).toEqual([bookmark]);
  });

  it("keeps complete v4 cloudSync metadata", () => {
    const migrated = migrateReadingDatabase({
      schemaVersion: 4,
      sessions: [
        {
          id: "s1",
          title: "已云端同步",
          type: "novel",
          status: "active",
          userCurrentPosition: { kind: "paragraph", index: 8, label: "第 8 段" },
          assistantSyncedPosition: { kind: "paragraph", index: 6, label: "第 6 段" },
          liveReadingEnabled: false,
          sessionPreferences: DEFAULT_SESSION_PREFERENCES,
          sourceManifest: {
            sourceId: "source-cloud",
            sourceKind: "pasted_text",
            contentHash: "c".repeat(64),
            segmentationVersion: 1,
            paragraphCount: 12,
            cloudSync: {
              enabled: true,
              provider: "r2",
              objectKey: "private/sources/source-cloud/source.txt",
              manifestObjectKey: "private/sources/source-cloud/manifest.json",
              uploadedAt: NOW,
              sizeBytes: 2048,
              mimeType: "text/plain;charset=utf-8"
            }
          },
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW
        }
      ],
      quotes: [],
      reactions: [],
      bookmarks: [],
      companionComments: []
    });

    expect(migrated.sessions[0].sourceManifest?.cloudSync).toMatchObject({
      enabled: true,
      provider: "r2",
      objectKey: "private/sources/source-cloud/source.txt"
    });
  });

  it("does not introduce forbidden source or chat fields into serialized state", () => {
    const migrated = migrateReadingDatabase({
      schemaVersion: 3,
      sessions: [
        {
          id: "s1",
          title: "隐私边界",
          type: "novel",
          status: "active",
          userCurrentPosition: { kind: "paragraph", index: 1, label: "第 1 段" },
          assistantSyncedPosition: null,
          liveReadingEnabled: false,
          sourceManifest: {
            sourceId: "source-private",
            sourceKind: "pasted_text",
            contentHash: "d".repeat(64),
            segmentationVersion: 1,
            paragraphCount: 3
          },
          createdAt: NOW,
          updatedAt: NOW,
          lastReadAt: NOW
        }
      ],
      quotes: [],
      reactions: [],
      bookmarks: [],
      companionComments: []
    });
    const serialized = JSON.stringify(migrated);

    for (const forbidden of [
      "小说全文",
      "漫画图片 bytes",
      "currentText",
      "selectedText",
      "includedText",
      "skipped range 原文",
      "prompt",
      "完整聊天",
      "deep_analysis 正文"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects unsupported or malformed data", () => {
    expect(() => migrateReadingDatabase({ schemaVersion: 99 })).toThrow();
    expect(() =>
      migrateReadingDatabase({
        schemaVersion: 3,
        sessions: "not-an-array",
        quotes: [],
        reactions: [],
        bookmarks: []
      })
    ).toThrow();
  });
});
