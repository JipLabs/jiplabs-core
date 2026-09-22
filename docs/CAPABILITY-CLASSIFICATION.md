# Capability classification — JipLabs Core

Architectural classification for significant new Core candidates. This is **governance documentation**, not a production runtime enum.

| Classification | Meaning |
|------------------|---------|
| `CORE_MIT` | Domain-agnostic mechanism; broad adoption increases strategic value; safe for `@jiplabs/core` MIT |
| `JIPLABS_PROPRIETARY` | Differentiated intelligence, proprietary data, or economically strategic capability; proprietary package |
| `UNDECIDED` | Decision pending; **do not** release under MIT until resolved |

## Decision checklist

Before MIT inclusion, answer:

1. Is the capability domain-agnostic?
2. Does broad adoption increase JipLabs strategic value?
3. Is the implementation itself a differentiated intelligence asset?
4. Does it contain proprietary data, policies, evaluations, or operational knowledge?
5. Would an external organization reasonably pay JipLabs specifically for this capability?
6. Can the generic mechanism be MIT while its intelligence remains proprietary?

If any answer strongly favors proprietary treatment, classify `JIPLABS_PROPRIETARY` or `UNDECIDED`.

## Registry (initial)

| Capability | Classification | Package / surface | Notes |
|------------|----------------|-------------------|-------|
| Constitution (CORE-00) | `CORE_MIT` | `@jiplabs/core` stable | Released 1.0.0 |
| Governor Kernel (CORE-01) | `CORE_MIT` | `@jiplabs/core` stable | Released 1.0.0 |
| Durable governance (CORE-02) | `CORE_MIT` | `@jiplabs/core` stable | Reference SQLite adapter |
| Evaluation corpus mechanism (CORE-03) | `CORE_MIT` | `@jiplabs/core/experimental` | Generic contracts; corpus **content** may be proprietary |
| Component governance (CORE-04) | `CORE_MIT` | `@jiplabs/core/experimental` | Generic registry contracts |
| Evaluation corpus **content** | `JIPLABS_PROPRIETARY` | Future proprietary package | Benchmark datasets, operational cases |
| Policy evaluation contract (`evaluatePolicy`, ALLOW/BLOCK/REVIEW) | `CORE_MIT` | `@jiplabs/core` stable | Generic result/composition/fail-closed entitlement |
| Commercial eligibility rules / jurisdiction lists / provider overlays | `JIPLABS_PROPRIETARY` | `@jiplabs/commerce-policy` | Domain policy; depends on Core; never the reverse |
| Advanced policy packs | `JIPLABS_PROPRIETARY` | Future proprietary package | Domain intelligence packs |
| Auditor foundation (CORE-Auditor) | `CORE_MIT` | `@jiplabs/core/experimental` | Generic audit contracts |
| Audit intelligence / anomaly detection | `JIPLABS_PROPRIETARY` | Future proprietary package | Cross-product learned strategies |
| Enterprise cross-system audit | `JIPLABS_PROPRIETARY` | Future proprietary package | Managed continuous auditing |
| Managed runtime / orchestration | `JIPLABS_PROPRIETARY` | Future proprietary package | Not created artificially |

## Process

1. Propose classification in chantier or ADR before substantial implementation.
2. `UNDECIDED` code lives in a branch or private package until resolved.
3. Update this registry when classification changes.

See [ADR-001](./decisions/ADR-001-JIPLABS-CORE-OPEN-CORE-STRATEGY-V1.md).
