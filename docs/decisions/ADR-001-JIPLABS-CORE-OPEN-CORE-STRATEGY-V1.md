# ADR-001 — JipLabs Core Open-Core Strategy v1

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-09-01 |
| Chantier | CORE-IP-01 |
| Supersedes | — |

## Context

`@jiplabs/core@1.0.0` was released under the MIT license. Core development must continue without freezing. JipLabs must formalize which capabilities remain in the MIT foundation versus which differentiated intelligence stays proprietary, while preserving stable 1.0 consumer contracts.

## Decision

JipLabs Core adopts an **open-core** model.

### MIT foundation — `@jiplabs/core`

| Attribute | Value |
|-----------|-------|
| License | MIT |
| Purpose | Domain-agnostic reference foundation for governed autonomous systems |

The MIT foundation **may** include:

- Knowledge contracts (evidence, provenance, versioning)
- Rules contracts (policy, gates, authority)
- Assessment contracts (evaluation primitives, conformance tests)
- Governance, authority, decision, workflow primitives
- Generic audit contracts and audit primitives
- Rollback and lifecycle/state-machine contracts
- SDK interfaces and extension points

Its purpose is to maximize adoption, interoperability, credibility, external experimentation, standardization potential, and integration into heterogeneous systems.

### Proprietary boundary

JipLabs differentiated intelligence **must** remain outside the MIT Core when it represents an economically strategic capability. Examples:

- Proprietary evaluation corpus content and benchmark datasets
- Advanced policy packs and domain intelligence packs
- Advanced audit intelligence and cross-product intelligence
- Accumulated operational knowledge and proprietary detection strategies
- Managed orchestration, distributed enterprise governance, managed runtime
- Enterprise observability, administration cockpit, certification systems
- Commercial compliance packs and enterprise integrations
- Proprietary evaluation and routing strategies

These capabilities **may** later live in packages such as `@jiplabs/core-enterprise` or other explicitly proprietary JipLabs packages. **Do not** create artificial Enterprise functionality merely to populate such packages.

### Dependency direction (mandatory)

```text
JipLabs proprietary capabilities
        ↓
   @jiplabs/core (MIT)
```

Never:

```text
@jiplabs/core (MIT)
        ↓
JipLabs proprietary module
```

The MIT Core must remain independently usable. No MIT Core contract may require proprietary JipLabs infrastructure to function semantically.

### Source-code boundary

`MIT repository/package ≠ proprietary implementation repository/package`.

Before implementing a capability classified **JIPLABS_PROPRIETARY**, its source location and license boundary must already be explicit. Do not rely on an ambiguous README statement inside an otherwise MIT repository.

### Capability classification

Significant new Core candidates are classified architecturally (not as production runtime enums):

| Classification | Meaning |
|----------------|---------|
| `CORE_MIT` | Domain-agnostic mechanism suitable for MIT foundation |
| `JIPLABS_PROPRIETARY` | Differentiated intelligence or data; proprietary package |
| `UNDECIDED` | Decision pending; must not ship under MIT until resolved |

Each extraction answers:

1. Is the capability domain-agnostic?
2. Does broad adoption increase JipLabs strategic value?
3. Is the implementation itself a differentiated intelligence asset?
4. Does it contain proprietary data, policies, evaluations, or operational knowledge?
5. Would an external organization reasonably pay JipLabs specifically for this capability?
6. Can the generic mechanism be MIT while its intelligence remains proprietary?

Default uncertain cases to `UNDECIDED`, not automatically MIT. `UNDECIDED` code that may become proprietary must not be accidentally released under MIT before the decision is made.

### Auditor — first application

Auditor is the first explicit test of the open-core boundary.

**MIT (experimental):** domain-agnostic audit contracts — scope, target, engagement, finding, severity, governance refs, remediation/advisory metadata, report, rule-evaluator interface. Import via `@jiplabs/core/experimental`.

**Proprietary (reserved):** learned cross-product anomaly detection, proprietary audit strategies, proprietary evaluation corpora, advanced policy intelligence, proprietary benchmark comparisons, accumulated failure-pattern intelligence, automated recommendation engines from JipLabs operational history, enterprise cross-system audit, managed continuous auditing, advanced governance analytics.

Conceptual flow:

```text
Governed history + Evidence + Authority + Policy + Decision
        + Execution + Outcome + Evaluation
                ↓
            AUDITOR
                ↓
        Findings / Audit Report
```

Products supply domain-specific audit rules and adapters. Core does not encode horse-racing, compliance, trading, or Research Engine semantics.

### Existing MIT baseline

`@jiplabs/core@1.0.0` MIT release is immutable. This ADR does **not** retroactively change released code or remove the existing MIT license.

### API stability

Stable 1.0 contracts are not broken. New Auditor contracts are **experimental** until promotion rules justify stable status. No npm publish is required as part of this ADR.

## Consequences

- Positive: Clear licensing boundary; Core development continues; Auditor foundation can be shared across Quinté Lab, Research Engine, Trading Bot, JipComply.
- Positive: External adopters can use MIT primitives without proprietary lock-in.
- Constraint: Proprietary intelligence must be planned at package boundary before implementation.
- Constraint: `UNDECIDED` capabilities require governance review before MIT inclusion.

## References

- [CAPABILITY-CLASSIFICATION.md](./CAPABILITY-CLASSIFICATION.md)
- [CORE-AUDITOR-FOUNDATION.md](../jiplabs-core/CORE-AUDITOR-FOUNDATION.md)
- [DOCTRINE-AMENDMENT-OPEN-CORE-V1.md](../jiplabs-core/DOCTRINE-AMENDMENT-OPEN-CORE-V1.md)
- [API-STABILITY.md](../API-STABILITY.md)
