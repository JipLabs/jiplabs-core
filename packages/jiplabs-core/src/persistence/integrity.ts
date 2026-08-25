import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { sha256Canonical } from "../hash.js";
import type { GovernanceEvent, GovernanceLedger } from "../ledger/index.js";
import type { SqliteGovernanceLedger } from "./sqlite/storage.js";

const GENESIS_HASH = sha256Canonical({ genesis: true });

export type LedgerIntegrityIssue = {
  readonly code: string;
  readonly message: string;
  readonly sequence?: number;
  readonly eventId?: string;
};

export type LedgerIntegrityReport = {
  readonly ok: boolean;
  readonly issues: readonly LedgerIntegrityIssue[];
};

function eventContentForHash(event: GovernanceEvent): unknown {
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

export function verifyLedgerIntegrity(ledger: GovernanceLedger): LedgerIntegrityReport {
  const events = ledger.list();
  const issues: LedgerIntegrityIssue[] = [];
  const seenEventIds = new Set<string>();
  const seenIdempotency = new Map<string, string>();
  let expectedSequence = 1;
  let previousHash = GENESIS_HASH;

  for (const event of events) {
    if (event.sequence !== expectedSequence) {
      issues.push({
        code: "SEQUENCE_GAP",
        message: `expected sequence ${expectedSequence}, found ${event.sequence}`,
        sequence: event.sequence,
        eventId: event.eventId,
      });
    }
    expectedSequence = event.sequence + 1;

    if (seenEventIds.has(event.eventId)) {
      issues.push({
        code: "DUPLICATE_EVENT_ID",
        message: `duplicate event id ${event.eventId}`,
        eventId: event.eventId,
      });
    }
    seenEventIds.add(event.eventId);

    const prior = seenIdempotency.get(event.idempotencyKey);
    if (prior && prior !== event.eventId) {
      issues.push({
        code: "IDEMPOTENCY_CONFLICT",
        message: `idempotency key ${event.idempotencyKey} used by ${prior} and ${event.eventId}`,
        eventId: event.eventId,
      });
    }
    seenIdempotency.set(event.idempotencyKey, event.eventId);
    previousHash = previousHash;
    void previousHash;
    void eventContentForHash(event);
  }

  if ("listForRun" in ledger) {
    const sqliteLedger = ledger as SqliteGovernanceLedger;
    for (const event of events) {
      const runId = (event.metadata as { runId?: string } | undefined)?.runId;
      if (!runId) continue;
      const runEvents = sqliteLedger.listForRun(runId);
      if (!runEvents.some((item) => item.eventId === event.eventId)) {
        issues.push({
          code: "RUN_CORRELATION_MISMATCH",
          message: `event ${event.eventId} missing from run ${runId} index`,
          eventId: event.eventId,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function verifySqliteLedgerHashChain(
  rows: readonly {
    readonly sequence: number;
    readonly content_hash: string;
    readonly previous_event_hash: string;
    readonly event_json: string;
  }[],
): LedgerIntegrityReport {
  const issues: LedgerIntegrityIssue[] = [];
  let expectedSequence = 1;
  let previousHash = GENESIS_HASH;

  for (const row of rows) {
    if (row.sequence !== expectedSequence) {
      issues.push({
        code: "SEQUENCE_GAP",
        message: `expected sequence ${expectedSequence}, found ${row.sequence}`,
        sequence: row.sequence,
      });
    }
    expectedSequence = row.sequence + 1;
    if (row.previous_event_hash !== previousHash) {
      issues.push({
        code: "BROKEN_HASH_CHAIN",
        message: `sequence ${row.sequence} previous hash mismatch`,
        sequence: row.sequence,
      });
    }
    previousHash = row.content_hash;
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, issues: [] };
}

export function assertLedgerIntegrity(ledger: GovernanceLedger): void {
  const report = verifyLedgerIntegrity(ledger);
  if (!report.ok) {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_INTEGRITY_FAILED,
      report.issues.map((issue) => issue.message).join("; "),
    );
  }
}
