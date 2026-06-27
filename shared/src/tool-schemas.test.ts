import { describe, expect, it } from "vitest";
import {
  confirmAssistantSyncedPositionInputSchema,
  clearCompanionCommentsInputSchema,
  deleteReadingSessionInputSchema,
  deleteCloudSourceInputSchema,
  getCloudSourceStatusInputSchema,
  uploadCloudSourceInputSchema,
  listCompanionCommentsInputSchema,
  publishCompanionCommentInputSchema,
  renameReadingSessionInputSchema,
  sendCurrentContextInputSchema,
  setReadingSessionStatusInputSchema,
  setSourceManifestInputSchema,
  setLiveReadingModeInputSchema,
  updateSessionPreferencesInputSchema,
  updateReadingPositionInputSchema
} from "./tool-schemas.js";

describe("sendCurrentContextInputSchema", () => {
  it("accepts one top-level current page file reference", () => {
    const result = sendCurrentContextInputSchema.parse({
      sessionId: "session-1",
      currentPosition: { kind: "page", index: 2, total: 8, label: "第 2 页" },
      mode: "current_only",
      currentPageImage: {
        file_id: "file-1",
        download_url: "https://example.test/file",
        mime_type: "image/png",
        file_name: "page-2.png"
      }
    });

    expect(result.currentPageImage?.file_id).toBe("file-1");
  });

  it("rejects raw file-like values and arrays of pages", () => {
    expect(() =>
      sendCurrentContextInputSchema.parse({
        sessionId: "session-1",
        currentPosition: { kind: "page", index: 1, label: "第 1 页" },
        mode: "current_only",
        currentPageImage: [{ name: "raw-file.png" }]
      })
    ).toThrow();
  });

  it("accepts range-sync metadata and the deprecated position alias", () => {
    const result = sendCurrentContextInputSchema.parse({
      sessionId: "session-1",
      position: { kind: "paragraph", index: 8, label: "第 8 段" },
      previousSyncedPosition: { kind: "paragraph", index: 2, label: "第 2 段" },
      contextRange: { start: 3, end: 8 },
      includedText: "第 3–8 段原文",
      mode: "range_sync",
      readingCommentMode: "reaction_only",
      commentLength: "short",
      sourceContext: {
        contentHash: "a".repeat(64),
        segmentationVersion: 1,
        paragraphCount: 20
      },
      batch: {
        id: "batch-1",
        ordinal: 1,
        total: 2,
        rangeStart: 3,
        rangeEnd: 8,
        hasMore: true
      }
    });

    expect(result.mode).toBe("range_sync");
    expect(result.readingCommentMode).toBe("reaction_only");
    expect(result.commentLength).toBe("short");
    expect(result.sourceContext?.paragraphCount).toBe(20);
  });

  it("keeps sourceContext optional for existing current-only calls", () => {
    const result = sendCurrentContextInputSchema.parse({
      sessionId: "session-1",
      currentPosition: { kind: "paragraph", index: 1, label: "第 1 段" },
      currentText: "第一段",
      mode: "current_only"
    });

    expect(result).not.toHaveProperty("sourceContext");
  });
});

