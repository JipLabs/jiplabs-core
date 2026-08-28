# @jiplabs/core

Governance kernel for governed autonomous and semi-autonomous systems.

**Status:** `1.0.0` (first stable release) · **License:** MIT · **Node:** >=22.5.0

This package is domain-agnostic. Product adapters depend on Core. Core does not depend on any product.

---

## What problem this solves

When software **observes, decides, and acts**, those steps are easy to collapse: a model output becomes an action; a successful write becomes “the right decision.” That is unsafe for autonomous systems.

`@jiplabs/core` makes the following distinctions **explicit, enforceable, and reconstructable**:

- who may decide (authority)
- under which rules (policy + version)
- based on what was known (evidence)
- what was intended (proposal) vs what was decided (decision)
- whether an action was authorized
- what actually happened (outcome)
- whether that outcome was correct (evaluation)
- how humans intervene (override / rollback) without rewriting history

## When to use it

Use Core when a system must **govern decisions** — especially if those decisions may later be audited, replayed, evaluated, overridden, or rolled back.

Typical adapters: predictive/autonomous product loops, regulatory/compliance promotion, any domain that needs authority-bound policy gates.

## When not to use it

Do **not** use Core as:

- an AI model or agent framework
- a workflow/orchestration product
- a domain rule engine (your product still owns domain semantics)
- a database (SQLite here is a reference persistence adapter)
- an application framework
- a guarantee that the domain model is correct

Core governs the **decision process**. It does not make a horse race, a tax rule, or a forecast true.

---

## Install

```bash
npm install @jiplabs/core
```

Import only from `@jiplabs/core`. Deep imports into `dist/` are not part of the contract.

CORE-03 (evaluation corpus) and CORE-04 (component registry) are **experimental**. Prefer `@jiplabs/core/experimental` when you depend on them deliberately. They remain available from the root for 0.3.0 compatibility.

---

## Governance lifecycle

```text
Observation / Evidence
→ Proposal
→ Authority Check
→ Policy Evaluation
→ Decision
→ Action Authorization
→ Action
→ Outcome
→ Evaluation
→ Keep / Follow-up / Rollback
```

A proposal is not a decision. A decision is not an execution. Execution success is not decision correctness.

---

## Smallest working example (authorize-only)

This is the path real product adapters use. It produces a **Decision**. It does not execute a domain action.

```typescript
import {
  activatePolicyVersion,
  buildDecisionTrace,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createDecisionProposal,
  createEvidence,
  createPolicyVersion,
  evaluateDomainDecisionAuthorization,
} from "@jiplabs/core";

const AT = "2026-08-25T12:00:00.000Z";
const provenance = { actorId: "governor-1", source: "example" };
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
  code: "EXAMPLE_DECIDE",
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
  validUntil: null,
  issuerActorId: "issuer",
  createdAt: AT,
  provenance,
});

const policyVersion = activatePolicyVersion(
  createPolicyVersion({
    id: "pv-1",
    policyId: "example-policy",
    version: "1.0.0",
    domain: "example-domain",
    decisionType: "EXAMPLE",
    createdAt: AT,
    provenance,
    applicableActorAuthority: [actor.code],
    requiredAuthorityScope: "EXECUTE_ACTION",
    requiredEvidence: ["readiness"],
    gates: [{
      id: "g1",
      code: "readiness",
      operator: "EQ",
      expected: "PASS",
      mandatory: true,
      evidenceKind: "readiness",
    }],
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
  policyId: policyVersion.policyId,
  policyVersion: policyVersion.version,
  domain: "example-domain",
  decisionType: "EXAMPLE",
  evidenceRefs: ["ev-1"],
  createdAt: AT,
  provenance,
});

const result = evaluateDomainDecisionAuthorization({
  adapter: {
    domain: "example-domain",
    observationProvider: { domain: "example-domain", fetchObservations: () => [] },
    policyProvider: { domain: "example-domain", resolvePolicyVersion: () => policyVersion },
    evidenceProvider: { domain: "example-domain", collectEvidence: () => evidence },
  },
  actor,
  authority,
  grant,
  proposal,
  policyVersion,
  evidence,
  resource,
  at: AT,
  decisionId: "dec-1",
  explanationId: "exp-1",
});

if (result.ok) {
  const trace = buildDecisionTrace({
    id: "trace-1",
    decisionId: result.decision.id,
    createdAt: AT,
    provenance,
    proposal,
    decision: result.decision,
    explanation: result.explanation,
    policyVersion,
    evidence,
  });
  console.log(result.decision.decisionValue, trace.policyId);
}
```

Adapters may supply evidence directly. `fetchObservations` may return `[]` when observations are already bound into evidence.

Persist `result.decision.governanceSnapshot` plus the evidence values used at `at` if you will later reconstruct or compare historically. Use `reconstructDecisionFromSnapshot`. Do not replay against **current** evidence and call that the original decision.

## Full lifecycle (Governor Kernel)

`GovernorKernel` is the stable **full-lifecycle** runtime: decision **and** governed execution, outcomes, evaluation, disposition, rollback. Use it when Core should run the action executor. It is not required for authorize-only integrations.

See [docs/INTEGRATION-GUIDE.md](../../docs/INTEGRATION-GUIDE.md).

---

## What Core guarantees

- Authority is explicit. No implicit global power.
- Policy is versioned; activated versions are immutable; supersession preserves history.
- Decisions bind policy/authority/evidence snapshots.
- History is append-only. Override and revocation do not rewrite an earlier valid event.
- Human approval is **policy-driven**, not globally required. Humans operate **on** the loop.
- Domain semantics stay in adapters.

## What Core does not guarantee

- That a domain prediction, compliance assessment, or model is correct
- That a product persisted Core snapshots (that is adapter work)
- Stable SemVer for **experimental** exports (CORE-03, CORE-04)
- Production maturity of every optional subsystem equally — authorize-only is empirically proven; kernel durable execution is proven in tests; component governance is experimental

---

## Stable vs experimental

| Surface | Status | Import |
|---|---|---|
| Constitution, authority, policy, evidence, proposal/decision, authorize-only API, kernel, ledger/trace, durable SQLite adapter | **STABLE_1_0** | `@jiplabs/core` |
| Evaluation corpus (CORE-03) | **EXPERIMENTAL** | `@jiplabs/core/experimental` (also on root) |
| Component / responsibility registry (CORE-04) | **EXPERIMENTAL** | `@jiplabs/core/experimental` (also on root) |

See [docs/API-STABILITY.md](../../docs/API-STABILITY.md).

---

## Deeper documentation

| Topic | Location |
|---|---|
| Architecture | [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) |
| Integration | [docs/INTEGRATION-GUIDE.md](../../docs/INTEGRATION-GUIDE.md) |
| Compatibility / SemVer | [docs/COMPATIBILITY.md](../../docs/COMPATIBILITY.md) |
| 0.3.0 → 1.0 migration | [docs/MIGRATION-0.3-TO-1.0.md](../../docs/MIGRATION-0.3-TO-1.0.md) |
| Constitution | [docs/jiplabs-core/CORE-00-CONSTITUTION.md](../../docs/jiplabs-core/CORE-00-CONSTITUTION.md) |
| API inventory | [docs/API-INVENTORY.md](../../docs/API-INVENTORY.md) |

---

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm lint
```
