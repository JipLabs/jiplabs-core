# CORE-04 — Agent, Model & Responsibility Governance

## Purpose

CORE-04 determines which agents, models, and executable intelligence components may receive which responsibilities inside JipLabs governed autonomous systems.

Core governs **qualification and authorization to perform responsibilities** — it is not an LLM provider, agent runtime, or orchestration platform.

## Foundational principle

```
COMPONENT
  → IDENTITY
  → CAPABILITY (declared)
  → QUALIFICATION (evidence-backed)
  → AUTHORITY + POLICY
  → RESPONSIBILITY ELIGIBILITY
  → GOVERNED ASSIGNMENT
```

## GovernedComponent

Generic abstraction supporting:

- `AGENT`, `MODEL`, `RULE_ENGINE`, `DETERMINISTIC_EXECUTOR`, `HYBRID_SYSTEM`, `EXTERNAL_INTELLIGENCE_SERVICE`, `OTHER`

Specializations:

- **AgentIdentity** — runtime/artifact identity, permitted interfaces
- **ModelIdentity** — provider-neutral; provider metadata optional in extensible fields

## Key separation of concerns

| Concept | Meaning |
|---|---|
| CapabilityDeclaration | What a component *claims* it can do |
| QualificationRecord | Evidence that it *may* perform work |
| ResponsibilityEligibility | Whether it *can receive* a responsibility now |
| ResponsibilityAssignment | Governed binding of component to responsibility |
| Execution | Separate — Governor Kernel authorizes domain actions |

## Registry

`GovernedComponentRegistry` provides:

- Component registration and versioning
- Capability declaration
- Qualification recording (append-only history)
- Eligibility evaluation
- Responsibility assignment (with optional human approval)
- Suspension, demotion proposals, replacement proposals
- Deterministic component selection among eligible candidates

## CORE-03 integration

Qualification may require evaluation suite results, baselines, pass rates, or regression evidence from CORE-03. Learning signals and governance recommendations may **propose** demotion — they never directly reduce responsibility.

## Persistence

Migration `003_component_governance` adds `component_governance_entities` table. Schema version 3.

## Public API

See `@jiplabs/core` exports: `GovernedComponentRegistry`, `createAgentIdentity`, `createModelIdentity`, `evaluateResponsibilityEligibility`, etc.
