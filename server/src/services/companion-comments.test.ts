import { describe, expect, it } from "vitest";
import type {
  CompanionComment,
  ReadingDatabase,
  ReadingPosition
} from "@ss/shared";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { ReadingService } from "./reading-service.js";

class MemoryRepository implements ReadingRepository {
  database: ReadingDatabase = {
    schemaVersion: 3,
    sessions: [],
    quotes: [],
    reactions: [],
    bookmarks: [],
    companionComments: []
  };

  async read() {
    return structuredClone(this.database);
  }

  async mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>) {
    return change(this.database);
  }
}

function createService() {
  const repository = new MemoryRepository();
  let sequence = 0;
  const service = new ReadingService(repository, {
    now: () => new Date(Date.UTC(2026, 5, 22, 10, 0, sequence)),
    id: () => `id-${++sequence}`
  });
  return { repository, service };
}

const position = (index: number): ReadingPosition => ({
  kind: "paragraph",
  index,
  label: `第 ${index} 段`
});

function commentInput(sessionId: string, operationId: string, index = 1) {
  return {
    sessionId,
    position: position(index),
    mode: "light_chat" as const,
    length: "short" as const,
    text: `第 ${index} 段短评`,
    source: "quick_action" as const,
    operationId
  };
}

async function startSessionWithHistory(service: ReadingService, title = "第一本") {
  const session = await service.startSession(title, "novel");
  await service.updateSessionPreferences(session.id, {
    autoSaveCompanionComments: true
  });
  return session;
}

