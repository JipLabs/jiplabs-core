# CORE-Auditor — MIT Auditor Foundation

| Field | Value |
|-------|-------|
| Status | Experimental |
| Classification | `CORE_MIT` |
| Import | `@jiplabs/core/experimental` |
| Chantiers | CORE-IP-01, CORE-AUDITOR-01 |

## Purpose

Domain-agnostic Auditor primitive for governed systems. Quinté Lab, Research Engine, Trading Bot, JipComply, and future products share structurally similar audit needs: reconstruct governed history, evaluate rules, produce findings and reports — without vertical semantics in Core.

## Authority rule

The Auditor is **not** a Governor, decision maker, or executor.

```text
Auditor → observes → reconstructs → evaluates → produces findings
```

It must **not** silently change system state, revoke authority, execute rollback, reject decisions, authorize actions, rewrite history, or mutate evidence.

`AUDIT FINDING ≠ DECISION ≠ AUTHORIZATION ≠ EXECUTION`

Remediation and advisory metadata may recommend investigation, policy review, rollback consideration, or human review. Consequential actions pass through the normal governed Core lifecycle.

## Conceptual model

```text
Governed history + Evidence + Authority + Policy + Decision
        + Execution + Outcome + Evaluation
                ↓
        AuditGovernedStateView (read-only adapter)
                ↓
        runAuditEngagement (AuditorRunner)
                ↓
    Findings + AuditReport + optional resolutions
```

## Entities

| Entity | Purpose |
|--------|---------|
| `AuditScope` | Boundaries — subject, time range, governance artifact ref |
| `AuditTarget` | Subject/resource under audit |
| `AuditEngagement` | Governed audit session |
| `AuditFinding` | Immutable observation with rule identity, fingerprint, governance refs |
| `AuditFindingResolution` | Append-only status transition (original finding preserved) |
| `AuditReport` | Aggregated findings, severity summary, evaluator versions |

## State view (not a second governance model)

`buildAuditGovernedStateView` / `buildAuditGovernedStateViewFromTraceInput` normalize existing artifacts:

- `DecisionTrace` / `TraceInput`
- `GovernanceLedger` events (`eventId`)
- Evidence, policy, authority, execution, outcome, evaluation refs

`stateFingerprint` binds audit results to immutable governed state for determinism.

## Extension point

```typescript
interface AuditRuleEvaluator {
  readonly ruleId: string;
  readonly version?: string;
  readonly deterministic?: boolean;
  appliesTo?(input: AuditRuleEvaluationInput): boolean;
  evaluate(input: AuditRuleEvaluationInput): AuditRuleEvaluationResult;
}
```

`AuditRuleEvaluationInput` includes `stateView`, optional `trace`, and product `context` metadata (domain meaning stays in adapters).

## Runner

`runAuditEngagement` — MIT audit mechanism:

- Runs applicable evaluators
- Optional fingerprint deduplication
- Produces findings and `AuditReport`
- Records evaluator rule IDs and versions on the report
- **No governed-state mutation**

## Persistence

`AuditArtifactStore` interface + `InMemoryAuditArtifactStore` reference implementation. Products persist engagements, findings, resolutions, and reports in their own storage. Core does not require Prisma, PostgreSQL, or product databases.

## Evaluation bridge

`isEvaluationCandidateFromFinding` — significant findings **may** become evaluation corpus candidates via a **separate governed admission**. Audit does not auto-insert into Evaluation Corpus.

```text
AUDIT discovers anomalies
EVALUATION judges performance against reference cases
```

## Continuous audit compatibility

Snapshot audit (bounded state once) and continuous audit (incremental `traces` on state view) are both supported. No scheduler or enterprise monitoring in Core.

## Cross-product validation (CORE-AUDITOR-01)

Validated via test fixtures (not production deployment):

| Pattern | Representative rules |
|---------|------------------------|
| Quinté Lab | decision-time evidence, provenance chain, market blindness |
| Research Engine | disposition/evidence support, authority at decision time |
| Trading Bot | execution chain reconstruction, outcome evaluation loop |
| JipComply | temporal rule version, mandatory evidence gates |

Domain semantics live in product adapters / test fixtures only.

## Open-core boundary

MIT Core: contracts, runner, findings, reports, evaluator interfaces, trace integration, persistence interfaces, conformance tests.

Proprietary (external packages): learned anomaly detection, failure-pattern intelligence, proprietary heuristics, managed continuous audit, enterprise analytics.

Validated structurally via test-only proprietary evaluator consuming Core interfaces without Core importing proprietary code.

## Promotion

See [AUDITOR-PROMOTION-CRITERIA.md](./AUDITOR-PROMOTION-CRITERIA.md). CORE-AUDITOR-01 may declare `AUDITOR_PROMOTION_CANDIDATE`; stable promotion requires a separate approved chantier.

## Stability

Experimental — `@jiplabs/core/experimental` only. Not on stable root barrel.

## Related

- [ADR-001 Open-Core Strategy](../../decisions/ADR-001-JIPLABS-CORE-OPEN-CORE-STRATEGY-V1.md)
- [CAPABILITY-CLASSIFICATION](../../CAPABILITY-CLASSIFICATION.md)
- CORE-00: `assertHistoricalAuditSelfContained`, `buildDecisionTrace`
