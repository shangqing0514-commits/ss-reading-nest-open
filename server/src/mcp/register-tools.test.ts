import { describe, expect, it } from "vitest";
import {
  buildCurrentReadingContext,
  READING_NEST_URI,
  registerReadingTools,
  TOOL_CONFIGS
} from "./register-tools.js";

describe("tool descriptors", () => {
  it("binds the UI resource only to the primary render tool", () => {
    expect(TOOL_CONFIGS.open_reading_nest._meta?.ui).toEqual({
      resourceUri: READING_NEST_URI
    });
    for (const [name, config] of Object.entries(TOOL_CONFIGS)) {
      if (name !== "open_reading_nest" && name !== "upload_cloud_source") {
        const meta = "_meta" in config ? (config._meta as Record<string, unknown>) : undefined;
        expect(meta?.ui).toBeUndefined();
      }
    }
    expect(TOOL_CONFIGS.upload_cloud_source._meta.ui).toEqual({
      visibility: ["app"]
    });
  });

  it("returns the component-only source endpoint for the rendered widget", async () => {
    const handlers = new Map<string, () => Promise<unknown>>();
    const server = {
      registerTool: (name: string, _config: unknown, handler: () => Promise<unknown>) => {
        handlers.set(name, handler);
      }
    };
    const service = {
      listAllSessions: async () => [
        {
          id: "session-1",
          title: "云端书",
          type: "novel",
          status: "active",
          userCurrentPosition: { kind: "paragraph", index: 1, label: "第 1 段" },
          assistantSyncedPosition: null,
          liveReadingEnabled: false,
          sessionPreferences: {},
          sourceManifest: null,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
          lastReadAt: "2026-06-24T00:00:00.000Z"
        }
      ],
      getSessionBundle: async () => ({
        session: {
          id: "session-1",
          title: "云端书",
          type: "novel",
          status: "active",
          userCurrentPosition: { kind: "paragraph", index: 1, label: "第 1 段" },
          assistantSyncedPosition: null,
          liveReadingEnabled: false,
          sessionPreferences: {},
          sourceManifest: null,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
          lastReadAt: "2026-06-24T00:00:00.000Z"
        },
        quotes: [],
        reactions: [],
        bookmarks: []
      })
    };

    registerReadingTools(server as never, service as never, undefined, {
      sourceEndpointBase: "https://worker.example.test/source/secret"
    });
    const result = (await handlers.get("open_reading_nest")?.()) as {
      structuredContent?: Record<string, unknown>;
    };

    expect(result.structuredContent?.sourceEndpointBase).toBe(
      "https://worker.example.test/source/secret"
    );
    expect(JSON.stringify(result)).not.toMatch(/sourceText|bytesBase64|data:image/);
  });

  it("declares the current page as an Apps SDK file param", () => {
    expect(TOOL_CONFIGS.send_current_context._meta?.["openai/fileParams"]).toEqual([
      "currentPageImage"
    ]);
  });

  it("does not expose a model API or ambiguous end session tool", () => {
    expect(Object.keys(TOOL_CONFIGS)).not.toContain("end_reading_session");
    expect(JSON.stringify(TOOL_CONFIGS)).not.toMatch(/OPENAI_API_KEY|responses|chat completions/i);
  });

  it("exposes explicit assistant confirmation and live-reading tools", () => {
    expect(Object.keys(TOOL_CONFIGS)).toContain("confirm_assistant_synced_position");
    expect(Object.keys(TOOL_CONFIGS)).toContain("set_live_reading_mode");
    expect(
      TOOL_CONFIGS.confirm_assistant_synced_position.annotations.idempotentHint
    ).toBe(true);
  });

  it("exposes a metadata-only source manifest mutation tool", () => {
    expect(Object.keys(TOOL_CONFIGS)).toContain("set_source_manifest");
    expect(TOOL_CONFIGS.set_source_manifest.annotations.idempotentHint).toBe(true);
    expect(JSON.stringify(TOOL_CONFIGS.set_source_manifest)).not.toMatch(
      /currentText|selectedText|includedText|imageData|download_url/
    );
  });

  it("exposes an idempotent structured preference update tool", () => {
    expect(Object.keys(TOOL_CONFIGS)).toContain("update_session_preferences");
    expect(TOOL_CONFIGS.update_session_preferences.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true
    });
    expect(JSON.stringify(TOOL_CONFIGS.update_session_preferences)).not.toMatch(
      /currentText|selectedText|includedText|currentPageImage/
    );
  });

  it("fills omitted comment preferences and preserves explicit values and source context", () => {
    const session = {
      id: "session-1",
      title: "偏好书",
      type: "novel" as const,
      status: "active" as const,
      userCurrentPosition: { kind: "paragraph" as const, index: 8, label: "第 8 段" },
      assistantSyncedPosition: null,
      liveReadingEnabled: false,
      sessionPreferences: {
        readingCommentMode: "cp_talk" as const,
        commentLength: "normal" as const,
        allowDeepAnalysisByDefault: false as const,
        liveReadingStyle: "danmaku" as const,
        autoSaveCompanionComments: true
      },
      sourceManifest: null,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
      lastReadAt: "2026-06-22T00:00:00.000Z"
    };
    const sourceContext = {
      contentHash: "a".repeat(64),
      segmentationVersion: 1,
      paragraphCount: 12
    };

    const fallback = buildCurrentReadingContext(session, {
      sessionId: session.id,
      currentPosition: session.userCurrentPosition,
      currentText: "当前段落",
      sourceContext,
      mode: "current_only"
    });
    const explicit = buildCurrentReadingContext(session, {
      sessionId: session.id,
      currentPosition: session.userCurrentPosition,
      currentText: "当前段落",
      mode: "current_only",
      readingCommentMode: "plot_guess",
      commentLength: "short"
    });
    const live = buildCurrentReadingContext(session, {
      sessionId: session.id,
      currentPosition: session.userCurrentPosition,
      includedText: "当前段和前一段",
      mode: "live_reading"
    });

    expect(fallback).toMatchObject({
      readingCommentMode: "cp_talk",
      commentLength: "normal",
      sourceContext
    });
    expect(explicit).toMatchObject({
      readingCommentMode: "plot_guess",
      commentLength: "short"
    });
    expect(live).toMatchObject({
      readingCommentMode: "reaction_only",
      commentLength: "short"
    });
  });

  it("exposes data-only companion comment tools with correct annotations", () => {
    expect(Object.keys(TOOL_CONFIGS)).toEqual(
      expect.arrayContaining([
        "publish_companion_comment",
        "list_companion_comments",
        "clear_companion_comments"
      ])
    );
    expect(TOOL_CONFIGS.publish_companion_comment.annotations.idempotentHint).toBe(true);
    expect(TOOL_CONFIGS.list_companion_comments.annotations.readOnlyHint).toBe(true);
    expect(TOOL_CONFIGS.clear_companion_comments.annotations.readOnlyHint).toBe(false);
    for (const name of [
      "publish_companion_comment",
      "list_companion_comments",
      "clear_companion_comments"
    ] as const) {
      expect("_meta" in TOOL_CONFIGS[name] ? TOOL_CONFIGS[name]._meta : undefined).toBeUndefined();
    }
  });

  it("exposes the three book-management tools and reaches twenty-three tools", () => {
    expect(Object.keys(TOOL_CONFIGS)).toHaveLength(23);
    expect(TOOL_CONFIGS.rename_reading_session.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true
    });
    expect(TOOL_CONFIGS.set_reading_session_status.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true
    });
    expect(TOOL_CONFIGS.delete_reading_session.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true
    });
    expect(
      TOOL_CONFIGS.delete_reading_session.inputSchema.parse({
        sessionId: "session-1",
        operationId: "delete-op-1",
        deleteCloudSource: true
      })
    ).toMatchObject({ deleteCloudSource: true });
    expect(() =>
      TOOL_CONFIGS.delete_reading_session.inputSchema.parse({
        sessionId: "session-1",
        operationId: "delete-op-1",
        deleteLocalCache: true
      })
    ).toThrow();
    expect(JSON.stringify(TOOL_CONFIGS.delete_reading_session)).not.toMatch(
      /sourceText|imageData|data:image|publicUrl|signedUrl/
    );
  });

  it("exposes metadata-only cloud source tools without full-text restore", () => {
    expect(Object.keys(TOOL_CONFIGS)).toEqual(
      expect.arrayContaining(["get_cloud_source_status", "delete_cloud_source"])
    );
    expect(Object.keys(TOOL_CONFIGS)).not.toContain("restore_cloud_source");
    expect(JSON.stringify(TOOL_CONFIGS.get_cloud_source_status)).not.toMatch(
      /sourceText|publicUrl|signedUrl|currentText|includedText/
    );
    expect(JSON.stringify(TOOL_CONFIGS.delete_cloud_source)).not.toMatch(
      /sourceText|publicUrl|signedUrl|currentText|includedText/
    );
  });

  it("uploads cloud source through an app-only tool with metadata-only structured content", async () => {
    const handlers = new Map<string, (args: any) => Promise<any>>();
    const server = {
      registerTool: (name: string, _config: unknown, handler: (args: any) => Promise<any>) => {
        handlers.set(name, handler);
      }
    };
    const service = {
      listAllSessions: async () => [],
      getSessionBundle: async () => ({
        session: {},
        quotes: [],
        reactions: [],
        bookmarks: []
      })
    };
    const sourceManifest = {
      sourceId: "source-1",
      sourceKind: "pasted_text",
      contentHash: "a".repeat(64),
      segmentationVersion: 1,
      paragraphCount: 1,
      cloudSync: {
        enabled: true,
        provider: "r2",
        objectKey: "private/sources/source-1/source.txt",
        manifestObjectKey: "private/sources/source-1/manifest.json",
        sizeBytes: 12,
        mimeType: "text/plain;charset=utf-8"
      }
    };
    const cloudSource = {
      uploadNovelSource: async () => ({ sourceManifest }),
      uploadMangaSource: async () => ({ sourceManifest }),
      getCloudSourceStatus: async () => ({ status: "available" }),
      deleteCloudSource: async () => ({ deleted: true, cloudSourceDeleted: true })
    };

    registerReadingTools(server as never, service as never, cloudSource as never);
    const result = await handlers.get("upload_cloud_source")?.({
      sessionId: "session-1",
      sourceKind: "pasted_text",
      sourceText: "private source text"
    });

    expect(result.structuredContent).toMatchObject({
      uploaded: true,
      sessionId: "session-1",
      sourceId: "source-1",
      contentHash: "a".repeat(64),
      paragraphCount: 1,
      cloudSync: {
        enabled: true,
        provider: "r2",
        sizeBytes: 12,
        mimeType: "text/plain;charset=utf-8"
      }
    });
    expect(JSON.stringify(result.structuredContent)).not.toMatch(/private source text|objectKey|private\/sources/);
    expect(result._meta.sourceManifest.cloudSync.objectKey).toBe("private/sources/source-1/source.txt");
  });
});
