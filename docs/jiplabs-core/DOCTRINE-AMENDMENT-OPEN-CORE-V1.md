# Proposed Doctrine Amendment — Open-Core Boundary (v1)

**Target:** next JipLabs Core Doctrine revision (post–1.0.0)  
**Chantier:** CORE-IP-01  
**Status:** Proposed — not yet incorporated into CORE-00 Constitution

This amendment is intentionally narrow. It does not rewrite unrelated doctrine.

---

## Amendment A — Open-core model

Add to architectural principles:

> JipLabs Core adopts an **open-core** licensing architecture. `@jiplabs/core` is MIT and provides domain-agnostic governance, evaluation, and audit **mechanisms**. JipLabs differentiated intelligence — proprietary data, advanced policy packs, cross-product analytics, managed enterprise runtime, and accumulated operational knowledge — lives in explicitly proprietary JipLabs packages that depend on Core, never vice versa.

## Amendment B — Dependency direction

Add to separation of concerns:

> Proprietary JipLabs packages may depend on `@jiplabs/core`. `@jiplabs/core` must not depend on proprietary JipLabs packages. No MIT Core contract may require proprietary JipLabs infrastructure to function semantically.

## Amendment C — Source and license boundary

Add to package location / governance:

> Repository or package MIT licensing does not automatically classify every source file within it. Before implementing a capability classified proprietary, its target package, license, and publication boundary must be explicit. Capabilities classified `UNDECIDED` must not ship under MIT until classification is resolved.

## Amendment D — Capability classification

Add a governance section:

> Significant new capabilities are classified `CORE_MIT`, `JIPLABS_PROPRIETARY`, or `UNDECIDED` before broad release. This is an architectural classification, not a runtime API. Default uncertain cases to `UNDECIDED`. See `docs/CAPABILITY-CLASSIFICATION.md`.

## Amendment E — Auditor foundation

Add to Core entities (or reference CORE-Auditor doc):

> Core provides generic audit contracts: scope, target, engagement, finding, report, and rule-evaluator interfaces. Domain products supply audit rules and adapters. Advanced audit intelligence remains outside MIT Core.

---

## Non-changes

This amendment does **not**:

- Close-source `@jiplabs/core`
- Modify `@jiplabs/core@1.0.0` license or semantics
- Mandate creation of `@jiplabs/core-enterprise`
- Change stable 1.0 API guarantees
