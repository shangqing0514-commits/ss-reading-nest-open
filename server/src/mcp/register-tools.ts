import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import {
  completeReadingSessionInputSchema,
  clearCompanionCommentsInputSchema,
  confirmAssistantSyncedPositionInputSchema,
  finishTodayReadingInputSchema,
  generateDiaryContextInputSchema,
  getCloudSourceStatusInputSchema,
  openReadingNestInputSchema,
  listCompanionCommentsInputSchema,
  publishCompanionCommentInputSchema,
  renameReadingSessionInputSchema,
  saveBookmarkInputSchema,
  saveQuoteInputSchema,
  saveReactionInputSchema,
  sendCurrentContextInputSchema,
  setLiveReadingModeInputSchema,
  setReadingSessionStatusInputSchema,
  setSourceManifestInputSchema,
  startReadingSessionInputSchema,
  deleteReadingSessionInputSchema,
  deleteCloudSourceInputSchema,
  uploadCloudSourceInputSchema,
  updateSessionPreferencesInputSchema,
  updateReadingPositionInputSchema
} from "@ss/shared";
import type { ReadingSession, SendCurrentContextInput, SourceManifest } from "@ss/shared";
import { ReadingService } from "../services/reading-service.js";
import type { CloudSourceService } from "../services/cloud-source-service.js";
import { toolResult } from "./tool-result.js";

export const READING_NEST_URI = "ui://ss-reading-nest/app-v14.html";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
const mutation = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false
};

