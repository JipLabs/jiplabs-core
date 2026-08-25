# Governed Runtime Lifecycle

## Kernel states

```
PROPOSAL_RECEIVED
  → AUTHORITY_CHECKING → AUTHORITY_DENIED | POLICY_EVALUATING
  → POLICY_BLOCKED | DECISION_MADE
  → WAITING_HUMAN_APPROVAL (if required)
  → ACTION_AUTHORIZED → ACTION_EXECUTING
  → ACTION_SUCCEEDED | ACTION_FAILED
  → OUTCOME_RECORDED → EVALUATING → EVALUATED
  → KEEP | FOLLOW_UP_REQUIRED | ROLLBACK_REQUIRED
  → ROLLBACK_EXECUTING → ROLLBACK_COMPLETED | ROLLBACK_FAILED
```

Invalid transitions fail closed via `assertInvalidTransition()`.

## Human approval path

1. Policy declares `HUMAN_APPROVAL_REQUIRED`
2. Kernel creates decision, transitions to `WAITING_HUMAN_APPROVAL`
3. Ledger emits `HUMAN_APPROVAL_REQUESTED`
4. Authorized human approves with valid grant → `HUMAN_APPROVED` + `ACTION_AUTHORIZED`
5. Execution proceeds exactly once
6. Rejection → `HUMAN_REJECTED`, original decision preserved

## Rollback path

1. Evaluation disposition `ROLLBACK` or policy requires rollback
2. Validate rollback authority, plan, and window
3. `ROLLBACK_TRIGGERED` → execute → `ROLLBACK_COMPLETED` or `ROLLBACK_FAILED`
4. Original decision, action, outcome, and evaluation remain in history

## Side-effect boundary

| Layer | Responsibility |
|-------|----------------|
| GovernorKernel | Deterministic governance + state |
| GovernedActionAuthorization | Execution gate |
| DomainActionExecutor | Domain semantics only |
| DomainOutcomeEvaluator | Post-outcome verdict |

Policy evaluation never directly invokes external systems.