describe("ReadingService companion comments", () => {
  it("publishes idempotently with default recent and history flags", async () => {
    const { repository, service } = createService();
    const session = await startSessionWithHistory(service);

    const first = await service.publishCompanionComment(
      commentInput(session.id, "comment-op-1")
    );
    const repeated = await service.publishCompanionComment(
      commentInput(session.id, "comment-op-1")
    );

    expect(repeated.id).toBe(first.id);
    expect(first).toMatchObject({ inRecent: true, inHistory: true });
    expect(repository.database.companionComments).toHaveLength(1);
  });

  it("keeps recent but disables history when auto-save is off", async () => {
    const { service } = createService();
    const session = await service.startSession("第一本", "novel");
    await service.updateSessionPreferences(session.id, {
      autoSaveCompanionComments: false
    });

    const comment = await service.publishCompanionComment(
      commentInput(session.id, "comment-op-1")
    );

    expect(comment).toMatchObject({ inRecent: true, inHistory: false });
  });

  it("keeps manually saved comments in recent and history when auto-save is off", async () => {
    const { service } = createService();
    const session = await service.startSession("ç¬¬ä¸€æœ¬", "novel");
    await service.updateSessionPreferences(session.id, {
      autoSaveCompanionComments: false
    });

    const comment = await service.publishCompanionComment({
      ...commentInput(session.id, "manual-save-op-1"),
      source: "manual_save"
    });

    expect(comment).toMatchObject({
      source: "manual_save",
      inRecent: true,
      inHistory: true
    });
  });

  it("limits recent to 20 while preserving older history", async () => {
    const { repository, service } = createService();
    const session = await startSessionWithHistory(service);

    for (let index = 1; index <= 21; index += 1) {
      await service.publishCompanionComment(
        commentInput(session.id, `comment-op-${index}`, index)
      );
    }

    const comments = repository.database.companionComments;
    expect(comments.filter((item) => item.inRecent)).toHaveLength(20);
    expect(comments.filter((item) => item.inHistory)).toHaveLength(21);
    expect(comments.find((item) => item.operationId === "comment-op-1")).toMatchObject({
      inRecent: false,
      inHistory: true
    });
  });

  it("limits history to 500 and only deletes records unused by both scopes", async () => {
    const { repository, service } = createService();
    const session = await startSessionWithHistory(service);

    for (let index = 1; index <= 501; index += 1) {
      await service.publishCompanionComment(
        commentInput(session.id, `comment-op-${index}`, index)
      );
    }

    expect(
      repository.database.companionComments.filter((item) => item.inHistory)
    ).toHaveLength(500);
    expect(
      repository.database.companionComments.filter((item) => item.inRecent)
    ).toHaveLength(20);
    expect(repository.database.companionComments).toHaveLength(500);
    expect(
      repository.database.companionComments.some(
        (item) => item.operationId === "comment-op-1"
      )
    ).toBe(false);
  });

  it("prunes history without deleting an item that remains recent", async () => {
    const { repository, service } = createService();
    const session = await startSessionWithHistory(service);
    repository.database.companionComments.push(
      makeStoredComment({
        sessionId: session.id,
        id: "old-recent",
        operationId: "old-recent-op",
        inRecent: true,
        inHistory: true,
        createdAt: "2020-01-01T00:00:00.000Z"
      })
    );
    for (let index = 1; index <= 500; index += 1) {
      repository.database.companionComments.push(
        makeStoredComment({
          sessionId: session.id,
          id: `history-${index}`,
          operationId: `history-op-${index}`,
          inRecent: false,
          inHistory: true,
          createdAt: `2026-01-01T00:${String(index).padStart(3, "0")}:00.000Z`
        })
      );
    }

    await service.publishCompanionComment(
      commentInput(session.id, "new-comment-op", 502)
    );

    expect(
      repository.database.companionComments.find((item) => item.id === "old-recent")
    ).toMatchObject({ inRecent: true, inHistory: false });
  });

  it("clears recent, history, and all without touching another session or reading data", async () => {
    const { repository, service } = createService();
    const first = await startSessionWithHistory(service);
    const second = await startSessionWithHistory(service, "第二本");
    await service.updateUserPosition(first.id, position(8));
    await service.saveQuote({
      sessionId: first.id,
      content: "摘录",
      position: position(2)
    });
    await service.saveReaction({
      sessionId: first.id,
      content: "反应",
      position: position(3),
      speaker: "user"
    });
    await service.saveBookmark({ sessionId: first.id, position: position(4) });
    await service.publishCompanionComment(commentInput(first.id, "first-op"));
    await service.publishCompanionComment(commentInput(second.id, "second-op"));
    const before = await service.getSessionBundle(first.id);

    await service.clearCompanionComments(first.id, "recent");
    expect(
      repository.database.companionComments.find((item) => item.operationId === "first-op")
    ).toMatchObject({ inRecent: false, inHistory: true });

    await service.clearCompanionComments(first.id, "history");
    expect(
      repository.database.companionComments.some((item) => item.operationId === "first-op")
    ).toBe(false);
    expect(
      repository.database.companionComments.find((item) => item.operationId === "second-op")
    ).toMatchObject({ inRecent: true, inHistory: true });

    await service.clearCompanionComments(second.id, "all");
    expect(repository.database.companionComments).toEqual([]);
    const after = await service.getSessionBundle(first.id);
    expect(after).toEqual(before);
  });

  it("lists only the requested scope with cursor pagination and position filtering", async () => {
    const { service } = createService();
    const first = await startSessionWithHistory(service);
    const second = await startSessionWithHistory(service, "第二本");
    for (let index = 1; index <= 25; index += 1) {
      await service.publishCompanionComment(
        commentInput(first.id, `first-op-${index}`, index % 2 === 0 ? 2 : 1)
      );
    }
    await service.publishCompanionComment(commentInput(second.id, "second-op"));

    const recent = await service.listCompanionComments({
      sessionId: first.id,
      scope: "recent",
      limit: 100
    });
    const firstPage = await service.listCompanionComments({
      sessionId: first.id,
      scope: "history",
      positionIndex: 2,
      limit: 5
    });
    const secondPage = await service.listCompanionComments({
      sessionId: first.id,
      scope: "history",
      positionIndex: 2,
      limit: 5,
      cursor: firstPage.nextCursor
    });

    expect(recent.comments).toHaveLength(20);
    expect(recent.comments.every((item) => item.inRecent)).toBe(true);
    expect(firstPage.comments).toHaveLength(5);
    expect(firstPage.comments.every((item) => item.position.index === 2)).toBe(true);
    expect(secondPage.comments).toHaveLength(5);
    expect(secondPage.comments[0]?.id).not.toBe(firstPage.comments[0]?.id);
    expect([...firstPage.comments, ...secondPage.comments]).not.toContainEqual(
      expect.objectContaining({ sessionId: second.id })
    );
  });

  it("rejects overlong and deep-analysis bodies at the service boundary", async () => {
    const { service } = createService();
    const session = await service.startSession("第一本", "novel");

    await expect(
      service.publishCompanionComment({
        ...commentInput(session.id, "long-op"),
        text: "长".repeat(501)
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
    await expect(
      service.publishCompanionComment({
        ...commentInput(session.id, "live-op"),
        source: "live_reading",
        text: "弹".repeat(201)
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
    await expect(
      service.publishCompanionComment({
        ...commentInput(session.id, "deep-op"),
        mode: "deep_analysis",
        text: "完整四段式长评正文"
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
    await expect(
      service.publishCompanionComment({
        ...commentInput(session.id, "deep-marker-op"),
        mode: "deep_analysis",
        text: "已生成长评，可回聊天区查看。"
      })
    ).resolves.toMatchObject({ mode: "deep_analysis" });
  });
});

function makeStoredComment(
  overrides: Partial<CompanionComment> &
    Pick<CompanionComment, "sessionId" | "id" | "operationId" | "createdAt">
): CompanionComment {
  return {
    position: position(1),
    mode: "light_chat",
    length: "short",
    text: "旧短评",
    source: "quick_action",
    inRecent: false,
    inHistory: false,
    ...overrides
  };
}
