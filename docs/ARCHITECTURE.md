# Architecture — @jiplabs/core

## Purpose

JipLabs Core is a **domain-agnostic governance and evaluation foundation**. It records and enforces *how* a system is allowed to decide and act. It does not contain horse-racing, tax, trading, or other vertical logic.

```text
Product
  ↓
Product Adapter / Domain Policy / Evidence Provider / Executor
  ↓
@jiplabs/core
```

Never:

```text
@jiplabs/core
  ↓
Product
```

## Layers

| Layer | Responsibility | 1.0 status |
|---|---|---|
| **Constitution (CORE-00)** | Actor, authority, policy, evidence, proposal, decision, action contracts, override, rollback, ledger, trace | Stable |
| **Authorize-only API** | `evaluateDomainDecisionAuthorization` — decision without Core-managed execution | Stable (primary product path) |
| **Governor Kernel (CORE-01)** | Full lifecycle runtime including execution, claims, recovery | Stable (advanced) |
| **Durable governance (CORE-02)** | SQLite reference store, replay, integrity, migrations | Stable (reference adapter) |
| **Evaluation corpus (CORE-03)** | Permanent cases, suites, observational runs, regression | Experimental |
| **Component registry (CORE-04)** | Agent/model identity, qualification, responsibility assignment | Experimental |

## Kernel vs convenience API

- **`evaluateDomainDecisionAuthorization`** is the high-level **authorize-only** API. Real integrations (predictive shadow governance, compliance readiness) use this.
- **`GovernorKernel`** is the public **full-lifecycle** runtime. It does not bypass safety: execution still requires a fresh authority check, hash-bound authorization, and a domain executor. It is not experimental. It is also not required if the product executes outside Core.

Do not treat kernel use as “more correct” than authorize-only. They serve different jobs.

## Adapters

Products inject:

- observations (optional if evidence is pre-built)
- policy versions
- evidence
- (kernel only) action executor and outcome evaluator

Core evaluates gates against evidence values. Domain meaning of those values stays in the product.

## Durable execution

Attempt lifecycle: `PREPARED` → `STARTED` → `COMPLETED` / `FAILED` / `IN_DOUBT`. Crash-gap recovery uses checkpoints and optional domain reconciliation. SQLite is a **reference** implementation via `node:sqlite`. Products may persist elsewhere if they honor the contracts (snapshots, append-only history).

## Evaluation corpus

Operational failures can become permanent evaluation cases. Learning signals and governance recommendations **do not** automatically mutate policy or authority.

## Registry

Identity ≠ authority. Capability ≠ qualification. Qualification ≠ assignment. Assignment ≠ action authorization.

## Trace

`buildDecisionTrace` reconstructs who / what / when / why from recorded objects. Products that invent their own `trace` JSON should still persist Core `Decision` + `governanceSnapshot` if they want Core reconstruction.

## Time

- `createdAt` — when the fact occurred
- `recordedAt` — when Core recorded it
- `decidedAt` / `authorizedAt` / `evaluatedAt` — stage-specific
- grant `validFrom` / `validUntil` — authority window
- policy `effectiveFrom` — applicability

Callers pass `at` into evaluation. Core does not silently use wall clock for grant/policy checks on that path.
