# Integration guide — @jiplabs/core

## Choose a mode

| Need | API |
|---|---|
| Evaluate ALLOW / BLOCK / REVIEW without actor lifecycle | `evaluatePolicy` |
| Govern a decision; product executes (or does not execute) | `evaluateDomainDecisionAuthorization` |
| Core should run the executor, outcomes, evaluation, rollback | `GovernorKernel` |
| Observe-only / shadow | Authorize-only + `failureBehavior: "SHADOW"` and/or a domain executor that returns `BLOCKED` |
| Persist Core history | `openNodeSqliteGovernanceStorage` **or** product store of Core objects |
| Evaluation cases | `EvaluationCorpus` (**experimental**) |
| Agent/model assignment | `GovernedComponentRegistry` (**experimental**) |

## Authorize-only (recommended first integration)

1. Map domain facts to `Evidence` (`kind`, `value`, subject, observation refs).
2. Activate a `PolicyVersion` with gates over those kinds.
3. Issue an `AuthorityGrant` for the actor, scope, and resource.
4. Build a `DecisionProposal` (intent, not a decision).
5. Call `evaluateDomainDecisionAuthorization`.
6. Persist, at decision time:
   - the `Decision` (includes `governanceSnapshot`)
   - the evidence **values** used
   - optionally `buildDecisionTrace(...)`
7. If the product then mutates state, that mutation is **product execution**, not proof the decision was correct.

Empty `fetchObservations: () => []` is valid when evidence is already collected.

### Historical compare

Do **not** re-collect current evidence and call that the original decision.

```text
persist(snapshot, evidenceAtDecisionTime)
  → reconstructDecisionFromSnapshot({ snapshot, proposal, policyVersionAtDecisionTime, evidenceAtDecisionTime })
```

If evidence has changed, `matchesSnapshot` will be false. That is correct.

## Shadow / observation

Core does not deploy timers or product “shadow modes.” Those are product operations.

Core *does* support:

- policy `failureBehavior: "SHADOW"`
- assignment mode `SHADOW` (experimental CORE-04)
- an executor that returns `BLOCKED`

`evaluateDomainDecisionAuthorization` never calls a domain executor. Observation-only use cannot mutate production **through Core**.

## Decision-time snapshots

`Decision.governanceSnapshot` binds:

- authority grant id + content hash
- policy id, version, content hash
- evidence refs
- gate results
- `decidedAt`

This is the reconstructable historical meaning. Product envelopes (`@jiplabs/governance` or custom JSON) may wrap it; they should not replace it.

## Full kernel run

Pass a `DomainAdapterBundle` including `actionExecutor` and `outcomeEvaluator`. Kernel re-checks authority at execution time (`EXECUTION_AUTHORITY_STALE` if the grant is no longer valid). Duplicate `idempotencyKey` + fingerprint does not re-execute.

## Human-on-the-loop

Routine human approval is **not** the default. Set `autonomyMode: "HUMAN_APPROVAL_REQUIRED"` when policy requires it. Override, challenge, revocation, policy amendment, and rollback request remain available as governed events.

## Errors

Stable consumers should branch on `GovernanceError.code` / authorize-only `result.code`:

| Family | Examples |
|---|---|
| Invalid input | `MISSING_FIELD`, `INVALID_VALUE` |
| Unauthorized | `AUTHORITY_*`, `OVERRIDE_AUTHORITY_MISSING` |
| Policy rejection | `POLICY_NOT_ACTIVE`, `GATE_FAILED` |
| Policy evaluation | `POLICY_EVALUATION_FAILED`, `ENTITLEMENT_NOT_PERMITTED` |
| Execution | `ACTION_NOT_AUTHORIZED`, `DUPLICATE_EXECUTION` |
| Concurrency | `EXECUTION_CLAIM_HELD`, `IDEMPOTENCY_CONFLICT` |
| Persistence | `STORAGE_*` |
| Programmer misuse | invalid kernel transition, adapter domain mismatch |

`evaluatePolicy` returns `{ ok: false, code, message, evaluatedAt }` for operational failure. `REVIEW` is `ok: true`.
