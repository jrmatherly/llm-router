import DatabaseConstructor, { type Database as BetterSqliteDatabase } from "better-sqlite3";

export type {
  Database as BetterSqliteDatabase,
  Statement as BetterSqliteStatement
} from "better-sqlite3";

export type BetterSqliteDatabaseOptions = {
  fileMustExist?: boolean;
  readonly?: boolean;
  timeout?: number;
};

export function createBetterSqliteDatabase(
  filename: string,
  options: BetterSqliteDatabaseOptions = {}
): BetterSqliteDatabase {
  return new DatabaseConstructor(filename, options);
}
