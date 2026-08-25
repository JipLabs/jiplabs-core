# Evaluation Suites & Baselines

## EvaluationSuite / EvaluationSuiteVersion

- Groups `EvaluationCaseVersion` refs
- Suite version is immutable once activated
- New suite versions supersede; old versions are never rewritten
- Content hash covers sorted case-version refs

## EvaluationTarget

Domain-agnostic identity:

- `targetId`, `targetType`, `version`
- Optional `code`, `artifactHash`, `runtimeMetadata`
- No model-provider-specific fields

## EvaluationRun binding

Each run binds exactly:

- target/version
- suite/version
- case versions
- evaluator identity/version
- configuration
- idempotency key + run fingerprint

Repeated identical idempotency + fingerprint → deterministic replay of stored result.

## EvaluationBaseline

Immutable record binding:

- target/version (at establishment)
- suite/version
- source evaluation run + summary metrics
- `establishedAt`, optional governing decision ref
- New baseline **supersedes** — never rewrites history

## EvaluationSummary

Deterministic aggregation from case results:

- pass/fail/partial/inconclusive/not-evaluable/error counts
- pass_rate, fail_rate, pass_count, fail_count metrics
- Reconstructable from immutable case results
