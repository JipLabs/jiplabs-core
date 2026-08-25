# Action Authorization

## Principle

**A Decision alone is never sufficient to invoke an executor.**

Required path:

```
Decision → GovernedActionAuthorization → DomainActionExecutor
```

## GovernedActionAuthorization fields

| Field | Purpose |
|-------|---------|
| `decisionId` | Bound decision |
| `actorId` / `executorActorId` | Who authorized / who executes |
| `authorityRef` / `authorityCode` | Authority used |
| `policyId` / `policyVersion` / `policyContentHash` | Policy at authorization time |
| `autonomyMode` | Mode under which authorized |
| `rollbackReady` | Rollback readiness confirmed |
| `authorizedAt` | Timestamp |
| `authorizationHash` | Tamper-evident content hash |

## Enforcement

- `createGovernedActionAuthorization()` validates decision status, human approval, rollback readiness
- `assertValidForExecution()` blocks executor invocation without valid authorization
- `executeGovernedAction()` is the only Core interface that calls `DomainActionExecutor`

## Human approval authorization

Human approval creates a **new** `GovernedActionAuthorization` after:

- Valid authority grant held by the human approver
- Original decision referenced and preserved
- Ledger event `HUMAN_APPROVED` recorded

## Idempotency

Repeated runs with the same idempotency key return the stored run without duplicate authorization or execution.
