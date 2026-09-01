# Auditor — promotion criteria (experimental → stable)

| Field | Value |
|-------|-------|
| Status | **Promoted to stable 1.1.0** |
| Chantier | CORE-AUDITOR-01 → CORE-AUDITOR-02 |
| Current status | Stable (`STABLE_1_1` on `@jiplabs/core`) |

## Required evidence

1. **Cross-domain applicability** — Auditor primitive validated across heterogeneous governed patterns (minimum four representative domains or equivalent fixtures).
2. **No product semantic leakage** — No horse-racing, compliance, trading, or Research Engine semantics in MIT Core source.
3. **Deterministic contract behavior** — Where `deterministic: true`, identical state + evaluator version + scope produce equivalent finding fingerprints.
4. **API coherence** — Auditor contracts align with EntityEnvelope, provenance, governance refs, and trace reconstruction patterns.
5. **Historical reconstruction** — Findings and resolutions remain append-only; resolutions change effective status without erasing originals.
6. **Conformance tests** — Dedicated test matrix covering generic behavior, governance integration, cross-product fixtures, history, boundary, determinism.
7. **Open-core boundary preserved** — Proprietary intelligence remains outside MIT package; dependency direction unchanged.
8. **Production integrations** — At least two real product integrations or equivalent production evidence before stable promotion.
9. **No unresolved architectural blocker** — Persistence, continuous audit, and evaluation-bridge semantics agreed.
10. **Stable semantics for identity and lifecycle** — Finding fingerprint, rule identity, resolution model, and report aggregation finalized.

## CORE-AUDITOR-02 final assessment

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Cross-domain applicability | **PASS** | Four fixture domains + Quinté + JipComply |
| No semantic leakage | **PASS** | Domain rules external; proprietary evaluator boundary test |
| Deterministic behavior | **PASS** | Cross-product + stable conformance tests |
| API coherence | **PASS** | EntityEnvelope, provenance, governance refs |
| Historical reconstruction | **PASS** | Resolution helpers + history preservation tests |
| Conformance tests | **PASS** | foundation, cross-product, stable-conformance suites |
| Open-core boundary | **PASS** | ADR-001 unchanged; no proprietary in MIT |
| Production integrations | **PASS** | Quinté Lab #1, JipComply #2 |
| Architectural blockers | **PASS** | Evaluation bridge kept experimental |
| Identity/lifecycle semantics | **PASS** | ADR-002 documents stable contracts |

## Decision (CORE-AUDITOR-02)

**PROMOTE** → `STABLE_1_1` Auditor surface in `@jiplabs/core@1.1.0`

ADR: [ADR-002](../decisions/ADR-002-JIPLABS-CORE-AUDITOR-STABLE-PROMOTION.md)

npm publication: separate `CORE-REL-03` chantier.

## Non-goals for promotion chantier

- Dashboards, schedulers, distributed audit clusters
- AI anomaly detection in MIT Core
- Automatic Evaluation Corpus insertion from findings
- npm publish without explicit release approval
