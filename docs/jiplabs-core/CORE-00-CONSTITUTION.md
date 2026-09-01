# JipLabs Core — CORE-00 Constitution

## Mission

CORE-00 establishes the **constitutional contracts** for JipLabs Core: a domain-agnostic governance layer for autonomous systems that can observe, reason, decide, authorize, act, evaluate, and govern themselves when explicit policies and authority gates permit.

Humans operate **on the loop**, not routinely **in the loop**. Routine human approval is **not** the default.

CORE-00 defines contracts and minimal deterministic evaluation only. The autonomous runtime kernel is **CORE-01**.

## Architectural principles

| Layer | Responsibility |
|-------|----------------|
| **Core** | Actor identity, authority, policy evaluation, decision governance, traceability, execution authorization contracts, audit, override, rollback |
| **Domain products** | Domain observations, evidence, policies, actions, evaluators |

Core must **not** contain:

- Horse-racing concepts
- Compliance-specific concepts
- Product production integrations

## Core entities

Every entity carries:

- Stable `id`
- `schemaVersion` (`core-00.1`)
- `createdAt` / `recordedAt`
- `provenance` (actor/source, code/policy version where applicable)

| Entity | Purpose |
|--------|---------|
| `Actor` | Durable identity with explicit scopes |
| `Authority` / `AuthorityGrant` | Named authority scopes bound to actors and resources |
| `Policy` / `PolicyVersion` / `PolicyGate` | Versioned decision rules |
| `Evidence` / `ObservationRef` | Recorded proof |
| `DecisionProposal` | Intent — not yet a decision |
| `Decision` | Governed outcome — not yet an execution |
| `ActionRequest` / `ActionAuthorization` / `ActionResult` | Execution chain |
| `Outcome` / `Evaluation` | Post-action observation and verdict |
| `Override` | Human intervention — never erases original decision |
| `RollbackPlan` / `RollbackExecution` | Reversibility contract |
| `DecisionTrace` | Full reconstructable audit trail |
| `GovernanceEvent` | Append-only ledger entry |
| `AuditEngagement` / `AuditFinding` / `AuditReport` | Engagement-level audit artifacts (experimental) |

## Governed autonomy modes

Policies declare autonomy mode — Core does **not** assume one global risk model:

- `AUTONOMOUS`
- `AUTONOMOUS_WITH_ROLLBACK`
- `AUTONOMOUS_CANARY`
- `HUMAN_APPROVAL_REQUIRED`
- `BLOCKED`

## Separation of concerns

```
Proposal  ≠  Decision  ≠  Action  ≠  Outcome  ≠  Evaluation
Audit finding  ≠  Decision  ≠  Authorization  ≠  Execution
```

A proposal is not a decision. A decision is not an execution. An execution is not an outcome. An audit finding recommends; it does not authorize.

## Open-core licensing

`@jiplabs/core` is MIT and provides domain-agnostic governance, evaluation, and audit **mechanisms**. JipLabs differentiated intelligence lives in explicitly proprietary packages that depend on Core — never vice versa. See [ADR-001](../../decisions/ADR-001-JIPLABS-CORE-OPEN-CORE-STRATEGY-V1.md).

## Explainability

`DecisionExplanation` is structured evidence only:

- Decision summary
- Policy applied
- Gate results
- Evidence refs
- Rejected alternatives
- Known limitations
- Rollback path

No fake chain-of-thought. Explanations are reconstructed from recorded facts.

## Package location

```
packages/jiplabs-core/
docs/jiplabs-core/
```

## Non-goals

- Integrate Quinté or JipComply production
- Execute autonomous actions
- Implement LLM reasoning
- Require human approval globally

## Next: CORE-01

CORE-01 (Governor Kernel) will consume these contracts to execute:

Proposal → Authority check → Policy evaluation → Decision → Action authorization → Outcome → Evaluation → Keep / rollback
