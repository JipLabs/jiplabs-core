# Human On The Loop

## Principle

Human role is **first-class but not mandatory** in the normal decision path. Humans can always inspect, interrogate, challenge, audit, override, and rollback — but routine approval is **not** the default.

## Human intervention types

| Type | Contract | Purpose |
|------|----------|---------|
| `HumanChallenge` | Question or dispute a decision | Audit trail |
| `Override` | Reverse or amend an action | Governed by authority |
| `PolicyAmendment` | Change policy version | Recorded amendment |
| `AuthorityRevocationRecord` | Revoke a grant | Recorded revocation |
| `RollbackRequest` | Request rollback execution | Recorded request |

Every intervention is recorded in the governance ledger. **Original autonomous decisions are never silently rewritten.**

## Example timeline

```
T1  Decision: PROMOTE candidate-C17     (autonomous, all gates pass)
T2  HumanOverride: ROLLBACK_TO_V2H      (human-owner, authorized)
```

Both events remain in the ledger. The trace shows `humanIntervened: true` after T2.

## Override governance

Override requires explicit authority:

- Scope: `OVERRIDE_DECISION`
- Valid grant on the target resource
- `authorizeOverride()` enforces this

Not every human has unrestricted override power.

## Override contract

```
Override:
  override_id
  human_actor
  target_decision
  reason
  authority_ref
  requested_action
  created_at
  execution_status
```

## Human approval vs override

| Mechanism | When | Effect |
|-----------|------|--------|
| `HUMAN_APPROVAL_REQUIRED` | Policy declares high-risk path | Decision status `PENDING_HUMAN_APPROVAL`; action blocked until authorized |
| `Override` | Post-decision human intervention | New ledger event; original decision preserved |

## Explainability for humans

Humans inspect `DecisionExplanation`:

- Structured gate results
- Evidence refs
- Rejected alternatives
- Known limitations
- Rollback path

No synthetic reasoning chains — only recorded facts and policy evaluation.

## Ledger events

Human interventions emit:

- `HUMAN_CHALLENGE`
- `HUMAN_OVERRIDE`
- `AUTHORITY_REVOKED` (when applicable)
- `ROLLBACK_TRIGGERED` / `ROLLBACK_COMPLETED`

Append-only. Idempotent by `idempotencyKey`.
