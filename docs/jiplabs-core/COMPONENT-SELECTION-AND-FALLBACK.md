# Component Selection and Fallback

## Selection contract

CORE-04 supports choosing among multiple **eligible** components via `selectEligibleComponent` and `ComponentSelectionPolicy`.

Possible policy inputs (domain-supplied metadata):

- Qualification level
- Cost, latency, reliability scores
- Capability coverage
- Policy preference constraints

Core does **not** hard-code one ranking algorithm. Selection is deterministic given the same inputs and policy.

Core does **not** call LLM or provider APIs.

## Roles

Generic governance roles (not full orchestration):

- PRIMARY, VALIDATOR, FALLBACK, CANARY, SHADOW

## Validator independence

Policy may require independent validation:

- Producer output validated by a different component
- Same component cannot self-validate when policy forbids it
- Provider/family diversity requirements are policy-configurable, not global

## Fallback governance

Fallback components must be:

1. Identified and registered
2. Qualified with evidence
3. Eligible for the responsibility
4. Authorized where policy requires

Arbitrary unqualified fallback is blocked. `recordFallbackRelationship` verifies fallback eligibility before recording.

## Replacement

Replacement proposals compare incumbent vs candidate capability, qualification, and policy requirements. Production responsibility is not silently transferred — governed replacement flow required.

## Provider neutrality

Two components with different provider metadata are governed identically by Core semantics. No provider SDK dependency.