describe("v0.2 position schemas", () => {
  it("updates only userCurrentPosition", () => {
    const result = updateReadingPositionInputSchema.parse({
      sessionId: "session-1",
      userCurrentPosition: { kind: "paragraph", index: 12, label: "第 12 段" }
    });
    expect(result.userCurrentPosition.index).toBe(12);
    expect(result).not.toHaveProperty("assistantSyncedPosition");
  });

  it("requires an operationId for assistant confirmation", () => {
    expect(() =>
      confirmAssistantSyncedPositionInputSchema.parse({
        sessionId: "session-1",
        confirmedPosition: { kind: "paragraph", index: 8, label: "第 8 段" },
        batchId: "batch-1"
      })
    ).toThrow();
  });

  it("accepts live-reading preference updates", () => {
    expect(
      setLiveReadingModeInputSchema.parse({ sessionId: "session-1", enabled: true })
    ).toEqual({ sessionId: "session-1", enabled: true });
  });

  it("accepts strict partial session preference updates", () => {
    expect(
      updateSessionPreferencesInputSchema.parse({
        sessionId: "session-1",
        preferences: {
          readingCommentMode: "cp_talk",
          commentLength: "normal",
          liveReadingStyle: "danmaku",
          autoSaveCompanionComments: false
        }
      })
    ).toEqual({
      sessionId: "session-1",
      preferences: {
        readingCommentMode: "cp_talk",
        commentLength: "normal",
        liveReadingStyle: "danmaku",
        autoSaveCompanionComments: false
      }
    });
  });

  it("rejects unknown preference fields and deep-analysis default changes", () => {
    expect(() =>
      updateSessionPreferencesInputSchema.parse({
        sessionId: "session-1",
        preferences: { unknownField: true }
      })
    ).toThrow();
    expect(() =>
      updateSessionPreferencesInputSchema.parse({
        sessionId: "session-1",
        preferences: { allowDeepAnalysisByDefault: true }
      })
    ).toThrow();
  });

  it("accepts an empty preference patch as an idempotent no-op", () => {
    expect(
      updateSessionPreferencesInputSchema.parse({
        sessionId: "session-1",
        preferences: {}
      })
    ).toEqual({ sessionId: "session-1", preferences: {} });
  });
});

describe("source manifest schemas", () => {
  const manifest = {
    sourceId: "source-1",
    sourceKind: "pasted_text" as const,
    title: "测试小说",
    contentHash: "a".repeat(64),
    segmentationVersion: 1,
    paragraphCount: 12,
    cloudSync: {
      enabled: false,
      provider: "r2" as const
    }
  };

  it("accepts metadata-only source manifests with disabled cloud sync", () => {
    expect(
      setSourceManifestInputSchema.parse({
        sessionId: "session-1",
        sourceManifest: manifest
      }).sourceManifest
    ).toEqual(manifest);
  });

  it("accepts cloud-synced novel source metadata", () => {
    const result = setSourceManifestInputSchema.parse({
      sessionId: "session-1",
      sourceManifest: {
        ...manifest,
        cloudSync: {
          enabled: true,
          provider: "r2",
          objectKey: "private/sources/source-1/source.txt",
          manifestObjectKey: "private/sources/source-1/manifest.json",
          uploadedAt: "2026-06-24T00:00:00.000Z",
          sizeBytes: 1234,
          mimeType: "text/plain;charset=utf-8"
        }
      }
    });

    expect(result.sourceManifest.cloudSync).toMatchObject({
      enabled: true,
      provider: "r2",
      objectKey: "private/sources/source-1/source.txt"
    });
  });

  it("accepts manga page cloud metadata", () => {
    const result = setSourceManifestInputSchema.parse({
      sessionId: "session-1",
      sourceManifest: {
        sourceId: "source-manga",
        sourceKind: "manga_import",
        contentHash: "b".repeat(64),
        segmentationVersion: 1,
        pageCount: 2,
        cloudSync: {
          enabled: true,
          provider: "r2",
          manifestObjectKey: "private/sources/source-manga/manifest.json",
          pages: [
            {
              index: 1,
              objectKey: "private/sources/source-manga/pages/1.png",
              contentHash: "c".repeat(64),
              sizeBytes: 456,
              mimeType: "image/png"
            }
          ]
        }
      }
    });

    expect(result.sourceManifest.cloudSync.pages?.[0].index).toBe(1);
  });

  it("requires objectKey for enabled novel cloud sync but not for disabled sync", () => {
    expect(
      setSourceManifestInputSchema.parse({
        sessionId: "session-1",
        sourceManifest: manifest
      }).sourceManifest.cloudSync.enabled
    ).toBe(false);

    expect(() =>
      setSourceManifestInputSchema.parse({
        sessionId: "session-1",
        sourceManifest: {
          ...manifest,
          cloudSync: {
            enabled: true,
            provider: "r2"
          }
        }
      })
    ).toThrow();
  });

  it("rejects enabled novel cloud sync that only provides manga pages", () => {
    expect(() =>
      setSourceManifestInputSchema.parse({
        sessionId: "session-1",
        sourceManifest: {
          ...manifest,
          cloudSync: {
            enabled: true,
            provider: "r2",
            pages: [
              {
                index: 1,
                objectKey: "private/sources/source-1/pages/1.png",
                contentHash: "c".repeat(64)
              }
            ]
          }
        }
      })
    ).toThrow();
  });

  it("rejects enabled manga cloud sync that only provides a novel objectKey", () => {
    expect(() =>
      setSourceManifestInputSchema.parse({
        sessionId: "session-1",
        sourceManifest: {
          sourceId: "source-manga",
          sourceKind: "manga_import",
          contentHash: "b".repeat(64),
          segmentationVersion: 1,
          pageCount: 2,
          cloudSync: {
            enabled: true,
            provider: "r2",
            objectKey: "private/sources/source-manga/source.txt"
          }
        }
      })
    ).toThrow();
  });

  it("rejects unknown cloud provider and invalid page indexes", () => {
    expect(() =>
      setSourceManifestInputSchema.parse({
        sessionId: "session-1",
        sourceManifest: {
          ...manifest,
          cloudSync: {
            enabled: true,
            provider: "s3",
            objectKey: "private/sources/source-1/source.txt"
          }
        }
      })
    ).toThrow();

    expect(() =>
      setSourceManifestInputSchema.parse({
        sessionId: "session-1",
        sourceManifest: {
          sourceId: "source-manga",
          sourceKind: "manga_import",
          contentHash: "b".repeat(64),
          segmentationVersion: 1,
          pageCount: 2,
          cloudSync: {
            enabled: true,
            provider: "r2",
            manifestObjectKey: "private/sources/source-manga/manifest.json",
            pages: [
              {
                index: 0,
                objectKey: "private/sources/source-manga/pages/0.png",
                contentHash: "c".repeat(64)
              }
            ]
          }
        }
      })
    ).toThrow();
  });

  it("rejects source text, image data, and unknown manifest fields", () => {
    for (const forbidden of [
      { sourceText: "整本小说" },
      { currentText: "当前段落" },
      { selectedText: "选中文本" },
      { includedText: "补课原文" },
      { prompt: "提示词" },
      { fullChat: "完整聊天" },
      { deepAnalysisBody: "deep_analysis 正文" },
      { imageData: "data:image/png;base64,abc" }
    ]) {
      expect(() =>
        setSourceManifestInputSchema.parse({
          sessionId: "session-1",
          sourceManifest: { ...manifest, ...forbidden }
        })
      ).toThrow();
    }
  });
});

