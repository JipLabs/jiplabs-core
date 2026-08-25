# @jiplabs/core

JipLabs Core **CORE-00** — domain-agnostic governance constitution and contracts.

This package defines the foundational contracts for governed autonomous systems:

**Observe → Reason → Decide → Authorize → Act → Evaluate → Govern**

CORE-00 is contracts and minimal deterministic evaluation only. The autonomous runtime kernel is **CORE-01** (not included here).

## Principles

- Domain-agnostic: no horse-racing, compliance, or product-specific logic in `src/`
- Humans on the loop, not routinely in the loop
- Explicit authority — no implicit global power
- Versioned, immutable policies once activated
- Append-only governance ledger
- First-class rollback and human override (override never erases history)

## Package layout

```
src/
  actors/       Actor identity and scopes
  authority/    Authority catalog, grants, evaluation
  policies/     Policy versions, gates, autonomy modes
  evidence/     Evidence and observation refs
  decisions/    Proposal, decision, explanation
  actions/      Action request, authorization, result
  outcomes/     Outcome and evaluation
  rollback/     Rollback plan and execution
  override/     Human override and interventions
  ledger/       Append-only governance ledger contract
  trace/        Decision trace reconstruction
  domain/       Domain adapter interfaces
tests/
  core00.test.ts
  fixtures/     Contract-only domain examples (not production)
```

## Usage

```typescript
import {
  createActor,
  createAuthority,
  createAuthorityGrant,
  createPolicyVersion,
  activatePolicyVersion,
  evaluateDecisionProposal,
} from "@jiplabs/core";
```

## Non-goals (CORE-00)

- No autonomous execution kernel
- No LLM reasoning
- No external API integration
- No production domain coupling

## Tests

```bash
pnpm install
pnpm test
```
