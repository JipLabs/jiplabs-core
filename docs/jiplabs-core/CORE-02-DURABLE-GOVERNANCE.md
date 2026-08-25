# CORE-02 — Durable Governance State

CORE-02 makes the Governor Kernel durable across process restarts while preserving all CORE-00 constitution and CORE-01 execution-safety invariants.

## Architecture

```
GovernorKernel
      ↓
Governance storage interfaces (ledger, runs, attempts, claims, unit of work)
      ↓
Reference SQLite adapter (node:sqlite, embedded, zero external service)
```

Durability is an infrastructure concern. The kernel depends on interfaces, not a specific database.

## Durable surfaces

| Interface | Responsibility |
|-----------|----------------|
| `GovernanceLedger` | Append-only governance events |
| `GovernanceRunStore` | Full run state + idempotency bindings |
| `ExecutionAttemptStore` | Pre-side-effect execution attempts |
| `ExecutionClaimStore` | Resource serialization leases |
| `GovernanceUnitOfWork` | Transactional boundaries |

## Crash-safe execution protocol

1. Validate governance (authorization binding, authority freshness)
2. Persist `PREPARED` execution attempt
3. Persist `STARTED` execution attempt + run checkpoint
4. Invoke `DomainActionExecutor` (unless reconciled or replay mode)
5. Persist result + `COMPLETED`/`FAILED` attempt
6. Emit ledger events and advance runtime state

If crash occurs after step 4 but before step 5, restart uses `DomainExecutionReconciler` — never blind retry.

## Guarantees

- Append-only ledger with content hash chain
- Idempotency survives restart (fingerprint-bound)
- Historical decisions immutable; current authority revalidated
- Ambiguous external effects fail closed to `RECONCILIATION_REQUIRED`
- Pure replay performs no side effects

## Not provided

- Distributed persistence, replication, multi-tenancy
- CORE-03 learning/evaluation corpus
- External service dependencies

See also: `GOVERNANCE-LEDGER-PERSISTENCE.md`, `RECOVERY-AND-REPLAY.md`, `STORAGE-INTEGRITY.md`, `SCHEMA-MIGRATIONS.md`.
