import { DatabaseSync } from "node:sqlite";
import {
  openSqliteGovernanceStorage,
  type OpenSqliteGovernanceStorageOptions,
  type SqliteDatabase,
  type SqliteGovernanceStorage,
} from "./storage.js";

function wrapDatabase(db: DatabaseSync): SqliteDatabase {
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const statement = db.prepare(sql);
      return {
        run: (...params: unknown[]) => ({
          changes: Number(statement.run(...(params as never[])).changes),
        }),
        get: (...params: unknown[]) => statement.get(...(params as never[])),
        all: (...params: unknown[]) => statement.all(...(params as never[])) as unknown[],
      };
    },
    close: () => db.close(),
  };
}

export type NodeSqliteGovernanceStorageOptions = {
  readonly path: string;
  readonly appliedAt?: string;
  readonly createIfMissing?: boolean;
};

export function createNodeSqliteDatabase(path: string): SqliteDatabase {
  return wrapDatabase(new DatabaseSync(path));
}

export function openNodeSqliteGovernanceStorage(
  options: NodeSqliteGovernanceStorageOptions,
): SqliteGovernanceStorage {
  const openDatabase = () => createNodeSqliteDatabase(options.path);
  const storageOptions: OpenSqliteGovernanceStorageOptions = {
    openDatabase,
    appliedAt: options.appliedAt,
  };
  return openSqliteGovernanceStorage(storageOptions);
}

export function openMemorySqliteGovernanceStorage(
  appliedAt?: string,
): SqliteGovernanceStorage {
  return openSqliteGovernanceStorage({
    openDatabase: () => wrapDatabase(new DatabaseSync(":memory:")),
    appliedAt,
  });
}