describe("cloud source metadata tool schemas", () => {
  it("accepts strict metadata-only status and delete inputs", () => {
    expect(
      getCloudSourceStatusInputSchema.parse({ sessionId: "session-1" })
    ).toEqual({ sessionId: "session-1" });
    expect(deleteCloudSourceInputSchema.parse({ sessionId: "session-1" })).toEqual({
      sessionId: "session-1"
    });
  });

  it("rejects source text and URL fields from metadata-only cloud inputs", () => {
    for (const schema of [getCloudSourceStatusInputSchema, deleteCloudSourceInputSchema]) {
      expect(() =>
        schema.parse({
          sessionId: "session-1",
          sourceText: "整本小说",
          publicUrl: "https://example.test/source.txt",
          signedUrl: "https://example.test/signed"
        })
      ).toThrow();
    }
  });
});

describe("cloud source upload tool schema", () => {
  it("accepts app bridge novel upload input", () => {
    expect(
      uploadCloudSourceInputSchema.parse({
        sessionId: "session-1",
        sourceKind: "pasted_text",
        title: "Bridge novel",
        sourceText: "第一段"
      })
    ).toMatchObject({
      sessionId: "session-1",
      sourceKind: "pasted_text",
      sourceText: "第一段"
    });
  });

  it("accepts app bridge manga upload input", () => {
    expect(
      uploadCloudSourceInputSchema.parse({
        sessionId: "session-1",
        sourceKind: "manga_import",
        pages: [{ index: 1, bytesBase64: "AQID", mimeType: "image/png" }]
      })
    ).toMatchObject({
      sessionId: "session-1",
      sourceKind: "manga_import",
      pages: [{ index: 1, bytesBase64: "AQID", mimeType: "image/png" }]
    });
  });

  it("rejects unknown fields in app bridge upload input", () => {
    expect(() =>
      uploadCloudSourceInputSchema.parse({
        sessionId: "session-1",
        sourceKind: "pasted_text",
        sourceText: "第一段",
        objectKey: "private/sources/source-1/source.txt",
        publicUrl: "https://example.test/source.txt"
      })
    ).toThrow();
  });
});

