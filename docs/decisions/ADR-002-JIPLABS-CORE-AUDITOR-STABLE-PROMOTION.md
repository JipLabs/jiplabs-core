# ADR-002 — JipLabs Core Auditor Stable Promotion

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-09-01 |
| Chantier | CORE-AUDITOR-02 |
| Supersedes | — (experimental Auditor foundation from CORE-IP-01 / CORE-AUDITOR-01) |

## Context

The Auditor primitive was introduced as `@jiplabs/core/experimental` (`AUDITOR_PROMOTION_CANDIDATE`). Evidence:

| Source | Outcome |
|--------|---------|
| CORE-AUDITOR-01 | `CROSS_PRODUCT_AUDITOR_VALIDATED` — four heterogeneous fixture domains |
| Quinté Lab (Integration #1) | `QL_AUDITOR_PRODUCTION_VALIDATED` |
| JipComply (Integration #2) | `JIPCOMPLY_AUDITOR_PRODUCTION_VALIDATED` |
| Promotion criterion 8 | Met — two real product integrations |

Neither product integration required Core semantic changes. Both used metadata/bundle `AuditGovernedStateView` adapters and external `AuditRuleEvaluator` rules.

## Decision

**Promote** the bounded Auditor surface to stable `@jiplabs/core` at **1.1.0** (additive, non-breaking).

### Stable exports (`STABLE_1_1`)

Contracts, factories, runner, governed-state view builder, fingerprint helpers, resolution helpers, report helpers, `AuditArtifactStore`, and `InMemoryAuditArtifactStore` reference implementation.

See `CORE_STABLE_1_1_AUDITOR_EXPORTS` in `api-stability.ts`.

### Remain experimental

| Export | Reason |
|--------|--------|
| `buildAuditGovernedStateViewFromTraceInput` | Optional trace path; production integrations used metadata adapters |
| `computeGovernedStateContentHash` | Utility, not required consumer contract |
| `compareFindingStatuses` | Minor helper |
| `isEvaluationCandidateFromFinding` | Evaluation bridge — distinct governed admission |
| `evaluationCaseSourceKindFromFinding` | Evaluation bridge helper |

### Authority boundary

Stable Auditor APIs remain **observation-only**. `runAuditEngagement` and evaluators MUST NOT mutate governed source state. Findings are not decisions, authorizations, or executions.

### State-view decision

`AuditGovernedStateView` + `buildAuditGovernedStateView` are the stable abstraction boundary. Products map domain artifacts into metadata-enriched views without requiring `DecisionTrace` construction.

### Fingerprint semantics

`computeAuditFindingFingerprint` and `computeAuditStateFingerprint` are stable **identity contracts**. Internal canonical serialization may evolve only via evaluator version binding or a future major version. Deterministic evaluators (`deterministic: true`) must produce equivalent fingerprints for identical inputs.

### Finding lifecycle

Effective status is derived from immutable findings + append-only `AuditFindingResolution` events via `getEffectiveFindingStatus`. Mutable `finding.status` on the original record is not rewritten by resolution helpers.

### Open-core

Promotion adds generic MIT contracts only. No proprietary audit intelligence, corpus content, or cross-product learned strategies enter Core.

### SemVer

`1.1.0` — additive stable surface. No breaking changes to `STABLE_1_0` exports.

### Compatibility

`@jiplabs/core/experimental` continues to re-export all Auditor symbols including experimental-only helpers. Existing Quinté Lab and JipComply imports remain valid.

## Promotion criteria results

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Cross-domain applicability | PASS |
| 2 | No domain semantic leakage | PASS |
| 3 | Deterministic behavior | PASS |
| 4 | API coherence | PASS |
| 5 | Historical reconstruction | PASS |
| 6 | Conformance tests | PASS |
| 7 | Open-core boundary | PASS |
| 8 | Two production integrations | PASS |
| 9 | No architectural blocker | PASS |
| 10 | Identity/lifecycle semantics | PASS |

## Known limitations

- Production integrations used file-backed stores; Core does not mandate storage technology.
- Evaluation bridge remains experimental; findings are not auto-promoted to Evaluation Corpus.
- Continuous audit scheduling and enterprise intelligence remain out of scope for MIT Core.

## Consequences

- Consumers may import Auditor from `@jiplabs/core` with `STABLE_1_1` SemVer protection.
- npm publication requires separate `CORE-REL-03` release chantier.
- Future Auditor changes to stable exports require SemVer discipline.
