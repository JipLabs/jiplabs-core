# Component Qualification

## Qualification is evidence-backed

A component is not qualified because it declares a capability or because an operator wishes it so. Qualification requires governed evidence.

## QualificationRequirement kinds

- `EVALUATION_SUITE` — CORE-03 suite @ version
- `BASELINE_COMPARISON`, `PASS_RATE`, `NO_CRITICAL_FAIL`, `NO_REGRESSION`
- `EXTERNAL_CERTIFICATION`, `HUMAN_QUALIFICATION`, `DETERMINISTIC_TEST`
- `DOMAIN_EVIDENCE`, `CANARY_PERIOD`, `CUSTOM`

## QualificationStatus

| Status | Meaning |
|---|---|
| UNASSESSED | No evidence recorded |
| QUALIFIED | Meets requirements |
| QUALIFIED_WITH_RESTRICTIONS | Qualified with limitations |
| PROBATION | Limited responsibility permitted |
| SUSPENDED | Temporarily blocked |
| DISQUALIFIED | Blocked |
| EXPIRED | Validity ended |

## Historical immutability

Qualification records are immutable once recorded. Requalification creates a **new** record and supersedes the prior one — history is never rewritten.

## Expiration

`validFrom` / `validUntil` bound qualification freshness. Expired qualification fails closed for new assignments. Historical actions remain reconstructable.

## Self-qualification blocked

Components cannot self-grant qualification without required evidence and governed recording through the registry.
