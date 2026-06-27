import type { ReadingDatabase } from "@ss/shared";
import { AppError } from "../errors/app-error.js";
import {
  needsReadingDatabaseWriteback,
  normalizeReadingDatabase
} from "./normalize-reading-database.js";
import type { ReadingRepository } from "./reading-repository.js";

type D1ResultLike = {
  success: boolean;
  meta: { changes?: number };
};

type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<D1ResultLike>;
};

export interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
}

type StateRow = {
  version: number;
  data: string;
};

const emptyDatabase = (): ReadingDatabase => ({
  schemaVersion: 4,
  sessions: [],
  quotes: [],
  reactions: [],
  bookmarks: [],
  companionComments: []
});

export class D1ReadingRepository implements ReadingRepository {
  constructor(private readonly database: D1DatabaseLike) {}

  async read(): Promise<ReadingDatabase> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await this.readRow();
      const raw = this.parseJson(row.data);
      const database = this.parse(raw);
      if (!needsReadingDatabaseWriteback(raw, database)) return database;
      const update = await this.writeAtVersion(database, row.version);
      if (update) return database;
    }
    throw new AppError("INVALID_OPERATION", "云端数据正在更新，请稍后重试。");
  }

  async mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await this.readRow();
      const database = this.parse(row.data);
      const result = await change(database);
      const update = await this.database
        .prepare(
          "UPDATE app_state SET data = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND version = ?"
        )
        .bind(JSON.stringify(database), row.version + 1, row.version)
        .run();
      if ((update.meta.changes ?? 0) === 1) return result;
    }
    throw new AppError("INVALID_OPERATION", "云端数据正在更新，请稍后重试。");
  }

  private async readRow(): Promise<StateRow> {
    const existing = await this.database
      .prepare("SELECT version, data FROM app_state WHERE id = 1")
      .first<StateRow>();
    if (existing) return existing;

    const initial = emptyDatabase();
    await this.database
      .prepare(
        "INSERT OR IGNORE INTO app_state (id, version, data, updated_at) VALUES (1, 1, ?, CURRENT_TIMESTAMP)"
      )
      .bind(JSON.stringify(initial))
      .run();
    return (
      (await this.database
        .prepare("SELECT version, data FROM app_state WHERE id = 1")
        .first<StateRow>()) ?? { version: 1, data: JSON.stringify(initial) }
    );
  }

  private parseJson(data: string): { schemaVersion?: unknown } {
    try {
      return JSON.parse(data) as { schemaVersion?: unknown };
    } catch {
      throw new AppError("DATA_STORE_CORRUPTED", "云端共读数据无法读取。");
    }
  }

  private parse(data: unknown): ReadingDatabase {
    try {
      return normalizeReadingDatabase(typeof data === "string" ? JSON.parse(data) : data);
    } catch {
      throw new AppError("DATA_STORE_CORRUPTED", "云端共读数据无法读取。");
    }
  }

  private async writeAtVersion(database: ReadingDatabase, version: number): Promise<boolean> {
    const update = await this.database
      .prepare(
        "UPDATE app_state SET data = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND version = ?"
      )
      .bind(JSON.stringify(database), version + 1, version)
      .run();
    return (update.meta.changes ?? 0) === 1;
  }
}
