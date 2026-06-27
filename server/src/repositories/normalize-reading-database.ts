import {
  migrateReadingDatabase,
  type Bookmark,
  type CompanionComment,
  type Quote,
  type Reaction,
  type ReadingDatabase,
  type ReadingSession,
  type SourceManifest
} from "@ss/shared";

export function normalizeReadingDatabase(input: unknown): ReadingDatabase {
  const database = migrateReadingDatabase(input);
  return {
    schemaVersion: 4,
    sessions: database.sessions.map(copySession),
    quotes: database.quotes.map(copyQuote),
    reactions: database.reactions.map(copyReaction),
    bookmarks: database.bookmarks.map(copyBookmark),
    companionComments: database.companionComments.map(copyCompanionComment)
  };
}

export function needsReadingDatabaseWriteback(
  raw: unknown,
  normalized: ReadingDatabase
): boolean {
  return JSON.stringify(raw) !== JSON.stringify(normalized);
}

function copySession(session: ReadingSession): ReadingSession {
  return {
    id: session.id,
    title: session.title,
    type: session.type,
    status: session.status,
    userCurrentPosition: structuredClone(session.userCurrentPosition),
    assistantSyncedPosition: session.assistantSyncedPosition
      ? structuredClone(session.assistantSyncedPosition)
      : null,
    liveReadingEnabled: session.liveReadingEnabled,
    sessionPreferences: structuredClone(session.sessionPreferences),
    sourceManifest: copySourceManifest(session.sourceManifest),
    ...(session.lastAssistantConfirmation
      ? { lastAssistantConfirmation: structuredClone(session.lastAssistantConfirmation) }
      : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastReadAt: session.lastReadAt,
    ...(session.completedAt ? { completedAt: session.completedAt } : {})
  };
}

function copySourceManifest(manifest: SourceManifest | null): SourceManifest | null {
  if (!manifest) return null;
  return {
    sourceId: manifest.sourceId,
    sourceKind: manifest.sourceKind,
    ...(manifest.title ? { title: manifest.title } : {}),
    contentHash: manifest.contentHash,
    segmentationVersion: manifest.segmentationVersion,
    ...(manifest.paragraphCount !== undefined
      ? { paragraphCount: manifest.paragraphCount }
      : {}),
    ...(manifest.pageCount !== undefined ? { pageCount: manifest.pageCount } : {}),
    cloudSync: structuredClone(manifest.cloudSync),
    ...(manifest.createdOnDeviceId
      ? { createdOnDeviceId: manifest.createdOnDeviceId }
      : {}),
    ...(manifest.lastVerifiedAt ? { lastVerifiedAt: manifest.lastVerifiedAt } : {})
  };
}

function copyQuote(quote: Quote): Quote {
  return {
    id: quote.id,
    sessionId: quote.sessionId,
    content: quote.content,
    position: structuredClone(quote.position),
    ...(quote.note !== undefined ? { note: quote.note } : {}),
    ...(quote.operationId ? { operationId: quote.operationId } : {}),
    createdAt: quote.createdAt
  };
}

function copyReaction(reaction: Reaction): Reaction {
  return {
    id: reaction.id,
    sessionId: reaction.sessionId,
    content: reaction.content,
    position: structuredClone(reaction.position),
    speaker: reaction.speaker,
    ...(reaction.operationId ? { operationId: reaction.operationId } : {}),
    createdAt: reaction.createdAt
  };
}

function copyBookmark(bookmark: Bookmark): Bookmark {
  return {
    id: bookmark.id,
    sessionId: bookmark.sessionId,
    position: structuredClone(bookmark.position),
    ...(bookmark.label !== undefined ? { label: bookmark.label } : {}),
    ...(bookmark.operationId ? { operationId: bookmark.operationId } : {}),
    createdAt: bookmark.createdAt
  };
}

function copyCompanionComment(comment: CompanionComment): CompanionComment {
  return {
    id: comment.id,
    sessionId: comment.sessionId,
    position: structuredClone(comment.position),
    mode: comment.mode,
    length: comment.length,
    text: comment.text,
    source: comment.source,
    inRecent: comment.inRecent,
    inHistory: comment.inHistory,
    ...(comment.operationId ? { operationId: comment.operationId } : {}),
    createdAt: comment.createdAt,
    ...(comment.updatedAt ? { updatedAt: comment.updatedAt } : {})
  };
}
