# CORE-03 — Evaluation Corpus & Governed Learning Loop

## Principle

Evaluation is accumulated operational knowledge — not merely software testing.

```
Failure → Understanding → Reference Case → Permanent Evaluation
  → Regression Detection → Better Future Governance
```

CORE-03 does **not** train models, fine-tune LLMs, rewrite policies, or expand authority automatically.

## Scope

| In scope | Out of scope (CORE-04+) |
|---|---|
| Evaluation case candidates & admission | Model/agent routing |
| Versioned evaluation cases & suites | Champion promotion |
| Evaluation runs (observational) | Automatic policy amendment |
| Baselines & regression comparison | LLM calls |
| Learning signals (evidence) | Automatic authority changes |
| Governance recommendations (non-decisions) | Product-specific rule packs |

## Module

`src/evaluation-corpus/`

- **EvaluationCorpus** — orchestrator for corpus lifecycle
- **EvaluationCorpusStore** — persistence port (in-memory + SQLite via `corpusStore`)
- **EvaluationCaseEvaluator** / **EvaluationTargetRunner** — domain ports

## Persistence

Migration `002_evaluation_corpus` adds `evaluation_corpus_entities` table.

SQLite bundle: `openNodeSqliteGovernanceStorage(...).corpusStore`

Schema version: `PERSISTENCE_SCHEMA_VERSION = 2`

## Ledger events

Append-only governance ledger events include:

- `EVALUATION_CASE_CANDIDATE_RECORDED`
- `EVALUATION_CASE_ADMITTED` / `REJECTED` / `QUARANTINED`
- `EVALUATION_CASE_VERSION_ACTIVATED`
- `EVALUATION_SUITE_VERSION_ACTIVATED`
- `EVALUATION_RUN_STARTED` / `COMPLETED`
- `BASELINE_ESTABLISHED`
- `REGRESSION_DETECTED`
- `LEARNING_SIGNAL_RECORDED`
- `GOVERNANCE_RECOMMENDATION_CREATED`

## Public API

Exported from `@jiplabs/core` under evaluation-corpus symbols (see package README).

Import only from `@jiplabs/core` — not from internal `dist/` subpaths.
