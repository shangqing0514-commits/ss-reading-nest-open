import { z } from "zod";

export const readingTypeSchema = z.enum(["novel", "manga"]);
export const readingSyncModeSchema = z.enum([
  "current_only",
  "range_sync",
  "recent_only",
  "live_reading",
  "selected_text"
]);
export const readingCommentModeSchema = z.enum([
  "light_chat",
  "reaction_only",
  "cp_talk",
  "plot_guess",
  "deep_analysis",
  "diary_summary"
]);
export const commentLengthSchema = z.enum(["short", "normal", "long"]);
export const liveReadingStyleSchema = z.literal("danmaku");
export const sourceKindSchema = z.enum(["pasted_text", "file_import", "manga_import"]);
export const sourceAvailabilitySchema = z.enum([
  "available_local",
  "available_cloud",
  "restoring_from_cloud",
  "cloud_missing",
  "cloud_restore_failed",
  "local_only_missing",
  "mismatch",
  "segmentation_mismatch",
  "unknown"
]);
export const companionCommentSourceSchema = z.enum([
  "live_reading",
  "quick_action",
  "catch_up_completion",
  "current_context",
  "manual_save"
]);
export const readingPositionSchema = z.object({
  kind: z.enum(["paragraph", "page"]),
  index: z.number().int().min(1),
  total: z.number().int().min(1).optional(),
  label: z.string().min(1).max(100)
});

export const fileReferenceSchema = z
  .object({
    file_id: z.string().min(1),
    download_url: z.url(),
    mime_type: z.string().min(1).optional(),
    file_name: z.string().min(1).optional()
  })
  .strict();

export const cloudSourcePageSchema = z
  .object({
    index: z.number().int().min(1),
    objectKey: z.string().min(1).max(500),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().min(0).optional(),
    mimeType: z.string().min(1).max(100).optional()
  })
  .strict();

export const cloudSyncMetadataSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.literal("r2"),
    objectKey: z.string().min(1).max(500).optional(),
    manifestObjectKey: z.string().min(1).max(500).optional(),
    uploadedAt: z.string().datetime().optional(),
    sizeBytes: z.number().int().min(0).optional(),
    mimeType: z.string().min(1).max(100).optional(),
    pages: z.array(cloudSourcePageSchema).optional()
  })
  .strict();

export const sourceManifestSchema = z
  .object({
    sourceId: z.string().min(1).max(200),
    sourceKind: sourceKindSchema,
    title: z.string().trim().min(1).max(200).optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    segmentationVersion: z.number().int().min(1),
    paragraphCount: z.number().int().min(1).optional(),
    pageCount: z.number().int().min(1).optional(),
    cloudSync: cloudSyncMetadataSchema,
    createdOnDeviceId: z.string().min(1).max(200).optional(),
    lastVerifiedAt: z.string().datetime().optional()
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.cloudSync.enabled) return;
    if (input.sourceKind === "manga_import") {
      if (!input.cloudSync.pages || input.cloudSync.pages.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["cloudSync", "pages"],
          message: "Enabled manga cloud sync requires page objects"
        });
      }
      return;
    }
    if (!input.cloudSync.objectKey) {
      context.addIssue({
        code: "custom",
        path: ["cloudSync", "objectKey"],
        message: "Enabled novel cloud sync requires objectKey"
      });
    }
  });

export const sourceContextSchema = z
  .object({
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    segmentationVersion: z.number().int().min(1),
    paragraphCount: z.number().int().min(1).optional(),
    pageCount: z.number().int().min(1).optional()
  })
  .strict();

export const openReadingNestInputSchema = z.object({}).strict();
export const startReadingSessionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: readingTypeSchema
});
export const sessionIdSchema = z.string().min(1);
export const updateReadingPositionInputSchema = z.object({
  sessionId: sessionIdSchema,
  userCurrentPosition: readingPositionSchema
});
export const sendCurrentContextInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    currentPosition: readingPositionSchema.optional(),
    position: readingPositionSchema.optional(),
    previousSyncedPosition: readingPositionSchema.nullable().optional(),
    contextRange: z
      .object({
        start: z.number().int().min(1),
        end: z.number().int().min(1)
      })
      .optional(),
    includedText: z.string().max(20_000).optional(),
    currentText: z.string().max(20_000).optional(),
    selectedText: z.string().max(10_000).optional(),
    pageDescription: z.string().max(4_000).optional(),
    userNote: z.string().max(4_000).optional(),
    currentPageImage: fileReferenceSchema.optional(),
    mode: readingSyncModeSchema,
    readingCommentMode: readingCommentModeSchema.optional(),
    commentLength: commentLengthSchema.optional(),
    sourceContext: sourceContextSchema.optional(),
    batch: z
      .object({
        id: z.string().min(1).max(200),
        ordinal: z.number().int().min(1),
        total: z.number().int().min(1),
        rangeStart: z.number().int().min(1),
        rangeEnd: z.number().int().min(1),
        hasMore: z.boolean()
      })
      .optional()
  })
  .strict()
  .refine((input) => input.currentPosition || input.position, {
    message: "currentPosition is required"
  });
