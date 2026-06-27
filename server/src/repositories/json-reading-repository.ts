import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReadingDatabase } from "@ss/shared";
import { AppError } from "../errors/app-error.js";
import {
  needsReadingDatabaseWriteback,
  normalizeReadingDatabase
} from "./normalize-reading-database.js";
import type { ReadingRepository } from "./reading-repository.js";

const emptyDatabase = (): ReadingDatabase => ({
  schemaVersion: 4,
  sessions: [],
  quotes: [],
  reactions: [],
  bookmarks: [],
  companionComments: []
});

export class JsonReadingRepository implements ReadingRepository {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<ReadingDatabase> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const database = normalizeReadingDatabase(parsed);
      if (needsReadingDatabaseWriteback(parsed, database)) await this.write(database);
      return database;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const database = emptyDatabase();
        await this.write(database);
        return database;
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        "DATA_STORE_CORRUPTED",
        "共读数据文件无法读取。为避免覆盖原数据，服务已停止写入。"
      );
    }
  }

  async mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>): Promise<T> {
    let result!: T;
    const queued = this.writeQueue.then(async () => {
      const database = await this.read();
      result = await change(database);
      await this.write(database);
    });
    this.writeQueue = queued.catch(() => undefined);
    await queued;
    return result;
  }

  private async write(database: ReadingDatabase): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
      await rename(tempPath, this.filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }
}