describe("companion comment schemas", () => {
  const base = {
    sessionId: "session-1",
    position: { kind: "paragraph" as const, index: 12, label: "第 12 段" },
    mode: "light_chat" as const,
    length: "normal" as const,
    text: "秦知这句不像试探，像终于忍不住摊牌。",
    source: "quick_action" as const,
    operationId: "comment-op-1"
  };

  it("requires operationId and rejects unknown fields", () => {
    expect(publishCompanionCommentInputSchema.parse(base).operationId).toBe("comment-op-1");
    const { operationId: _operationId, ...withoutOperationId } = base;
    expect(() => publishCompanionCommentInputSchema.parse(withoutOperationId)).toThrow();
    expect(() =>
      publishCompanionCommentInputSchema.parse({ ...base, currentText: "不应保存" })
    ).toThrow();
  });

  it("enforces short-comment limits and blocks deep-analysis bodies", () => {
    expect(() =>
      publishCompanionCommentInputSchema.parse({ ...base, text: "长".repeat(501) })
    ).toThrow();
    expect(() =>
      publishCompanionCommentInputSchema.parse({
        ...base,
        source: "live_reading",
        text: "弹".repeat(201)
      })
    ).toThrow();
    expect(() =>
      publishCompanionCommentInputSchema.parse({
        ...base,
        mode: "deep_analysis",
        length: "long",
        text: "这里是一篇完整长评。"
      })
    ).toThrow();
    expect(
      publishCompanionCommentInputSchema.parse({
        ...base,
        mode: "deep_analysis",
        length: "short",
        text: "已生成长评，可回聊天区查看。"
      }).text
    ).toBe("已生成长评，可回聊天区查看。");
  });

  it("accepts manual-save companion comments", () => {
    expect(
      publishCompanionCommentInputSchema.parse({
        ...base,
        source: "manual_save"
      }).source
    ).toBe("manual_save");
  });

  it("accepts strict list and clear contracts", () => {
    expect(
      listCompanionCommentsInputSchema.parse({
        sessionId: "session-1",
        scope: "history",
        positionIndex: 12,
        limit: 50,
        cursor: "cursor-1"
      }).limit
    ).toBe(50);
    expect(
      clearCompanionCommentsInputSchema.parse({
        sessionId: "session-1",
        scope: "all"
      }).scope
    ).toBe("all");
    expect(() =>
      clearCompanionCommentsInputSchema.parse({
        sessionId: "session-1",
        scope: "all",
        deleteSource: true
      })
    ).toThrow();
  });
});

describe("book management schema contracts", () => {
  it("accepts strict rename, status, and delete inputs", () => {
    expect(
      renameReadingSessionInputSchema.parse({
        sessionId: "session-1",
        title: "新书名"
      }).title
    ).toBe("新书名");
    expect(
      setReadingSessionStatusInputSchema.parse({
        sessionId: "session-1",
        status: "active"
      }).status
    ).toBe("active");
    expect(
      deleteReadingSessionInputSchema.parse({
        sessionId: "session-1",
        operationId: "delete-op-1",
        deleteCloudSource: true
      })
    ).toEqual({
      sessionId: "session-1",
      operationId: "delete-op-1",
      deleteCloudSource: true
    });
    expect(
      deleteReadingSessionInputSchema.parse({
        sessionId: "session-1",
        operationId: "delete-op-2"
      }).operationId
    ).toBe("delete-op-2");
    expect(() =>
      deleteReadingSessionInputSchema.parse({
        sessionId: "session-1",
        operationId: "delete-op-1",
        deleteLocalCache: true
      })
    ).toThrow();
    for (const forbidden of [
      { extra: true },
      { sourceText: "整本小说" },
      { imageData: "data:image/png;base64,AQID" },
      { publicUrl: "https://example.test/source.txt" },
      { signedUrl: "https://example.test/signed" }
    ]) {
      expect(() =>
        deleteReadingSessionInputSchema.parse({
          sessionId: "session-1",
          operationId: "delete-op-1",
          ...forbidden
        })
      ).toThrow();
    }
  });
});
