import { createRequire } from "node:module";
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

const requireFromHere = createRequire(__filename);
let resolvedNativeBinding: string | undefined;
let nativeBindingResolved = false;

export function createBetterSqliteDatabase(
  filename: string,
  options: BetterSqliteDatabaseOptions = {}
): BetterSqliteDatabase {
  const nativeBinding = resolveBetterSqliteNativeBinding();
  return nativeBinding
    ? new DatabaseConstructor(filename, { ...options, nativeBinding })
    : new DatabaseConstructor(filename, options);
}

export function betterSqliteNativeBindingCandidates(versions: { electron?: string }): string[] {
  const defaultBinding = "better-sqlite3/build/Release/better_sqlite3.node";
  return versions.electron
    ? [`better-sqlite3/build/Release/better_sqlite3.electron-${versions.electron}.node`, defaultBinding]
    : [defaultBinding];
}

function resolveBetterSqliteNativeBinding(): string | undefined {
  if (nativeBindingResolved) {
    return resolvedNativeBinding;
  }
  nativeBindingResolved = true;
  for (const candidate of betterSqliteNativeBindingCandidates(process.versions)) {
    try {
      resolvedNativeBinding = requireFromHere.resolve(candidate);
      break;
    } catch {}
  }
  return resolvedNativeBinding;
}
