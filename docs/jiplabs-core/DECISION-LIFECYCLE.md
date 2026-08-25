# Decision Lifecycle

## Stages

```
Observation → Evidence → Proposal → Authority Check → Policy → Gates → Decision
    → Authorization → Action → Outcome → Evaluation → Keep / Rollback / Follow-up
```

Each stage is a distinct contract. Stages must not be collapsed.

## 1. DecisionProposal

A proposal expresses **intent**:

```
action = PROMOTE
subject = challenger-C17
policy = champion-promotion-v1
evidenceRefs = [...]
```

A proposal is **not** a decision.

## 2. Authority check

Core verifies the proposing actor holds a valid grant for the policy's `requiredAuthorityScope` on the target resource.

Failure → decision blocked (`AUTHORITY_*` codes).

## 3. Policy evaluation

Active immutable policy version loaded. Gates evaluated against evidence.

Mandatory gate failure → `GATE_FAILED` (or policy-defined downgrade per `failureBehavior`).

## 4. Rollback readiness

If `rollbackRequirements.required` or autonomy mode is `AUTONOMOUS_WITH_ROLLBACK`:

- Valid `RollbackPlan` must exist
- Plan must be within `maximumRollbackWindow`

Failure → `ROLLBACK_PLAN_REQUIRED`.

## 5. Decision

```
Decision:
  decisionValue = PROMOTE
  human_approval_required = false
  human_override_available = true
  rollback_required = true
  decisionHash = sha256(canonical payload)
  explanationRef = ...
```

Decision is reconstructable from evidence + policy via `reconstructDecision()`.

## 6. Action authorization

`authorizeAction()` validates:

- Decision not blocked
- Human approval obtained if required
- Rollback plan referenced if required

Authorization is separate from the decision record.

## 7. Action execution

`ActionResult` records execution status. Domain executors implement semantics; Core governs authorization.

## 8. Outcome and evaluation

`Outcome` records what happened. `Evaluation` records a verdict (`KEEP`, `ROLLBACK`, `FOLLOW_UP`, `INCONCLUSIVE`).

Outcome ≠ evaluation.

## Decision hash

Deterministic SHA-256 over canonical JSON of:

- proposalId, actorId, authorityRef
- policyRef, policyVersion
- evidenceRefs, gateResults
- decisionValue, decidedAt

## Interrogation

At any point, `DecisionTrace` + `answerTraceQuestions()` answer:

| Question | Source |
|----------|--------|
| Qui a décidé ? | `trace.who` |
| Avec quelle autorité ? | authority link |
| Selon quelle version de policy ? | `policyId@version` |
| Sur quelles preuves ? | `evidenceIds` |
| Quelle action exécutée ? | `actionId` |
| Quel résultat ? | `outcomeId` |
| Peut-on rollback ? | `canRollback` |
| Un humain est-il intervenu ? | `humanIntervened` |

## CORE-01 boundary

CORE-00 defines contracts and `evaluateDecisionProposal()` for testability. CORE-01 will orchestrate the full runtime loop.
