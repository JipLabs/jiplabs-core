# Evaluation Case Lifecycle

## Stages

```
Operational outcome
  → EvaluationCaseCandidate (pending)
  → EvaluationCaseAdmission (ADMIT | REJECT | QUARANTINE | NEEDS_REVIEW)
  → EvaluationCase + EvaluationCaseVersion (on ADMIT)
  → EvaluationSuiteVersion ref
  → EvaluationRun case result
```

## Candidate

- Origins: incorrect/partial evaluation, rollback, failed action, human challenge/override, reconciliation incident, manual reference, domain failure signal
- Preserves **refs/hashes** to decision, action, outcome, evaluation, evidence, trace — not full record copies
- **Fingerprint** for deterministic deduplication

## Admission

- Candidate ≠ permanent case
- Human approval is **policy-driven**, not globally required
- Authority evaluation reuses CORE-00/CORE-01 patterns
- Admission history is append-only (ledger + store)

## Case version

- Immutable once **activated**
- Corrections create **new versions** with `supersedes` link
- Original versions remain reconstructable

## Permanent evaluation invariant

An admitted, activated case remains reusable across future compatible evaluation runs and target versions.
