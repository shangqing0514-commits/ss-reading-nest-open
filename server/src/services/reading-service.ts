import { randomUUID } from "node:crypto";
import {
  DEFAULT_SESSION_PREFERENCES,
  MAX_HISTORY_COMPANION_COMMENTS,
  MAX_RECENT_COMPANION_COMMENTS
} from "@ss/shared";
import type {
  Bookmark,
  CommentLength,
  CompanionComment,
  CompanionCommentSource,
  Quote,
  Reaction,
  ReadingCommentMode,
  ReadingDatabase,
  ReadingPosition,
  ReadingSession,
  ReadingType,
  SessionBundle,
  SessionPreferences,
  SourceManifest
} from "@ss/shared";
import { AppError } from "../errors/app-error.js";
import type { ReadingRepository } from "../repositories/reading-repository.js";

type Dependencies = {
  now: () => Date;
  id: () => string;
};

type CloudSourceDeletionService = {
  deleteCloudSource(sessionId: string): Promise<{
    deleted: boolean;
    cloudSourceDeleted: boolean;
    cloudSourceDeleteError?: string;
  }>;
};

const defaultDependencies: Dependencies = {
  now: () => new Date(),
  id: () => randomUUID()
};

export class ReadingService {
  constructor(
    private readonly repository: ReadingRepository,
    private readonly deps: Dependencies = defaultDependencies,
    private readonly cloudSourceService?: CloudSourceDeletionService
  ) {}

