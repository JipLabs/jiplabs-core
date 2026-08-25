# Recovery and Replay

## Recovery checkpoints

The kernel resumes deterministically from durable state at:

- `DECISION_MADE` / human approval pending
- `ACTION_AUTHORIZED`
- `ACTION_STARTED` (with reconciliation)
- `ACTION_COMPLETED`
- `OUTCOME_RECORDED`
- `EVALUATION_COMPLETED`
- `ROLLBACK_STARTED`

Use `GovernorKernel.resume(runId, input)` against a fresh kernel instance backed by the same durable store.

## Reconciliation

When an execution attempt is `STARTED` and no result exists:

| Reconciler result | Behavior |
|-------------------|----------|
| `EXECUTED` | Record result without re-invoking executor |
| `NOT_EXECUTED` | Safe continue with governed execution |
| `UNKNOWN` | `RECONCILIATION_REQUIRED` — fail closed |
| No reconciler | `RECONCILIATION_REQUIRED` — fail closed |

## Replay

`replayGovernanceRun()` reconstructs `DecisionTrace` and ledger events from durable state.

**Replay is observational** — it never invokes:

- `DomainActionExecutor`
- Rollback executors
- External reconcilers (unless explicitly running recovery, not pure replay)

Set `replayMode: true` on `GovernorKernel` to block side effects during recovery inspection.

## Process restart testing

CORE-02 tests simulate restart by:

1. Open temp SQLite database
2. Run lifecycle
3. Close storage + kernel
4. Reopen same database with new instances
5. Resume / verify state
