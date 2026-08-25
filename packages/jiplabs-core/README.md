# @jiplabs/core

Governance kernel for governed autonomous systems.

**Status:** 0.1.0 · **License:** MIT · **Node:** >=22.5.0

This package is domain-agnostic. JipComply, Quinté Lab, and future JipLabs products consume it through adapters; the package itself contains **no** product-specific domain logic.

## What it is

A domain-agnostic governance kernel for governed autonomous systems.

### Core lifecycle

```
Proposal
  → Authority
  → Policy
  → Decision
  → Action Authorization
  → Execution
  → Outcome
  → Evaluation
  → Disposition / Rollback
```

### Core principles

- Authority is explicit — no implicit global power.
- Human approval is policy-driven, not globally required.
- Human override remains available when authorized.
- Decisions and execution are separate stages.
- Rollback is first-class.
- History is append-only.
- Historical decisions are reconstructable from ledger evidence.
- Ambiguous external side effects fail closed.
- Domain semantics remain outside Core (injected adapters).

## Current status

| Milestone | Scope |
|---|---|
| **CORE-00** | Governance constitution — contracts for actors, authority, policies, evidence, decisions, rollback, override, ledger, trace |
| **CORE-01** | Governor Kernel — operational runtime, action authorization, human approval, rollback execution, idempotency, recovery |
| **CORE-02** | Durable governance state — SQLite persistence, restart recovery, replay, reconciliation, integrity verification, migrations |
| **CORE-03** | Evaluation corpus — case admission, suites, baselines, regression detection, learning signals, governance recommendations |

CORE-04 and beyond are not included in this release.

## Install

```bash
npm install @jiplabs/core
```

## Minimal usage

Domain-agnostic example showing actor, authority grant, policy, proposal, evidence, kernel, domain executor, and outcome evaluator:

```typescript
import {
  activatePolicyVersion,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createDecisionProposal,
  createEvidence,
  createPolicyVersion,
  GovernorKernel,
  InMemoryGovernanceLedger,
  type DomainAdapterBundle,
  type PolicyGate,
} from "@jiplabs/core";

const AT = new Date().toISOString();
const provenance = { actorId: "bootstrap", source: "example" };
const resource = { domain: "example-domain", resourceType: "entity" };

const actor = createActor({
  id: "governor-1",
  type: "DOMAIN_GOVERNOR",
  code: "example-governor",
  scopes: ["example-domain"],
  createdAt: AT,
  provenance,
});

const authority = createAuthority({
  id: "auth-1",
  code: "EXAMPLE_EXECUTE",
  scopes: ["EXECUTE_ACTION"],
  createdAt: AT,
  provenance,
});

const grant = createAuthorityGrant({
  id: "grant-1",
  actorId: actor.id,
  authority,
  scopes: ["EXECUTE_ACTION"],
  resource,
  validFrom: AT,
  validUntil: "2027-01-01T00:00:00.000Z",
  issuerActorId: "issuer",
  createdAt: AT,
  provenance,
});

const gate: PolicyGate = {
  id: "g1",
  code: "readiness",
  operator: "EQ",
  expected: "PASS",
  mandatory: true,
  evidenceKind: "readiness",
};

const policyVersion = activatePolicyVersion(
  createPolicyVersion({
    id: "pv-1",
    policyId: "policy-1",
    version: "1.0.0",
    domain: "example-domain",
    decisionType: "EXAMPLE",
    createdAt: AT,
    provenance,
    applicableActorAuthority: [actor.code],
    requiredAuthorityScope: "EXECUTE_ACTION",
    requiredEvidence: ["readiness"],
    gates: [gate],
    decisionOutcomes: { onPass: "APPROVE", onFail: "REJECT" },
    failureBehavior: "BLOCK",
    rollbackRequirements: { required: false },
    overrideRules: {
      humanOverrideAvailable: true,
      requiredAuthorityScope: "OVERRIDE_DECISION",
    },
    autonomyMode: "AUTONOMOUS",
    effectiveFrom: AT,
  }),
  AT,
);

const evidence = [
  createEvidence({
    id: "ev-1",
    kind: "readiness",
    subject: { type: "entity", id: "entity-1", domain: "example-domain" },
    observationRefs: ["obs-1"],
    value: "PASS",
    evaluatorActorId: "evaluator-1",
    createdAt: AT,
    provenance,
  }),
];

const proposal = createDecisionProposal({
  id: "prop-1",
  actorId: actor.id,
  action: "EXECUTE",
  subject: { type: "entity", id: "entity-1", domain: "example-domain" },
  policyId: "policy-1",
  policyVersion: "1.0.0",
  domain: "example-domain",
  decisionType: "EXAMPLE",
  evidenceRefs: ["ev-1"],
  createdAt: AT,
  provenance,
});

const adapter: DomainAdapterBundle = {
  domain: "example-domain",
  observationProvider: {
    domain: "example-domain",
    fetchObservations: () => [],
  },
  policyProvider: {
    domain: "example-domain",
    resolvePolicyVersion: () => policyVersion,
  },
  evidenceProvider: {
    domain: "example-domain",
    collectEvidence: () => evidence,
  },
  actionExecutor: {
    domain: "example-domain",
    execute: async () => ({ status: "EXECUTED", resultRef: "result-1" }),
  },
  outcomeEvaluator: {
    domain: "example-domain",
    evaluate: () => ({ verdict: "CORRECT", rationale: "Expected outcome" }),
  },
};

const kernel = new GovernorKernel({
  ledger: new InMemoryGovernanceLedger(),
});

const result = await kernel.run({
  idempotencyKey: "idem-1",
  ids: {
    runId: "run-1",
    decisionId: "run-1:decision",
    explanationId: "run-1:explanation",
    actionRequestId: "run-1:action-request",
    authorizationId: "run-1:authorization",
    actionResultId: "run-1:action-result",
    outcomeId: "run-1:outcome",
    evaluationId: "run-1:evaluation",
  },
  actor,
  executorActorId: "executor-1",
  authority,
  grant,
  proposal,
  policyVersion,
  evidence,
  rollbackPlan: null,
  resource,
  adapter,
  at: AT,
  provenance,
});

console.log(result.state, result.ok);
```

For durable persistence across restarts, use `openNodeSqliteGovernanceStorage` (Node >=22.5 with `node:sqlite`).

## Public API (0.1.0)

| Area | Exports |
|---|---|
| Constitution | Actors, authority, policies, evidence, decisions, actions, outcomes, rollback, override |
| Ledger & trace | `InMemoryGovernanceLedger`, trace reconstruction, append-only assertions |
| Governor Kernel | `GovernorKernel`, run store interfaces, recovery checkpoints, idempotency fingerprints |
| Authorization & execution | `GovernedActionAuthorization`, `executeGovernedAction`, binding assertions |
| Domain adapters | `DomainAdapterBundle` and related port interfaces |
| Durable state | `openNodeSqliteGovernanceStorage`, replay, integrity verification, reconstruction |

Import only from `@jiplabs/core`. Deep imports into `dist/` subpaths are not part of the supported contract.

## Non-goals

- Product-specific compliance or domain rule packs
- LLM reasoning or external service orchestration
- Control plane or SaaS API
- CORE-03+ capabilities not yet implemented

## Compatibility

See [CHANGELOG.md](./CHANGELOG.md) for version history and the 0.x compatibility policy.

## Development

From the repository root:

```bash
pnpm install
pnpm test
pnpm build
pnpm lint
```

## Tests

```bash
pnpm --filter @jiplabs/core test
```