  async startSession(title: string, type: ReadingType): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const now = this.deps.now().toISOString();
      const session: ReadingSession = {
        id: this.deps.id(),
        title,
        type,
        status: "active",
        userCurrentPosition: {
          kind: type === "novel" ? "paragraph" : "page",
          index: 1,
          label: type === "novel" ? "第 1 段" : "第 1 页"
        },
        assistantSyncedPosition: null,
        liveReadingEnabled: false,
        sessionPreferences: structuredClone(DEFAULT_SESSION_PREFERENCES),
        sourceManifest: null,
        createdAt: now,
        updatedAt: now,
        lastReadAt: now
      };
      database.sessions.push(session);
      return session;
    });
  }

  async listRecent(limit = 10): Promise<ReadingSession[]> {
    const database = await this.repository.read();
    return [...database.sessions]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, Math.min(10, Math.max(5, limit)));
  }

  async listAllSessions(): Promise<ReadingSession[]> {
    const database = await this.repository.read();
    return [...database.sessions].sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      const left = a.lastReadAt || a.updatedAt;
      const right = b.lastReadAt || b.updatedAt;
      return right.localeCompare(left);
    });
  }

  async getSessionBundle(sessionId: string): Promise<SessionBundle> {
    const database = await this.repository.read();
    const session = this.requireSession(database.sessions, sessionId);
    return {
      session,
      quotes: database.quotes.filter((quote) => quote.sessionId === sessionId),
      reactions: database.reactions.filter((reaction) => reaction.sessionId === sessionId),
      bookmarks: database.bookmarks.filter((bookmark) => bookmark.sessionId === sessionId)
    };
  }

  async updateUserPosition(
    sessionId: string,
    userCurrentPosition: ReadingPosition
  ): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, sessionId);
      session.userCurrentPosition = userCurrentPosition;
      session.updatedAt = this.deps.now().toISOString();
      return session;
    });
  }

  async confirmAssistantPosition(input: {
    sessionId: string;
    confirmedPosition: ReadingPosition;
    batchId: string;
    operationId: string;
  }): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, input.sessionId);
      if (session.lastAssistantConfirmation?.operationId === input.operationId) return session;
      if (input.confirmedPosition.kind !== session.userCurrentPosition.kind) {
        throw new AppError("INVALID_OPERATION", "确认位置类型与当前阅读位置不一致。");
      }
      if (input.confirmedPosition.index > session.userCurrentPosition.index) {
        throw new AppError("INVALID_OPERATION", "不能确认烁构读到了用户尚未读到的位置。");
      }
      if (
        session.assistantSyncedPosition &&
        input.confirmedPosition.index < session.assistantSyncedPosition.index
      ) {
        throw new AppError("INVALID_OPERATION", "烁构确认位置不能倒退。");
      }
      const now = this.deps.now().toISOString();
      session.assistantSyncedPosition = input.confirmedPosition;
      session.lastAssistantConfirmation = {
        operationId: input.operationId,
        batchId: input.batchId,
        confirmedAt: now
      };
      session.updatedAt = now;
      return session;
    });
  }

  async setLiveReadingMode(sessionId: string, enabled: boolean): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, sessionId);
      session.liveReadingEnabled = enabled;
      session.updatedAt = this.deps.now().toISOString();
      return session;
    });
  }

  async setSourceManifest(
    sessionId: string,
    sourceManifest: SourceManifest
  ): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, sessionId);
      session.sourceManifest = structuredClone(sourceManifest);
      session.updatedAt = this.deps.now().toISOString();
      return session;
    });
  }

  async updateSessionPreferences(
    sessionId: string,
    patch: Partial<
      Pick<
        SessionPreferences,
        | "readingCommentMode"
        | "commentLength"
        | "liveReadingStyle"
        | "autoSaveCompanionComments"
      >
    >
  ): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, sessionId);
      const nextPreferences = { ...session.sessionPreferences, ...patch };
      if (
        nextPreferences.readingCommentMode ===
          session.sessionPreferences.readingCommentMode &&
        nextPreferences.commentLength === session.sessionPreferences.commentLength &&
        nextPreferences.liveReadingStyle ===
          session.sessionPreferences.liveReadingStyle &&
        nextPreferences.autoSaveCompanionComments ===
          session.sessionPreferences.autoSaveCompanionComments
      ) {
        return session;
      }
      session.sessionPreferences = nextPreferences;
      session.updatedAt = this.deps.now().toISOString();
      return session;
    });
  }

  async publishCompanionComment(input: {
    sessionId: string;
    position: ReadingPosition;
    mode: ReadingCommentMode;
    length: CommentLength;
    text: string;
    source: CompanionCommentSource;
    operationId: string;
  }): Promise<CompanionComment> {
    this.validateCompanionComment(input);
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, input.sessionId);
      const existing = database.companionComments.find(
        (item) =>
          item.sessionId === input.sessionId &&
          item.operationId === input.operationId
      );
      if (existing) return existing;
      const comment: CompanionComment = {
        id: this.deps.id(),
        sessionId: input.sessionId,
        position: structuredClone(input.position),
        mode: input.mode,
        length: input.length,
        text: input.text,
        source: input.source,
        inRecent: true,
        inHistory:
          input.source === "manual_save" ||
          session.sessionPreferences.autoSaveCompanionComments,
        operationId: input.operationId,
        createdAt: this.deps.now().toISOString()
      };
      database.companionComments.push(comment);
      this.pruneCompanionComments(database, input.sessionId, "recent");
      if (comment.inHistory) {
        this.pruneCompanionComments(database, input.sessionId, "history");
      }
      this.removeUnusedCompanionComments(database);
      return comment;
    });
  }

  async clearCompanionComments(
    sessionId: string,
    scope: "recent" | "history" | "all"
  ): Promise<{ affected: number }> {
    return this.repository.mutate((database) => {
      this.requireSession(database.sessions, sessionId);
      let affected = 0;
      for (const comment of database.companionComments) {
        if (comment.sessionId !== sessionId) continue;
        const changesRecent =
          (scope === "recent" || scope === "all") && comment.inRecent;
        const changesHistory =
          (scope === "history" || scope === "all") && comment.inHistory;
        if (changesRecent || changesHistory) affected += 1;
        if (scope === "recent" || scope === "all") comment.inRecent = false;
        if (scope === "history" || scope === "all") comment.inHistory = false;
      }
      this.removeUnusedCompanionComments(database);
      return { affected };
    });
  }

  async listCompanionComments(input: {
    sessionId: string;
    scope: "recent" | "history";
    positionIndex?: number;
    limit?: number;
    cursor?: string;
  }): Promise<{ comments: CompanionComment[]; nextCursor?: string }> {
    const database = await this.repository.read();
    this.requireSession(database.sessions, input.sessionId);
    const offset = this.parseCommentCursor(input.cursor);
    const maximum =
      input.scope === "recent" ? MAX_RECENT_COMPANION_COMMENTS : 100;
    const limit = Math.min(maximum, Math.max(1, input.limit ?? 20));
    const comments = database.companionComments
      .map((comment, index) => ({ comment, index }))
      .filter(
        ({ comment }) =>
          comment.sessionId === input.sessionId &&
          (input.scope === "recent" ? comment.inRecent : comment.inHistory) &&
          (input.positionIndex === undefined ||
            comment.position.index === input.positionIndex)
      )
      .sort(
        (left, right) =>
          right.comment.createdAt.localeCompare(left.comment.createdAt) ||
          right.index - left.index
      )
      .map(({ comment }) => structuredClone(comment));
    const page = comments.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      comments: page,
      ...(nextOffset < comments.length ? { nextCursor: String(nextOffset) } : {})
    };
  }

  async saveQuote(input: {
    sessionId: string;
    content: string;
    position: ReadingPosition;
    note?: string;
    operationId?: string;
  }): Promise<Quote> {
    return this.repository.mutate((database) => {
      this.requireSession(database.sessions, input.sessionId);
      const existing = input.operationId
        ? database.quotes.find((item) => item.operationId === input.operationId)
        : undefined;
      if (existing) return existing;
      const quote: Quote = {
        id: this.deps.id(),
        sessionId: input.sessionId,
        content: input.content,
        position: input.position,
        ...(input.note ? { note: input.note } : {}),
        ...(input.operationId ? { operationId: input.operationId } : {}),
        createdAt: this.deps.now().toISOString()
      };
      database.quotes.push(quote);
      return quote;
    });
  }

  async saveReaction(input: {
    sessionId: string;
    content: string;
    position: ReadingPosition;
    speaker: "user";
    operationId?: string;
  }): Promise<Reaction> {
    return this.repository.mutate((database) => {
      this.requireSession(database.sessions, input.sessionId);
      const existing = input.operationId
        ? database.reactions.find((item) => item.operationId === input.operationId)
        : undefined;
      if (existing) return existing;
      const reaction: Reaction = {
        id: this.deps.id(),
        sessionId: input.sessionId,
        content: input.content,
        position: input.position,
        speaker: "user",
        ...(input.operationId ? { operationId: input.operationId } : {}),
        createdAt: this.deps.now().toISOString()
      };
      database.reactions.push(reaction);
      return reaction;
    });
  }

  async saveBookmark(input: {
    sessionId: string;
    position: ReadingPosition;
    label?: string;
    operationId?: string;
  }): Promise<Bookmark> {
    return this.repository.mutate((database) => {
      this.requireSession(database.sessions, input.sessionId);
      const existing = input.operationId
        ? database.bookmarks.find((item) => item.operationId === input.operationId)
        : undefined;
      if (existing) return existing;
      const bookmark = this.createBookmark(
        input.sessionId,
        input.position,
        input.label,
        input.operationId
      );
      database.bookmarks.push(bookmark);
      return bookmark;
    });
  }

  async finishToday(input: {
    sessionId: string;
    position: ReadingPosition;
    createBookmark?: boolean;
    operationId?: string;
  }): Promise<{ session: ReadingSession; bookmark?: Bookmark }> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, input.sessionId);
      const existingBookmark = input.operationId
        ? database.bookmarks.find((item) => item.operationId === input.operationId)
        : undefined;
      if (existingBookmark) return { session, bookmark: existingBookmark };

      const now = this.deps.now();
      const iso = now.toISOString();
      session.userCurrentPosition = input.position;
      session.updatedAt = iso;
      session.lastReadAt = iso;
      session.status = "active";
      delete session.completedAt;

      let bookmark: Bookmark | undefined;
      if (input.createBookmark !== false) {
        const date = iso.slice(0, 10);
        bookmark = this.createBookmark(
          input.sessionId,
          input.position,
          `今天看到这里 · ${date}`,
          input.operationId
        );
        database.bookmarks.push(bookmark);
      }
      return { session, ...(bookmark ? { bookmark } : {}) };
    });
  }

  async completeSession(
    sessionId: string,
    finalPosition?: ReadingPosition
  ): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, sessionId);
      const now = this.deps.now().toISOString();
      if (finalPosition) session.userCurrentPosition = finalPosition;
      session.status = "completed";
      session.updatedAt = now;
      session.lastReadAt = now;
      session.completedAt = now;
      return session;
    });
  }

  async renameSession(sessionId: string, title: string): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, sessionId);
      session.title = title.trim();
      session.updatedAt = this.deps.now().toISOString();
      return session;
    });
  }

  async setSessionStatus(
    sessionId: string,
    status: "active" | "completed"
  ): Promise<ReadingSession> {
    return this.repository.mutate((database) => {
      const session = this.requireSession(database.sessions, sessionId);
      const now = this.deps.now().toISOString();
      session.status = status;
      session.updatedAt = now;
      if (status === "completed") {
        session.completedAt = session.completedAt ?? now;
      } else {
        delete session.completedAt;
      }
      return session;
    });
  }

  async deleteSession(
    sessionId: string,
    _operationId: string,
    options: { deleteCloudSource?: boolean } = {}
  ): Promise<{
    sessionId: string;
    deleted: boolean;
    cloudSourceDeleted: boolean;
    cloudSourceDeleteError?: string;
  }> {
    let cloudSourceDeleted = false;
    let cloudSourceDeleteError: string | undefined;
    if (options.deleteCloudSource && this.cloudSourceService) {
      try {
        const result = await this.cloudSourceService.deleteCloudSource(sessionId);
        cloudSourceDeleted = result.cloudSourceDeleted;
        cloudSourceDeleteError = result.cloudSourceDeleteError;
      } catch (error) {
        cloudSourceDeleteError = error instanceof Error ? error.message : String(error);
      }
    }
    return this.repository.mutate((database) => {
      const exists = database.sessions.some((session) => session.id === sessionId);
      if (!exists) {
        return {
          sessionId,
          deleted: false,
          cloudSourceDeleted: false,
          ...(cloudSourceDeleteError ? { cloudSourceDeleteError } : {})
        };
      }
      database.sessions = database.sessions.filter((session) => session.id !== sessionId);
      database.quotes = database.quotes.filter((item) => item.sessionId !== sessionId);
      database.reactions = database.reactions.filter((item) => item.sessionId !== sessionId);
      database.bookmarks = database.bookmarks.filter((item) => item.sessionId !== sessionId);
      database.companionComments = database.companionComments.filter(
        (item) => item.sessionId !== sessionId
      );
      return {
        sessionId,
        deleted: true,
        cloudSourceDeleted,
        ...(cloudSourceDeleteError ? { cloudSourceDeleteError } : {})
      };
    });
  }

  async diaryContext(sessionId: string) {
    const bundle = await this.getSessionBundle(sessionId);
    return {
      ...bundle,
      userCurrentPosition: bundle.session.userCurrentPosition,
      assistantSyncedPosition: bundle.session.assistantSyncedPosition,
      summaryHints: [
        `今天读到${bundle.session.userCurrentPosition.label}`,
        "从保存的摘录中选择最有余味的一句",
        "根据用户吐槽概括今天的情绪",
        "用最近书签作为下次共读的开场"
      ]
    };
  }

  private requireSession(sessions: ReadingSession[], sessionId: string): ReadingSession {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new AppError("SESSION_NOT_FOUND", `找不到共读 session：${sessionId}`);
    }
    return session;
  }

  private validateCompanionComment(input: {
    mode: ReadingCommentMode;
    source: CompanionCommentSource;
    text: string;
  }) {
    if (!input.text.trim() || input.text.length > 500) {
      throw new AppError("INVALID_OPERATION", "陪读短评长度必须在 1–500 字符之间。");
    }
    if (input.source === "live_reading" && input.text.length > 200) {
      throw new AppError("INVALID_OPERATION", "实时陪读短评不能超过 200 字符。");
    }
    if (
      input.mode === "deep_analysis" &&
      input.text !== "已生成长评，可回聊天区查看。"
    ) {
      throw new AppError("INVALID_OPERATION", "深度分析正文不能保存为陪读短评。");
    }
  }

  private pruneCompanionComments(
    database: ReadingDatabase,
    sessionId: string,
    scope: "recent" | "history"
  ) {
    const limit =
      scope === "recent"
        ? MAX_RECENT_COMPANION_COMMENTS
        : MAX_HISTORY_COMPANION_COMMENTS;
    const flag = scope === "recent" ? "inRecent" : "inHistory";
    const matching = database.companionComments
      .map((comment, index) => ({ comment, index }))
      .filter(({ comment }) => comment.sessionId === sessionId && comment[flag])
      .sort(
        (left, right) =>
          left.comment.createdAt.localeCompare(right.comment.createdAt) ||
          left.index - right.index
      );
    for (const { comment } of matching.slice(0, Math.max(0, matching.length - limit))) {
      comment[flag] = false;
    }
  }

  private removeUnusedCompanionComments(database: ReadingDatabase) {
    database.companionComments = database.companionComments.filter(
      (comment) => comment.inRecent || comment.inHistory
    );
  }

  private parseCommentCursor(cursor: string | undefined) {
    if (cursor === undefined) return 0;
    if (!/^\d+$/.test(cursor)) {
      throw new AppError("INVALID_OPERATION", "陪读短评分页位置无效。");
    }
    return Number(cursor);
  }

  private createBookmark(
    sessionId: string,
    position: ReadingPosition,
    label?: string,
    operationId?: string
  ): Bookmark {
    return {
      id: this.deps.id(),
      sessionId,
      position,
      ...(label ? { label } : {}),
      ...(operationId ? { operationId } : {}),
      createdAt: this.deps.now().toISOString()
    };
  }
}