export const confirmAssistantSyncedPositionInputSchema = z.object({
  sessionId: sessionIdSchema,
  confirmedPosition: readingPositionSchema,
  batchId: z.string().min(1).max(200),
  operationId: z.string().min(1).max(200)
});
export const setLiveReadingModeInputSchema = z.object({
  sessionId: sessionIdSchema,
  enabled: z.boolean()
});
export const updateSessionPreferencesInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    preferences: z
      .object({
        readingCommentMode: readingCommentModeSchema.optional(),
        commentLength: commentLengthSchema.optional(),
        liveReadingStyle: liveReadingStyleSchema.optional(),
        autoSaveCompanionComments: z.boolean().optional()
      })
      .strict()
  })
  .strict();
export const setSourceManifestInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    sourceManifest: sourceManifestSchema
  })
  .strict();
export const getCloudSourceStatusInputSchema = z
  .object({
    sessionId: sessionIdSchema
  })
  .strict();
export const uploadCloudSourceInputSchema = z
  .discriminatedUnion("sourceKind", [
    z
      .object({
        sessionId: sessionIdSchema,
        sourceKind: z.enum(["pasted_text", "file_import"]),
        title: z.string().trim().min(1).max(200).optional(),
        sourceText: z.string().min(1)
      })
      .strict(),
    z
      .object({
        sessionId: sessionIdSchema,
        sourceKind: z.literal("manga_import"),
        title: z.string().trim().min(1).max(200).optional(),
        pages: z
          .array(
            z
              .object({
                index: z.number().int().min(1),
                bytesBase64: z.string().min(1),
                mimeType: z.string().min(1).max(100),
                fileName: z.string().min(1).max(300).optional()
              })
              .strict()
          )
          .min(1)
      })
      .strict()
  ]);
export const deleteCloudSourceInputSchema = z
  .object({
    sessionId: sessionIdSchema
  })
  .strict();
export const publishCompanionCommentInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    position: readingPositionSchema,
    mode: readingCommentModeSchema,
    length: commentLengthSchema,
    text: z.string().trim().min(1).max(500),
    source: companionCommentSourceSchema,
    operationId: z.string().min(1).max(200)
  })
  .strict()
  .superRefine((input, context) => {
    if (input.source === "live_reading" && input.text.length > 200) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Live reading comments must not exceed 200 characters"
      });
    }
    if (
      input.mode === "deep_analysis" &&
      input.text !== "已生成长评，可回聊天区查看。"
    ) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Deep analysis bodies cannot be stored as companion comments"
      });
    }
  });
export const listCompanionCommentsInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    scope: z.enum(["recent", "history"]),
    positionIndex: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(500).optional()
  })
  .strict();
export const clearCompanionCommentsInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    scope: z.enum(["recent", "history", "all"])
  })
  .strict();
export const renameReadingSessionInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    title: z.string().trim().min(1).max(200)
  })
  .strict();
export const setReadingSessionStatusInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    status: z.enum(["active", "completed"])
  })
  .strict();
export const deleteReadingSessionInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    operationId: z.string().min(1).max(200),
    deleteCloudSource: z.boolean().optional()
  })
  .strict();
export const saveQuoteInputSchema = z.object({
  sessionId: sessionIdSchema,
  content: z.string().trim().min(1).max(20_000),
  position: readingPositionSchema,
  note: z.string().trim().max(4_000).optional(),
  operationId: z.string().min(1).max(200).optional()
});
export const saveReactionInputSchema = z.object({
  sessionId: sessionIdSchema,
  content: z.string().trim().min(1).max(4_000),
  position: readingPositionSchema,
  speaker: z.literal("user"),
  operationId: z.string().min(1).max(200).optional()
});
export const saveBookmarkInputSchema = z.object({
  sessionId: sessionIdSchema,
  position: readingPositionSchema,
  label: z.string().trim().max(200).optional(),
  operationId: z.string().min(1).max(200).optional()
});
export const finishTodayReadingInputSchema = z.object({
  sessionId: sessionIdSchema,
  position: readingPositionSchema,
  createBookmark: z.boolean().optional().default(true),
  operationId: z.string().min(1).max(200).optional()
});
export const completeReadingSessionInputSchema = z.object({
  sessionId: sessionIdSchema,
  finalPosition: readingPositionSchema.optional()
});
export const generateDiaryContextInputSchema = z.object({
  sessionId: sessionIdSchema
});

export type SendCurrentContextInput = z.infer<typeof sendCurrentContextInputSchema>;
export type UploadCloudSourceInput = z.infer<typeof uploadCloudSourceInputSchema>;
