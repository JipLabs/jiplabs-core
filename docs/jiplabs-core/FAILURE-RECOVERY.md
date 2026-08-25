# Failure Recovery

## Recovery checkpoints

Runtime state records checkpoints at:

| Checkpoint | State |
|------------|-------|
| `DECISION_MADE` | Decision created (may wait for human approval) |
| `ACTION_AUTHORIZED` | Authorization issued, execution pending |
| `ACTION_STARTED` | Execution in progress |
| `ACTION_COMPLETED` | Action result recorded |
| `OUTCOME_RECORDED` | Outcome captured |
| `EVALUATION_COMPLETED` | Evaluation and disposition resolved |
| `ROLLBACK_STARTED` | Rollback in progress |

## Resume semantics

`GovernorKernel.resume(runId, input)` continues from the last checkpoint:

- After decision, before action: returns waiting state or continues if authorized
- After action authorized: executes without re-deciding
- After action completed: evaluates and disposes without re-executing

## Idempotency

`GovernanceRunStore` indexes runs by `idempotencyKey`. Duplicate submissions return the existing run — no duplicate decisions, executions, outcomes, or rollbacks.

## Persistence

CORE-01 provides `InMemoryGovernanceRunStore` for tests. Production persistence is a CORE-02+ concern; contracts are designed for deterministic replay from stored runs and ledger events.

## Concurrency

`InMemoryExecutionClaimStore` provides lightweight resource claims to prevent conflicting simultaneous runs over the same governed resource.
