import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { sha256Hex } from "../hash.js";
import { PERSISTENCE_SCHEMA_VERSION } from "./schema.js";

export type Migration = {
  readonly id: string;
  readonly sql: readonly string[];
  readonly checksum: string;
};

export const MIGRATION_001_INITIAL: Migration = {
  id: "001_initial",
  checksum: sha256Hex("001_initial"),
  sql: [
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS governance_ledger_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      subject_ref TEXT,
      payload_ref TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      sequence INTEGER NOT NULL UNIQUE,
      provenance_json TEXT NOT NULL,
      temporal_refs_json TEXT,
      metadata_json TEXT,
      content_hash TEXT NOT NULL,
      previous_event_hash TEXT NOT NULL,
      run_id TEXT,
      event_json TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_run_id ON governance_ledger_events(run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_sequence ON governance_ledger_events(sequence)`,
    `CREATE TABLE IF NOT EXISTS governance_runs (
      run_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      domain TEXT NOT NULL,
      state TEXT NOT NULL,
      checkpoint TEXT,
      run_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS idempotency_bindings (
      idempotency_key TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS execution_attempts (
      attempt_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      decision_id TEXT NOT NULL,
      action_request_id TEXT NOT NULL,
      authorization_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      result_ref TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      attempt_json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS execution_claims (
      resource_key TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      holder_actor_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    )`,
  ],
};

export const MIGRATION_002_EVALUATION_CORPUS: Migration = {
  id: "002_evaluation_corpus",
  checksum: sha256Hex("002_evaluation_corpus"),
  sql: [
    `CREATE TABLE IF NOT EXISTS evaluation_corpus_entities (
      kind TEXT NOT NULL,
      primary_key TEXT NOT NULL,
      secondary_key TEXT NOT NULL DEFAULT '',
      fingerprint TEXT,
      record_json TEXT NOT NULL,
      PRIMARY KEY (kind, primary_key, secondary_key)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_eval_corpus_fingerprint ON evaluation_corpus_entities(fingerprint)`,
    `CREATE INDEX IF NOT EXISTS idx_eval_corpus_kind ON evaluation_corpus_entities(kind)`,
  ],
};

export const ALL_MIGRATIONS: readonly Migration[] = [
  MIGRATION_001_INITIAL,
  MIGRATION_002_EVALUATION_CORPUS,
];

export type MigrationApplier = {
  readonly getAppliedMigrationIds: () => readonly string[];
  readonly applyMigration: (migration: Migration, appliedAt: string) => void;
  readonly exec: (sql: string) => void;
};

export function applyMigrations(
  applier: MigrationApplier,
  appliedAt: string,
): void {
  const applied = new Set(applier.getAppliedMigrationIds());
  for (const migration of ALL_MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }
    for (const statement of migration.sql) {
      applier.exec(statement);
    }
    applier.applyMigration(migration, appliedAt);
  }
  const appliedAfter = applier.getAppliedMigrationIds();
  const unknownFuture = appliedAfter.filter(
    (id) => !ALL_MIGRATIONS.some((migration) => migration.id === id),
  );
  if (unknownFuture.length > 0) {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_SCHEMA_UNSUPPORTED,
      `unknown future schema migrations: ${unknownFuture.join(", ")}`,
    );
  }
  if (appliedAfter.length > ALL_MIGRATIONS.length) {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_SCHEMA_UNSUPPORTED,
      "database schema is newer than this Core runtime supports",
    );
  }
}

export function assertSupportedSchemaVersion(version: number): void {
  if (version > PERSISTENCE_SCHEMA_VERSION) {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_SCHEMA_UNSUPPORTED,
      `unsupported persistence schema version ${version}`,
    );
  }
}