export const TOOL_CONFIGS = {
  open_reading_nest: {
    title: "打开 S×S 小窝共读",
    description: "Use this when the user wants to open the reading nest or continue recent reading.",
    inputSchema: openReadingNestInputSchema,
    annotations: readOnly,
    _meta: {
      ui: { resourceUri: READING_NEST_URI },
      "openai/outputTemplate": READING_NEST_URI,
      "openai/toolInvocation/invoking": "正在点亮小窝…",
      "openai/toolInvocation/invoked": "小窝已经准备好"
    }
  },
  start_reading_session: {
    title: "开始共读",
    description: "Use this when the user starts reading a new novel or manga work.",
    inputSchema: startReadingSessionInputSchema,
    annotations: mutation
  },
  update_reading_position: {
    title: "更新阅读进度",
    description: "Use this when the current paragraph or manga page changes.",
    inputSchema: updateReadingPositionInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  confirm_assistant_synced_position: {
    title: "确认烁构已读位置",
    description:
      "Use this only after the user explicitly confirms that ChatGPT replied it has read through a batch end.",
    inputSchema: confirmAssistantSyncedPositionInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  set_live_reading_mode: {
    title: "设置实时陪读模式",
    description: "Use this when the user enables or disables lightweight live reading.",
    inputSchema: setLiveReadingModeInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  set_source_manifest: {
    title: "确认本设备阅读来源",
    description:
      "Use this when the app has computed source hash metadata for the current novel or manga. Never send source text or image bytes.",
    inputSchema: setSourceManifestInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  get_cloud_source_status: {
    title: "检查私人云端正文状态",
    description:
      "Use this to check whether a reading source exists in private cloud storage. Returns metadata only.",
    inputSchema: getCloudSourceStatusInputSchema,
    annotations: readOnly
  },
  upload_cloud_source: {
    title: "Upload private cloud source",
    description:
      "App-only bridge tool for uploading user-provided source bytes to private R2. Returns metadata only and never returns source text or image bytes.",
    inputSchema: uploadCloudSourceInputSchema,
    annotations: { ...mutation, idempotentHint: true },
    _meta: {
      ui: { visibility: ["app"] }
    }
  },
  delete_cloud_source: {
    title: "删除私人云端正文副本",
    description:
      "Use this only after the user confirms deleting the private cloud source copy. Returns metadata only.",
    inputSchema: deleteCloudSourceInputSchema,
    annotations: {
      ...mutation,
      destructiveHint: true,
      idempotentHint: true
    }
  },
  update_session_preferences: {
    title: "更新陪读偏好",
    description:
      "Use this when the user changes how ChatGPT should comment for this reading session.",
    inputSchema: updateSessionPreferencesInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  publish_companion_comment: {
    title: "发布烁构陪读短评",
    description:
      "Use this before replying with a lightweight reading comment so the same short text appears in the reading Dock.",
    inputSchema: publishCompanionCommentInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  list_companion_comments: {
    title: "读取烁构陪读短评",
    description:
      "Use this when the reading widget needs recent or paged historical companion comments for one session.",
    inputSchema: listCompanionCommentsInputSchema,
    annotations: readOnly
  },
  clear_companion_comments: {
    title: "清除烁构陪读短评",
    description:
      "Use this when the user explicitly clears recent, historical, or all companion comments for one session.",
    inputSchema: clearCompanionCommentsInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  rename_reading_session: {
    title: "重命名书籍",
    description: "Use this when the user explicitly changes one reading session title.",
    inputSchema: renameReadingSessionInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  set_reading_session_status: {
    title: "更新作品状态",
    description: "Use this when the user explicitly marks a work completed or active again.",
    inputSchema: setReadingSessionStatusInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  delete_reading_session: {
    title: "删除书籍阅读数据",
    description: "Use this only after the user confirms deleting one session's structured data.",
    inputSchema: deleteReadingSessionInputSchema,
    annotations: {
      ...mutation,
      destructiveHint: true,
      idempotentHint: true
    }
  },
  send_current_context: {
    title: "同步当前阅读内容",
    description:
      "Use this when the user explicitly asks ChatGPT to look at the current paragraph or current manga page.",
    inputSchema: sendCurrentContextInputSchema,
    annotations: readOnly,
    _meta: {
      "openai/fileParams": ["currentPageImage"]
    }
  },
  save_quote: {
    title: "保存摘录",
    description: "Use this when the user explicitly saves a selected sentence or manga page description.",
    inputSchema: saveQuoteInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  save_reaction: {
    title: "保存吐槽",
    description: "Use this when the user saves their reaction to the current reading position.",
    inputSchema: saveReactionInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  save_bookmark: {
    title: "保存书签",
    description: "Use this when the user wants to remember the current reading position.",
    inputSchema: saveBookmarkInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  finish_today_reading: {
    title: "今天看到这里",
    description: "Use this when the user stops for today but has not completed the whole work.",
    inputSchema: finishTodayReadingInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  complete_reading_session: {
    title: "完成这部作品",
    description: "Use this only when the user explicitly says they finished the whole work.",
    inputSchema: completeReadingSessionInputSchema,
    annotations: { ...mutation, idempotentHint: true }
  },
  generate_diary_context: {
    title: "生成小窝日记素材",
    description: "Use this when the user wants ChatGPT to write today's copyable reading diary.",
    inputSchema: generateDiaryContextInputSchema,
    annotations: readOnly
  }
} as const;

export function registerReadingTools(
  server: McpServer,
  service: ReadingService,
  cloudSourceService?: CloudSourceService,
  options: { sourceEndpointBase?: string } = {}
) {
  registerAppTool(server, "open_reading_nest", TOOL_CONFIGS.open_reading_nest, async () => {
    const sessions = await service.listAllSessions();
    const bookshelfSessions = await Promise.all(
      sessions.map(async (session) => ({
        ...(await service.getSessionBundle(session.id)),
        cacheState: "unknown" as const
      }))
    );
    return toolResult(
      {
        bookshelfSessions,
        recentSessions: bookshelfSessions.slice(0, 10),
        ...(options.sourceEndpointBase ? { sourceEndpointBase: options.sourceEndpointBase } : {})
      },
      "已打开 S×S 小窝共读。"
    );
  });

  server.registerTool(
    "start_reading_session",
    TOOL_CONFIGS.start_reading_session,
    async ({ title, type }) => {
      const session = await service.startSession(title, type);
      return toolResult({ session }, `已开始共读《${session.title}》。`);
    }
  );

  server.registerTool(
    "update_reading_position",
    TOOL_CONFIGS.update_reading_position,
    async ({ sessionId, userCurrentPosition }) => {
      const session = await service.updateUserPosition(sessionId, userCurrentPosition);
      return toolResult(
        {
          sessionId,
          userCurrentPosition: session.userCurrentPosition,
          assistantSyncedPosition: session.assistantSyncedPosition,
          updatedAt: session.updatedAt
        },
        `用户进度已更新到${userCurrentPosition.label}。`
      );
    }
  );

  server.registerTool(
    "confirm_assistant_synced_position",
    TOOL_CONFIGS.confirm_assistant_synced_position,
    async (input) => {
      const session = await service.confirmAssistantPosition(input);
      return toolResult(
        {
          sessionId: session.id,
          assistantSyncedPosition: session.assistantSyncedPosition,
          confirmedBatchId: input.batchId,
          updatedAt: session.updatedAt
        },
        `已由用户确认烁构读到${input.confirmedPosition.label}。`
      );
    }
  );

  server.registerTool(
    "set_live_reading_mode",
    TOOL_CONFIGS.set_live_reading_mode,
    async ({ sessionId, enabled }) => {
      const session = await service.setLiveReadingMode(sessionId, enabled);
      return toolResult(
        {
          sessionId,
          liveReadingEnabled: session.liveReadingEnabled,
          updatedAt: session.updatedAt
        },
        enabled ? "实时陪读模式已开启。" : "实时陪读模式已关闭。"
      );
    }
  );

  server.registerTool(
    "set_source_manifest",
    TOOL_CONFIGS.set_source_manifest,
    async ({ sessionId, sourceManifest }) => {
      const session = await service.setSourceManifest(sessionId, sourceManifest);
      return toolResult(
        {
          sessionId,
          sourceManifest: session.sourceManifest,
          updatedAt: session.updatedAt
        },
        "本设备阅读来源已校验并保存。"
      );
    }
  );

  server.registerTool(
    "get_cloud_source_status",
    TOOL_CONFIGS.get_cloud_source_status,
    async ({ sessionId }) => {
      if (!cloudSourceService) {
        return toolResult({ status: "disabled" as const }, "私人云端正文服务尚未启用。");
      }
      const result = await cloudSourceService.getCloudSourceStatus(sessionId);
      return toolResult(result, "已检查这本书的私人云端正文状态。");
    }
  );

  registerAppTool(server, "upload_cloud_source", TOOL_CONFIGS.upload_cloud_source, async (input) => {
    if (!cloudSourceService) {
      return toolResult({ uploaded: false }, "ç§äººäº‘ç«¯æ­£æ–‡æœåŠ¡å°šæœªå¯ç”¨ã€‚");
    }
    const result =
      input.sourceKind === "manga_import"
        ? await cloudSourceService.uploadMangaSource({
            sessionId: input.sessionId,
            ...(input.title ? { title: input.title } : {}),
            pages: input.pages.map((page) => ({
              index: page.index,
              bytes: base64ToBytes(page.bytesBase64),
              mimeType: page.mimeType,
              ...(page.fileName ? { fileName: page.fileName } : {})
            }))
          })
        : await cloudSourceService.uploadNovelSource({
            sessionId: input.sessionId,
            sourceKind: input.sourceKind,
            ...(input.title ? { title: input.title } : {}),
            sourceText: input.sourceText
          });
    const response = toolResult(
      {
        uploaded: true,
        sessionId: input.sessionId,
        ...summarizeCloudSourceManifest(result.sourceManifest)
      },
      "ç§äººäº‘ç«¯æ­£æ–‡å·²ä¸Šä¼ ã€‚"
    );
    return {
      ...response,
      _meta: { sourceManifest: result.sourceManifest }
    };
  });

  server.registerTool(
    "delete_cloud_source",
    TOOL_CONFIGS.delete_cloud_source,
    async ({ sessionId }) => {
      if (!cloudSourceService) {
        return toolResult({ deleted: false }, "私人云端正文服务尚未启用。");
      }
      const result = await cloudSourceService.deleteCloudSource(sessionId);
      return toolResult(result, result.deleted ? "私人云端正文副本已删除。" : "没有可删除的私人云端正文副本。");
    }
  );

  server.registerTool(
    "update_session_preferences",
    TOOL_CONFIGS.update_session_preferences,
    async ({ sessionId, preferences }) => {
      const session = await service.updateSessionPreferences(sessionId, preferences);
      return toolResult(
        {
          sessionId,
          sessionPreferences: session.sessionPreferences,
          updatedAt: session.updatedAt
        },
        "本书的陪读偏好已更新。"
      );
    }
  );

  server.registerTool(
    "publish_companion_comment",
    TOOL_CONFIGS.publish_companion_comment,
    async (input) => {
      const comment = await service.publishCompanionComment(input);
      return toolResult(
        { saved: true, comment },
        "陪读短评已同步到这本书的小窝。请在聊天区回复相同短评。"
      );
    }
  );

  server.registerTool(
    "list_companion_comments",
    TOOL_CONFIGS.list_companion_comments,
    async (input) => {
      const result = await service.listCompanionComments(input);
      return toolResult(result, "已读取这本书的烁构陪读短评。");
    }
  );

  server.registerTool(
    "clear_companion_comments",
    TOOL_CONFIGS.clear_companion_comments,
    async ({ sessionId, scope }) => {
      const result = await service.clearCompanionComments(sessionId, scope);
      return toolResult(
        { sessionId, scope, ...result },
        "已按用户选择清除这本书的陪读短评。"
      );
    }
  );

  server.registerTool(
    "rename_reading_session",
    TOOL_CONFIGS.rename_reading_session,
    async ({ sessionId, title }) => {
      const session = await service.renameSession(sessionId, title);
      return toolResult({ session }, `已将作品重命名为《${session.title}》。`);
    }
  );

  server.registerTool(
    "set_reading_session_status",
    TOOL_CONFIGS.set_reading_session_status,
    async ({ sessionId, status }) => {
      const session = await service.setSessionStatus(sessionId, status);
      return toolResult(
        { session },
        status === "completed" ? "已标记为完成。" : "已恢复为阅读中。"
      );
    }
  );

  server.registerTool(
    "delete_reading_session",
    TOOL_CONFIGS.delete_reading_session,
    async ({ sessionId, operationId, deleteCloudSource }) => {
      let cloudResult:
        | {
            cloudSourceDeleted: boolean;
            cloudSourceDeleteError?: string;
          }
        | undefined;
      if (deleteCloudSource && cloudSourceService) {
        const result = await cloudSourceService.deleteCloudSource(sessionId);
        cloudResult = {
          cloudSourceDeleted: result.cloudSourceDeleted,
          ...(result.cloudSourceDeleteError
            ? { cloudSourceDeleteError: result.cloudSourceDeleteError }
            : {})
        };
      }
      const result = await service.deleteSession(sessionId, operationId, {
        deleteCloudSource: false
      });
      const combined = { ...result, ...cloudResult };
      return toolResult(combined, result.deleted ? "这本书的云端阅读数据已删除。" : "这本书已不在书架中。");
    }
  );

  server.registerTool(
    "send_current_context",
    TOOL_CONFIGS.send_current_context,
    async (input) => {
      const { session } = await service.getSessionBundle(input.sessionId);
      const currentPosition = input.currentPosition ?? input.position!;
      const context = buildCurrentReadingContext(session, input);
      return toolResult(
        { context },
        `用户正在共读《${session.title}》，位置是${currentPosition.label}。请根据本次主动同步的内容回应。`
      );
    }
  );

  server.registerTool("save_quote", TOOL_CONFIGS.save_quote, async (input) => {
    const quote = await service.saveQuote(input);
    return toolResult({ saved: true, quote }, "摘录已经放进小窝。");
  });

  server.registerTool("save_reaction", TOOL_CONFIGS.save_reaction, async (input) => {
    const reaction = await service.saveReaction(input);
    return toolResult({ saved: true, reaction }, "吐槽已经记下。");
  });

  server.registerTool("save_bookmark", TOOL_CONFIGS.save_bookmark, async (input) => {
    const bookmark = await service.saveBookmark(input);
    return toolResult({ saved: true, bookmark }, "书签已经夹好。");
  });

  server.registerTool(
    "finish_today_reading",
    TOOL_CONFIGS.finish_today_reading,
    async (input) => {
      const result = await service.finishToday(input);
      return toolResult(
        { ...result, message: `今天看到${input.position.label}，下次继续。` },
        `今天看到${input.position.label}，下次继续。`
      );
    }
  );

  server.registerTool(
    "complete_reading_session",
    TOOL_CONFIGS.complete_reading_session,
    async ({ sessionId, finalPosition }) => {
      const session = await service.completeSession(sessionId, finalPosition);
      return toolResult({ session, message: `《${session.title}》已经标记为完成。` }, "作品已完成。");
    }
  );

  server.registerTool(
    "generate_diary_context",
    TOOL_CONFIGS.generate_diary_context,
    async ({ sessionId }) => {
      const diaryContext = await service.diaryContext(sessionId);
      return toolResult(
        { diaryContext },
        "日记素材已经整理好。请在聊天里把这些素材写成一篇可复制的小窝日记。"
      );
    }
  );
}

function summarizeCloudSourceManifest(sourceManifest: SourceManifest) {
  return {
    sourceId: sourceManifest.sourceId,
    contentHash: sourceManifest.contentHash,
    ...(sourceManifest.paragraphCount !== undefined
      ? { paragraphCount: sourceManifest.paragraphCount }
      : {}),
    ...(sourceManifest.pageCount !== undefined
      ? { pageCount: sourceManifest.pageCount }
      : {}),
    cloudSync: {
      enabled: sourceManifest.cloudSync.enabled,
      provider: sourceManifest.cloudSync.provider,
      ...(sourceManifest.cloudSync.sizeBytes !== undefined
        ? { sizeBytes: sourceManifest.cloudSync.sizeBytes }
        : {}),
      ...(sourceManifest.cloudSync.mimeType
        ? { mimeType: sourceManifest.cloudSync.mimeType }
        : {})
    }
  };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function buildCurrentReadingContext(
  session: ReadingSession,
  input: SendCurrentContextInput
) {
  const currentPosition = input.currentPosition ?? input.position!;
  const syncMode = input.currentPageImage
    ? "image"
    : input.currentText || input.selectedText
      ? "text"
      : "description";
  const liveReading = input.mode === "live_reading";
  return {
    sessionId: session.id,
    title: session.title,
    type: session.type,
    previousSyncedPosition:
      input.previousSyncedPosition ?? session.assistantSyncedPosition,
    currentPosition,
    ...(input.contextRange ? { contextRange: input.contextRange } : {}),
    ...(input.includedText ? { includedText: input.includedText } : {}),
    ...(input.currentText ? { currentText: input.currentText } : {}),
    ...(input.selectedText ? { selectedText: input.selectedText } : {}),
    ...(input.pageDescription ? { pageDescription: input.pageDescription } : {}),
    ...(input.userNote ? { userNote: input.userNote } : {}),
    ...(input.currentPageImage ? { currentPageImage: input.currentPageImage } : {}),
    ...(input.sourceContext ? { sourceContext: input.sourceContext } : {}),
    mode: input.mode,
    readingCommentMode: liveReading
      ? "reaction_only"
      : input.readingCommentMode ?? session.sessionPreferences.readingCommentMode,
    commentLength: liveReading
      ? "short"
      : input.commentLength ?? session.sessionPreferences.commentLength,
    ...(input.batch ? { batch: input.batch } : {}),
    syncMode
  };
}
