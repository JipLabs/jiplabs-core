# Regression & Learning Signals

## RegressionComparison

Deterministic comparison between a **candidate EvaluationRun** and a compatible **EvaluationBaseline**.

Compatibility requires matching `suiteId` + `suiteVersion` and compatible target lineage.

Assessments:

| Assessment | Meaning |
|---|---|
| IMPROVED | Pass rate up and/or fail rate down |
| UNCHANGED | Within configured thresholds |
| REGRESSED | Pass rate down or fail rate up beyond threshold |
| MIXED | Opposing metric movement |
| INCOMPARABLE | Suite/target mismatch or missing metrics |
| INSUFFICIENT_DATA | No case results |

Thresholds come from explicit `RegressionConfig` — not hard-coded domain logic.

## LearningSignal

Structured evidence derived from evaluation outcomes. Examples:

- `REGRESSION_DETECTED`
- `IMPROVEMENT_DETECTED`
- `NEW_FAILURE_PATTERN`
- `RECURRENT_FAILURE`

Learning signals are **evidence** — they do not modify policy, authority, or production behavior.

## GovernanceRecommendation

Structured guidance such as:

- `INVESTIGATE`
- `ADD_EVALUATION_CASES`
- `EXPAND_TEST_COVERAGE`
- `NO_CHANGE`

A recommendation is **not** a decision. It cannot directly mutate Policy, AuthorityGrant, or routing.

## Replay & observational mode

- Evaluation runs set `observationMode: true`
- Re-running a target creates a **new** EvaluationRun
- Historical results are never silently replaced
- Pure evaluation must not invoke `DomainActionExecutor` production side effects
