# Policy Model

## Principles

Policies are:

- **Versioned** — each activation is a distinct `PolicyVersion`
- **Immutable once activated** — content hash locked at activation
- **Auditable** — full gate results stored with decisions
- **Deterministic where possible** — gate evaluation is pure function of evidence

## PolicyVersion structure

| Field | Purpose |
|-------|---------|
| `policyId` / `version` | Identity |
| `domain` / `decisionType` | Binding |
| `applicableActorAuthority` | Which actor codes may apply |
| `requiredAuthorityScope` | Scope required to decide |
| `requiredEvidence` | Evidence kinds required |
| `gates` | Mandatory/optional gate definitions |
| `decisionOutcomes` | `onPass` / `onFail` / `onPartial` |
| `failureBehavior` | BLOCK, KEEP, REJECT, SHADOW |
| `rollbackRequirements` | Whether rollback plan required |
| `overrideRules` | Human override availability |
| `autonomyMode` | Governed autonomy mode |
| `effectiveFrom` | Activation window start |
| `supersedes` | Prior version reference |
| `contentHash` | Tamper-evident content |

## Gate evaluation

Each `PolicyGate` specifies:

- `evidenceKind` — maps to domain evidence
- `operator` — EQ, NEQ, GTE, LTE, EXISTS, TRUTH
- `expected` — expected value
- `mandatory` — blocks decision if not PASS

Gate verdicts: `PASS`, `FAIL`, `MISSING`.

## Example domain policy (not hard-coded in Core)

```
policy: champion-promotion-v1
gates:
  scientific_integrity == PASS
  fresh_holdout == PASS
  bootstrap_robustness == PASS
  temporal_stability == PASS
  leakage == PASS
  reproducibility == PASS
  rollback_ready == true
outcome: PROMOTE (all pass) | KEEP / REJECT / SHADOW (policy-defined)
```

Domain products supply policy content via `DomainPolicyProvider`. Core evaluates gates deterministically.

## Policy evaluation (ALLOW / BLOCK / REVIEW)

Actor-authority gates above are the lifecycle constitution. A smaller reusable contract, `evaluatePolicy`, produces `ALLOW` | `BLOCK` | `REVIEW` with reason codes, evidence refs, policy identity, and canonical serialization. See [POLICY-EVALUATION.md](./POLICY-EVALUATION.md).

That contract does **not** contain commercial country lists. Commercial eligibility is `@jiplabs/commerce-policy`.

## Autonomy modes

| Mode | Behavior |
|------|----------|
| `AUTONOMOUS` | Decide without human approval |
| `AUTONOMOUS_WITH_ROLLBACK` | Autonomous if rollback plan present |
| `AUTONOMOUS_CANARY` | Autonomous with canary constraints (domain-defined) |
| `HUMAN_APPROVAL_REQUIRED` | Decision pending until human authorizes |
| `BLOCKED` | No autonomous path |

**Human approval is not the default.** Each policy declares its mode.

## Immutability

Once `activatePolicyVersion()` is called:

- `status` → `ACTIVE`
- `immutable` → `true`
- `contentHash` locked
- `revisePolicyVersion()` throws `POLICY_IMMUTABLE`

Supersession creates a new version; the old version remains auditable.
