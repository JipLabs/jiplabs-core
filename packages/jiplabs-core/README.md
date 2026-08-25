# @jiplabs/core

Governance kernel for governed autonomous systems.

**Status:** 0.3.0 · **License:** MIT · **Node:** >=22.5.0

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

Operational failures can become permanent evaluation cases through the CORE-03 evaluation corpus (see below).

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
| **CORE-00** | Governance constitution — actors, authority, policies, evidence, decisions, rollback, override, ledger, trace |
| **CORE-01** | Governor Kernel — operational runtime, action authorization, human approval, rollback execution, idempotency, recovery |
| **CORE-02** | Durable governance state — SQLite persistence, restart recovery, replay, reconciliation, integrity verification, migrations |
| **CORE-03** | Evaluation corpus — permanent evaluation cases, versioned suites, targets/runs, baselines, regression comparison, learning signals, governance recommendations |
| **CORE-04** | Agent, model & responsibility governance — governed components, capability declarations, qualification, eligibility, responsibility assignment, selection/fallback |

CORE-05 and beyond are not included in this release.

### CORE-03 — Evaluation Corpus

CORE-03 converts operational outcomes into durable, versioned evaluation knowledge:

- **Permanent evaluation cases** — admitted from candidates with provenance preserved
- **Versioned evaluation suites** — immutable once activated
- **Evaluation targets and runs** — observational mode only
- **Baselines** — immutable reference runs for comparison
- **Regression comparison** — deterministic IMPROVED / UNCHANGED / REGRESSED / INCOMPARABLE assessments
- **Learning signals** — structured evidence (e.g. regression detected)
- **Governance recommendations** — guidance such as investigate or expand coverage

Learning signals and governance recommendations **do not** automatically rewrite policies, authority grants, or production behavior. They are inputs to governed decision paths — not self-modification.

### CORE-04 — Agent, Model & Responsibility Governance

CORE-04 governs which agents, models, and other intelligence components may receive which responsibilities:

- **GovernedComponent** — generic abstraction (AGENT, MODEL, RULE_ENGINE, …)
- **CapabilityDeclaration** — namespaced capability claims (not authority)
- **QualificationRecord** — evidence-backed qualification (consumes CORE-03 evaluation evidence)
- **ResponsibilityEligibility** — deterministic eligibility evaluation
- **ResponsibilityAssignment** — governed assignment (separate from execution)
- **Component selection & fallback** — policy-driven, provider-neutral

Capability claims, qualifications, and recommendations **do not** automatically grant authority or assign responsibility. Assignment requires explicit authority and policy. Regression signals may propose demotion but cannot bypass governance.

> **Identity is not authority.**  
> **Capability is not qualification.**  
> **Qualification is not assignment.**  
> **Assignment is not action authorization.**

Core does not call or depend on any specific LLM provider.

## Install

```bash
npm install @jiplabs/core
```

## Minimal usage (Governor Kernel)

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
  observationProvider: { domain: "example-domain", fetchObservations: () => [] },
  policyProvider: { domain: "example-domain", resolvePolicyVersion: () => policyVersion },
  evidenceProvider: { domain: "example-domain", collectEvidence: () => evidence },
  actionExecutor: {
    domain: "example-domain",
    execute: async () => ({ status: "EXECUTED", resultRef: "result-1" }),
  },
  outcomeEvaluator: {
    domain: "example-domain",
    evaluate: () => ({ verdict: "CORRECT", rationale: "Expected outcome" }),
  },
};

const kernel = new GovernorKernel({ ledger: new InMemoryGovernanceLedger() });

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

## Minimal usage (Evaluation Corpus)

```typescript
import {
  EvaluationCorpus,
  InMemoryEvaluationCorpusStore,
  createEvaluationCaseCandidate,
} from "@jiplabs/core";

const AT = new Date().toISOString();
const provenance = { actorId: "evaluator", source: "example" };

const corpus = new EvaluationCorpus({
  store: new InMemoryEvaluationCorpusStore(),
  at: AT,
  provenance,
});

corpus.addCandidate(
  createEvaluationCaseCandidate({
    id: "cand-1",
    candidateId: "cand-1",
    domain: "example-domain",
    title: "Reference failure case",
    provenance: { sourceKind: "MANUAL_REFERENCE" },
    inputContextRefs: [],
    evidenceRefs: [],
    createdAt: AT,
    provenanceEnvelope: provenance,
  }),
);
```

For durable persistence across restarts, use `openNodeSqliteGovernanceStorage` (Node >=22.5 with `node:sqlite`). The returned bundle includes `corpusStore` for evaluation history (schema migration 002).

## Public API

| Area | Exports |
|---|---|
| Constitution | Actors, authority, policies, evidence, decisions, actions, outcomes, rollback, override |
| Ledger & trace | `InMemoryGovernanceLedger`, trace reconstruction, append-only assertions |
| Governor Kernel | `GovernorKernel`, run store interfaces, recovery checkpoints, idempotency fingerprints |
| Authorization & execution | `GovernedActionAuthorization`, `executeGovernedAction`, binding assertions |
| Domain adapters | `DomainAdapterBundle` and related port interfaces |
| Durable state | `openNodeSqliteGovernanceStorage`, replay, integrity verification, reconstruction |
| Evaluation corpus | `EvaluationCorpus`, case admission, suites, baselines, regression, learning signals |

Import only from `@jiplabs/core`. Deep imports into `dist/` subpaths are not part of the supported contract.

## Non-goals

- Product-specific compliance or domain rule packs
- LLM reasoning or external service orchestration
- Automatic policy or authority mutation from learning signals
- Agent/model routing (CORE-04)
- Control plane or SaaS API

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
