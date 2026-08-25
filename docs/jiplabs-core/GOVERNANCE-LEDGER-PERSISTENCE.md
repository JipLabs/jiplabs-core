# Governance Ledger Persistence

## Model

Each ledger event stores:

- Stable `eventId` and monotonic `sequence`
- `idempotencyKey` (unique; duplicate identical append returns `duplicate`)
- Canonical event JSON envelope with content hash
- `previousEventHash` integrity linkage (genesis hash for first event)
- `runId` correlation via event metadata
- Decision-time `temporalRefs` preserved on `DECISION_MADE`

## Append semantics

- **Immutable** after append — corrections require new events
- **Idempotent** duplicate handling (same key + same eventId → `duplicate`)
- **Conflict** rejection (same key + different eventId → `LEDGER_IDEMPOTENCY_CONFLICT`)

## Reference adapter

`SqliteGovernanceLedger` persists to `governance_ledger_events` with deterministic ordering by `sequence`.

Query helpers:

- `list()` — all events in sequence order
- `listForRun(runId)` — events correlated to a governance run
- `getByEventId` / `getByIdempotencyKey`

## Transaction boundaries

Ledger append may be wrapped in `GovernanceUnitOfWork.runInTransaction()` together with run checkpoint persistence when atomicity is required.
