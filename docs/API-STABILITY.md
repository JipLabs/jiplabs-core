# API stability — @jiplabs/core

## Rules

- **STABLE_1_0** — supported 1.0 contract. Breaking changes require a major version.
- **EXPERIMENTAL** — importable, documented, **not** covered by stable SemVer. May change in a 1.x minor.
- Root barrel `@jiplabs/core` still re-exports experimental symbols so 0.3.0 adapters keep compiling.
- Prefer `@jiplabs/core/experimental` when depending on CORE-03 / CORE-04 deliberately.
- Deep imports (`@jiplabs/core/dist/...`) are unsupported.

Runtime source of truth: `CORE_EXPERIMENTAL_EXPORTS`, `isCoreExperimentalExport()`, `coreApiStability()`.

## Experimental names (root + experimental subpath)

CORE-03 evaluation corpus and CORE-04 component governance, including:

`EvaluationCorpus`, `GovernedComponentRegistry`, `createFallbackRelationship`, `createReplacementProposal`, and the related types/factories listed in `CORE_EXPERIMENTAL_EXPORTS`.

The experimental subpath **also** exports `createLearningSignal` and `createGovernanceRecommendation` (not required on the 0.3.0 root barrel).

## Stable highlights

| Job | Symbol |
|---|---|
| Authorize-only | `evaluateDomainDecisionAuthorization` |
| Full lifecycle | `GovernorKernel` |
| Trace | `buildDecisionTrace`, `answerTraceQuestions` |
| Reconstruct | `reconstructDecisionFromSnapshot` |
| Authority | `createAuthorityGrant`, `evaluateAuthorityGrant`, `revokeAuthorityGrant` |
| Policy | `createPolicyVersion`, `activatePolicyVersion`, `evaluatePolicyGates` |
| Evidence | `createEvidence` |
| Durable store | `openNodeSqliteGovernanceStorage` |

## Two evaluation/outcome types (intentional)

| Layer | Outcome | Evaluation |
|---|---|---|
| Constitution (CORE-00) | `Outcome` / `createOutcome` | `Evaluation` (`KEEP` / `ROLLBACK` / …) |
| Runtime (CORE-01) | `OutcomeRecord` / `createOutcomeRecord` | `CoreEvaluation` (`CORRECT` / `INCORRECT` / …) |

Do not merge them. Map with `outcomeKindFromExecutionStatus` and `mapDomainVerdict`.

## GovernorKernel decision (CORE-STAB-01)

**Option A — stable public low-level/full-lifecycle API.**

Rationale: the kernel is the constitutional runtime; tests and durable execution depend on it; it does not leak a bypass around authority/policy. Products that only authorize should use `evaluateDomainDecisionAuthorization` (also stable). The kernel is **not** experimental and **not** internalized.

## Internalize / deprecate before 1.0

None of the 0.3.0 root exports are removed in 1.0.0. `governDomainDecision` remains deprecated in source and is **not** a package-root export.

## Full inventory

See [API-INVENTORY.md](./API-INVENTORY.md).
