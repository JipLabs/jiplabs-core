import { GovernanceError, GovernanceErrorCode } from "../../errors.js";
import { createGovernanceEvent, type AppendResult, type GovernanceEvent, type GovernanceLedger } from "../../ledger/index.js";
import type { ExecutionClaim, ExecutionClaimStore } from "../../concurrency/index.js";
import type {
  DurableExecutionAttempt,
  GovernanceRun,
  GovernanceRunStore,
  IdempotencyBinding,
} from "../../governor/runtime-state.js";
import { deserializeGovernanceRecord, hashGovernanceRecord, serializeGovernanceRecord } from "../serialization.js";
import { SqliteEvaluationCorpusStore } from "../evaluation-corpus-store.js";
import type { ExecutionAttemptStore, GovernanceStorageBundle, GovernanceUnitOfWork } from "../interfaces.js";
import { applyMigrations, type MigrationApplier } from "../migrations.js";
import { sha256Canonical } from "../../hash.js";

const GENESIS_HASH = sha256Canonical({ genesis: true });

export type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

export type OpenSqliteGovernanceStorageOptions = {
  readonly openDatabase: () => SqliteDatabase;
  readonly appliedAt?: string;
};

function eventContentForHash(event: Omit<GovernanceEvent, "sequence">): unknown {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    actorId: event.actorId,
    subjectRef: event.subjectRef ?? null,
    payloadRef: event.payloadRef,
    idempotencyKey: event.idempotencyKey,
    provenance: event.provenance,
    temporalRefs: event.temporalRefs ?? null,
    metadata: event.metadata ?? null,
  };
}

function extractRunId(event: Omit<GovernanceEvent, "sequence">): string | null {
  const metadata = event.metadata as { runId?: string } | undefined;
  return metadata?.runId ?? null;
}

class SqliteUnitOfWork implements GovernanceUnitOfWork {
  readonly #db: SqliteDatabase;
  #depth = 0;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  runInTransaction<T>(work: () => T): T {
    if (this.#depth > 0) {
      return work();
    }
    this.#db.exec("BEGIN IMMEDIATE");
    this.#depth += 1;
    try {
      const result = work();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      if (error instanceof GovernanceError) {
        throw error;
      }
      throw new GovernanceError(
        GovernanceErrorCode.STORAGE_TRANSACTION_FAILED,
        error instanceof Error ? error.message : "transaction failed",
      );
    } finally {
      this.#depth = 0;
    }
  }
}

export class SqliteGovernanceLedger implements GovernanceLedger {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  append(event: Omit<GovernanceEvent, "sequence">): AppendResult {
    const existingByKey = this.getByIdempotencyKey(event.idempotencyKey);
    if (existingByKey) {
      if (existingByKey.eventId !== event.eventId) {
        throw new GovernanceError(
          GovernanceErrorCode.LEDGER_IDEMPOTENCY_CONFLICT,
          `idempotency key ${event.idempotencyKey} already used by ${existingByKey.eventId}`,
        );
      }
      return { status: "duplicate", event: existingByKey };
    }
    const existingById = this.getByEventId(event.eventId);
    if (existingById) {
      return { status: "duplicate", event: existingById };
    }

    const last = this.#db
      .prepare(
        "SELECT sequence, content_hash FROM governance_ledger_events ORDER BY sequence DESC LIMIT 1",
      )
      .get() as { sequence: number; content_hash: string } | undefined;
    const sequence = (last?.sequence ?? 0) + 1;
    const previousEventHash = last?.content_hash ?? GENESIS_HASH;
    const contentHash = sha256Canonical(eventContentForHash(event));
    const stored = createGovernanceEvent({ ...event, sequence });
    const runId = extractRunId(event);

