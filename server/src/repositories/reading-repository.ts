import type { ReadingDatabase } from "@ss/shared";

export interface ReadingRepository {
  read(): Promise<ReadingDatabase>;
  mutate<T>(change: (database: ReadingDatabase) => T | Promise<T>): Promise<T>;
}
