# Responsibility Governance

## Responsibility model

A **Responsibility** represents work Core may assign to an eligible governed component:

- Required capabilities (namespaced, extensible)
- Required qualifications (evidence requirements)
- Required authority scopes
- Resource/domain scope, constraints, effective period

Domain semantics (what “assess evidence” means in JipComply vs Quinté) remain outside Core.

## Eligibility vs assignment

**Eligibility** answers: can component X receive responsibility Y **now**?

Outcomes: `ELIGIBLE`, `ELIGIBLE_WITH_RESTRICTIONS`, `INELIGIBLE`, `HUMAN_APPROVAL_REQUIRED`, `EVALUATION_REQUIRED`, `SUSPENDED`.

**Assignment** is a separate governed act. Eligible ≠ assigned.

## Assignment modes

`FULL`, `CANARY`, `SHADOW`, `PROBATION`, `READ_ONLY`, `VALIDATOR_ONLY`

Policy determines which modes are permitted — no global mandatory canary.

## Human approval

Human approval is **policy-driven**, not globally required. High-risk responsibilities may require `HUMAN_APPROVAL_REQUIRED` before assignment activates.

## Promotion / demotion

Transitions (`PROMOTE_RESPONSIBILITY`, `REDUCE_RESPONSIBILITY`, `SUSPEND`, `RESTORE`, `DISQUALIFY`) are governed decisions.

CORE-03 regression evidence → LearningSignal → GovernanceRecommendation → **proposal** → Authority → Policy → Decision → demotion.

Recommendations never bypass governance.

## Historical vs current

A component qualified yesterday remains attributable to decisions made then, even if disqualified today. New responsibility requires current eligibility.

## Suspension

Suspended components cannot receive new assignments. Historical assignments and qualifications remain in the registry for audit.