    try {
      this.#db
        .prepare(
          `INSERT INTO governance_ledger_events (
            event_id, event_type, occurred_at, recorded_at, actor_id, subject_ref,
            payload_ref, idempotency_key, sequence, provenance_json, temporal_refs_json,
            metadata_json, content_hash, previous_event_hash, run_id, event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stored.eventId,
          stored.eventType,
          stored.occurredAt,
          stored.recordedAt,
          stored.actorId,
          stored.subjectRef ?? null,
          stored.payloadRef,
          stored.idempotencyKey,
          stored.sequence,
          JSON.stringify(stored.provenance),
          stored.temporalRefs ? JSON.stringify(stored.temporalRefs) : null,
          stored.metadata ? JSON.stringify(stored.metadata) : null,
          contentHash,
          previousEventHash,
          runId,
          serializeGovernanceRecord(stored),
        );
    } catch (error) {
      throw new GovernanceError(
        GovernanceErrorCode.STORAGE_PERSISTENCE_FAILED,
        error instanceof Error ? error.message : "ledger append failed",
      );
    }
    return { status: "appended", event: stored };
  }

  list(): readonly GovernanceEvent[] {
    const rows = this.#db
      .prepare("SELECT event_json FROM governance_ledger_events ORDER BY sequence ASC")
      .all() as Array<{ event_json: string }>;
    return rows.map((row) => deserializeGovernanceRecord<GovernanceEvent>(row.event_json));
  }

  listForRun(runId: string): readonly GovernanceEvent[] {
    const rows = this.#db
      .prepare(
        "SELECT event_json FROM governance_ledger_events WHERE run_id = ? ORDER BY sequence ASC",
      )
      .all(runId) as Array<{ event_json: string }>;
    return rows.map((row) => deserializeGovernanceRecord<GovernanceEvent>(row.event_json));
  }

  getByIdempotencyKey(key: string): GovernanceEvent | undefined {
    const row = this.#db
      .prepare("SELECT event_json FROM governance_ledger_events WHERE idempotency_key = ?")
      .get(key) as { event_json: string } | undefined;
    return row ? deserializeGovernanceRecord<GovernanceEvent>(row.event_json) : undefined;
  }

  getByEventId(eventId: string): GovernanceEvent | undefined {
    const row = this.#db
      .prepare("SELECT event_json FROM governance_ledger_events WHERE event_id = ?")
      .get(eventId) as { event_json: string } | undefined;
    return row ? deserializeGovernanceRecord<GovernanceEvent>(row.event_json) : undefined;
  }
}

export class SqliteGovernanceRunStore implements GovernanceRunStore {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  get(runId: string): GovernanceRun | undefined {
    const row = this.#db
      .prepare("SELECT run_json FROM governance_runs WHERE run_id = ?")
      .get(runId) as { run_json: string } | undefined;
    return row ? Object.freeze(deserializeGovernanceRecord<GovernanceRun>(row.run_json)) : undefined;
  }

  getByIdempotencyKey(key: string): GovernanceRun | undefined {
    const binding = this.getIdempotencyBinding(key);
    return binding ? this.get(binding.runId) : undefined;
  }

  getIdempotencyBinding(key: string): IdempotencyBinding | undefined {
    const row = this.#db
      .prepare("SELECT run_id, fingerprint FROM idempotency_bindings WHERE idempotency_key = ?")
      .get(key) as { run_id: string; fingerprint: string } | undefined;
    return row ? { runId: row.run_id, fingerprint: row.fingerprint } : undefined;
  }

  save(run: GovernanceRun): void {
    const existingBinding = this.getIdempotencyBinding(run.idempotencyKey);
    if (existingBinding && existingBinding.runId !== run.runId) {
      throw new GovernanceError(
        GovernanceErrorCode.LEDGER_IDEMPOTENCY_CONFLICT,
        `idempotency key ${run.idempotencyKey} already bound to run ${existingBinding.runId}`,
      );
    }
    if (
      existingBinding &&
      run.requestFingerprint &&
      existingBinding.fingerprint !== run.requestFingerprint
    ) {
      throw new GovernanceError(
        GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
        `idempotency key ${run.idempotencyKey} bound to a different request fingerprint`,
      );
    }
    if (run.rollbackIdempotencyKey && run.rollbackRequestFingerprint) {
      const rollbackBinding = this.getIdempotencyBinding(run.rollbackIdempotencyKey);
      if (rollbackBinding) {
        if (rollbackBinding.runId !== run.runId) {
          throw new GovernanceError(
            GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
            `rollback idempotency key ${run.rollbackIdempotencyKey} already bound to another run`,
          );
        }
        if (rollbackBinding.fingerprint !== run.rollbackRequestFingerprint) {
          throw new GovernanceError(
            GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
            `rollback idempotency key ${run.rollbackIdempotencyKey} bound to a different rollback fingerprint`,
          );
        }
      } else {
        this.#upsertBinding(run.rollbackIdempotencyKey, run.runId, run.rollbackRequestFingerprint);
      }
    }

    const serialized = serializeGovernanceRecord(run);
    void hashGovernanceRecord(run);
    const existing = this.#db
      .prepare("SELECT version FROM governance_runs WHERE run_id = ?")
      .get(run.runId) as { version: number } | undefined;
    const version = (existing?.version ?? 0) + 1;

    try {
      this.#db
        .prepare(
          `INSERT INTO governance_runs (
            run_id, idempotency_key, request_fingerprint, resource_key, domain, state,
            checkpoint, run_json, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            request_fingerprint = excluded.request_fingerprint,
            resource_key = excluded.resource_key,
            domain = excluded.domain,
            state = excluded.state,
            checkpoint = excluded.checkpoint,
            run_json = excluded.run_json,
            version = excluded.version,
            updated_at = excluded.updated_at`,
        )
        .run(
          run.runId,
          run.idempotencyKey,
          run.requestFingerprint,
          run.resourceKey,
          run.domain,
          run.state,
          run.checkpoint,
          serialized,
          version,
          run.createdAt,
          run.updatedAt,
        );
      if (run.requestFingerprint) {
        this.#upsertBinding(run.idempotencyKey, run.runId, run.requestFingerprint);
      }
    } catch (error) {
      throw new GovernanceError(
        GovernanceErrorCode.STORAGE_PERSISTENCE_FAILED,
        error instanceof Error ? error.message : "run save failed",
      );
    }
  }

  #upsertBinding(key: string, runId: string, fingerprint: string): void {
    this.#db
      .prepare(
        `INSERT INTO idempotency_bindings (idempotency_key, run_id, fingerprint)
         VALUES (?, ?, ?)
         ON CONFLICT(idempotency_key) DO UPDATE SET run_id = excluded.run_id, fingerprint = excluded.fingerprint`,
      )
      .run(key, runId, fingerprint);
  }
}

export class SqliteExecutionAttemptStore implements ExecutionAttemptStore {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  get(attemptId: string): DurableExecutionAttempt | undefined {
    const row = this.#db
      .prepare("SELECT attempt_json FROM execution_attempts WHERE attempt_id = ?")
      .get(attemptId) as { attempt_json: string } | undefined;
    return row
      ? Object.freeze(deserializeGovernanceRecord<DurableExecutionAttempt>(row.attempt_json))
      : undefined;
  }

  getByRunId(runId: string): DurableExecutionAttempt | undefined {
    const row = this.#db
      .prepare("SELECT attempt_json FROM execution_attempts WHERE run_id = ?")
      .get(runId) as { attempt_json: string } | undefined;
    return row
      ? Object.freeze(deserializeGovernanceRecord<DurableExecutionAttempt>(row.attempt_json))
      : undefined;
  }

  save(attempt: DurableExecutionAttempt): void {
    const serialized = serializeGovernanceRecord(attempt);
    const existing = this.#db
      .prepare("SELECT version FROM execution_attempts WHERE attempt_id = ?")
      .get(attempt.attemptId) as { version: number } | undefined;
    if (existing && attempt.version <= existing.version) {
      throw new GovernanceError(
        GovernanceErrorCode.STORAGE_PERSISTENCE_FAILED,
        `execution attempt ${attempt.attemptId} version conflict`,
      );
    }
    try {
      this.#db
        .prepare(
          `INSERT INTO execution_attempts (
            attempt_id, run_id, decision_id, action_request_id, authorization_id,
            status, started_at, result_ref, version, attempt_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(attempt_id) DO UPDATE SET
            status = excluded.status,
            started_at = excluded.started_at,
            result_ref = excluded.result_ref,
            version = excluded.version,
            attempt_json = excluded.attempt_json`,
        )
        .run(
          attempt.attemptId,
          attempt.runId,
          attempt.decisionId,
          attempt.actionRequestId,
          attempt.authorizationId,
          attempt.status,
          attempt.startedAt,
          attempt.resultRef ?? null,
          attempt.version,
          serialized,
        );
    } catch (error) {
      throw new GovernanceError(
        GovernanceErrorCode.STORAGE_PERSISTENCE_FAILED,
        error instanceof Error ? error.message : "execution attempt save failed",
      );
    }
  }
}

export class SqliteExecutionClaimStore implements ExecutionClaimStore {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  get(resourceKey: string): ExecutionClaim | undefined {
    const row = this.#db
      .prepare(
        "SELECT resource_key, run_id, holder_actor_id, acquired_at, expires_at FROM execution_claims WHERE resource_key = ?",
      )
      .get(resourceKey) as
      | {
          resource_key: string;
          run_id: string;
          holder_actor_id: string;
          acquired_at: string;
          expires_at: string;
        }
      | undefined;
    if (!row) return undefined;
    const claim: ExecutionClaim = {
      resourceKey: row.resource_key,
      runId: row.run_id,
      holderActorId: row.holder_actor_id,
      acquiredAt: row.acquired_at,
      expiresAt: row.expires_at,
    };
    if (Date.parse(claim.expiresAt) <= Date.now()) {
      this.release(resourceKey, claim.runId);
      return undefined;
    }
    return Object.freeze(claim);
  }

  tryAcquire(input: ExecutionClaim): boolean {
    const existing = this.get(input.resourceKey);
    if (existing && existing.runId !== input.runId) {
      return false;
    }
    const existingRow = this.#db
      .prepare("SELECT version FROM execution_claims WHERE resource_key = ?")
      .get(input.resourceKey) as { version: number } | undefined;
    const version = (existingRow?.version ?? 0) + 1;
    this.#db
      .prepare(
        `INSERT INTO execution_claims (resource_key, run_id, holder_actor_id, acquired_at, expires_at, version)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(resource_key) DO UPDATE SET
           run_id = excluded.run_id,
           holder_actor_id = excluded.holder_actor_id,
           acquired_at = excluded.acquired_at,
           expires_at = excluded.expires_at,
           version = excluded.version`,
      )
      .run(
        input.resourceKey,
        input.runId,
        input.holderActorId,
        input.acquiredAt,
        input.expiresAt,
        version,
      );
    return true;
  }

  release(resourceKey: string, runId: string): void {
    this.#db
      .prepare("DELETE FROM execution_claims WHERE resource_key = ? AND run_id = ?")
      .run(resourceKey, runId);
  }
}

export class SqliteGovernanceStorage implements GovernanceStorageBundle {
  readonly ledger: SqliteGovernanceLedger;
  readonly runStore: SqliteGovernanceRunStore;
  readonly claimStore: SqliteExecutionClaimStore;
  readonly attemptStore: SqliteExecutionAttemptStore;
  readonly unitOfWork: SqliteUnitOfWork;
  readonly corpusStore: SqliteEvaluationCorpusStore;
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
    this.unitOfWork = new SqliteUnitOfWork(db);
    this.ledger = new SqliteGovernanceLedger(db);
    this.runStore = new SqliteGovernanceRunStore(db);
    this.claimStore = new SqliteExecutionClaimStore(db);
    this.attemptStore = new SqliteExecutionAttemptStore(db);
    this.corpusStore = new SqliteEvaluationCorpusStore(db);
  }

  close(): void {
    this.#db.close();
  }
}

export function initializeSqliteDatabase(
  db: SqliteDatabase,
  appliedAt = new Date().toISOString(),
): void {
  const applier: MigrationApplier = {
    exec: (sql) => db.exec(sql),
    getAppliedMigrationIds: () => {
      try {
        const rows = db
          .prepare("SELECT migration_id FROM schema_migrations ORDER BY migration_id ASC")
          .all() as Array<{ migration_id: string }>;
        return rows.map((row) => row.migration_id);
      } catch {
        return [];
      }
    },
    applyMigration: (migration, at) => {
      db.prepare(
        "INSERT INTO schema_migrations (migration_id, applied_at, checksum) VALUES (?, ?, ?)",
      ).run(migration.id, at, migration.checksum);
    },
  };
  applyMigrations(applier, appliedAt);
}

export function openSqliteGovernanceStorage(
  options: OpenSqliteGovernanceStorageOptions,
): SqliteGovernanceStorage {
  const db = options.openDatabase();
  initializeSqliteDatabase(db, options.appliedAt);
  return new SqliteGovernanceStorage(db);
}
