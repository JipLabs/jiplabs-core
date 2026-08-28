# Migration — @jiplabs/core 0.3.0 → 1.0

## Compatibility stance

0.3.0 had no strict SemVer promise. 1.0 **keeps** the 0.3.0 root export set and adds:

- explicit experimental classification (CORE-03, CORE-04)
- `@jiplabs/core/experimental` subpath
- `createFallbackRelationship` / `createReplacementProposal` on the root (experimental)
- stability helpers: `CORE_EXPERIMENTAL_EXPORTS`, `isCoreExperimentalExport`, `coreApiStability`

No 0.3.0 root export is removed in `1.0.0`.

## Product adapters (Quinté Lab, JipComply)

Current adapters import `evaluateDomainDecisionAuthorization` and related factories from `@jiplabs/core`. **That import path remains valid.**

Recommended, non-breaking, optional steps:

1. Keep authorize-only. Do not migrate onto `GovernorKernel` unless you want Core-managed execution.
2. Persist `decision.governanceSnapshot` + evidence values at decision time; use `reconstructDecisionFromSnapshot` for historical compare (fixes JipComply `DATA_EVIDENCE_GAP` without a Core change).
3. Call `buildDecisionTrace` instead of (or in addition to) a product-only trace blob.
4. If you use `EvaluationCorpus` / `GovernedComponentRegistry`, switch imports to `@jiplabs/core/experimental` when convenient. Root re-exports remain.
5. Policy `onPass` strings are product vocabulary. If live observation is “retain”, set `onPass` to retain semantics rather than remapping Core outcomes after the fact.

## Types: Outcome vs OutcomeRecord

No removal. Use:

- `Outcome` / `Evaluation` for constitutional records
- `OutcomeRecord` / `CoreEvaluation` for kernel runtime records

## Packaging

- `engines.node`: `>=22.5.0` (unchanged)
- New export: `@jiplabs/core/experimental`
- Still zero runtime dependencies

## Git tag for 0.3.0

The published npm `0.3.0` corresponds to commit `fe51dbb6184d54c3445e5a63ad1b31dee73c3536`. Local tag `@jiplabs/core-v0.3.0` points at that commit. `@jiplabs/core-v1.0.0` tags the 1.0.0 release commit.
