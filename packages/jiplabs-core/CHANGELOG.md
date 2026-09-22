# Changelog

All notable changes to `@jiplabs/core` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Compatibility policy

From published **1.0.0**:

- Accidental breaking changes to **stable** exports are a major-version event.
- Experimental exports (CORE-03, CORE-04) may change in a minor 1.x release.
- Consumers must not rely on deep imports into `dist/` subpaths.

See [docs/COMPATIBILITY.md](../../docs/COMPATIBILITY.md) and [docs/API-STABILITY.md](../../docs/API-STABILITY.md).

## 1.2.0 — 2026-09-21

Published npm `@jiplabs/core@1.1.0` (2026-09-01) does **not** include this contract. Do not install `1.1.0` expecting `evaluatePolicy`.

### Added — Generic policy evaluation contract

Additive, domain-agnostic ALLOW / BLOCK / REVIEW evaluation alongside existing `PolicyVersion` gates:

- `evaluatePolicy`, `createPolicyEvaluationResult`, `composePolicyDecisions`
- `serializePolicyEvaluationResult` / `parsePolicyEvaluationResult` (canonical, historically reconstructable)
- `isEntitlementPermitted` / `assertEntitlementPermitted` (fail-closed; REVIEW and evaluation failure are not ALLOW)
- Overlays may only tighten (`BLOCK > REVIEW > ALLOW`)

Commercial jurisdiction lists are **not** in Core. See `@jiplabs/commerce-policy`.

Package identity: this version is the first release that contains JIPLABS-COMMERCIAL-ELIGIBILITY-01 (`0089b0548ef9964405d92d4ba20196aca3716e12`) plus this version boundary.

## 1.1.0 — 2026-09-01

### Added — Auditor stable surface (CORE-AUDITOR-02)

Promotes the governed **Auditor** primitive from experimental to stable `STABLE_1_1` exports.

- `runAuditEngagement` — observation-only audit runner
- Audit contracts: `AuditScope`, `AuditTarget`, `AuditEngagement`, `AuditFinding`, `AuditReport`, `AuditFindingResolution`
- `AuditRuleEvaluator` extension point for product-specific rules
- `AuditGovernedStateView` + `buildAuditGovernedStateView`
- Finding fingerprint and state fingerprint helpers
- Resolution helpers (`getEffectiveFindingStatus`, append-only history)
- `AuditArtifactStore` + `InMemoryAuditArtifactStore` reference implementation

Auditor verifies governed history; it does **not** authorize execution or mutate product records.

Experimental-only Auditor helpers remain on `@jiplabs/core/experimental` (evaluation bridge, trace-input view builder).

Evidence: Quinté Lab Production Integration #1, JipComply Production Integration #2.

ADR: [ADR-002](../docs/decisions/ADR-002-JIPLABS-CORE-AUDITOR-STABLE-PROMOTION.md).

### Compatibility

- Additive — all `STABLE_1_0` exports unchanged
- `CORE_RELEASE_LINE` → `1.1`
- `@jiplabs/core/experimental` continues to export full Auditor surface

## 1.0.0 — 2026-08-27

First **stable** JipLabs Core release. No new functional primitives versus `0.3.0` / `1.0.0-rc.1`.

Core governs **decision processes** (authority, policy, evidence, proposal, decision, authorization, execution, outcome, evaluation, override, rollback). It does **not** guarantee that a product’s domain model is correct, and it is not a certification or formal-verification result.

### Included

- Governed decision lifecycle with explicit proposal ≠ decision ≠ execution ≠ outcome ≠ evaluation
- Authority grants, policy versions/gates, evidence binding, decision snapshots
- Authorize-only primary API: `evaluateDomainDecisionAuthorization`
- Full-lifecycle runtime: `GovernorKernel` (stable, not the default product path)
- Durable reference persistence (SQLite via `node:sqlite`), append-only ledger, recovery
- Override and rollback as **new** governed events (history is not rewritten)
- Cross-domain validation evidence (Quinté Lab shadow, JipComply readiness) — see CORE-VAL-01
- SemVer contract for stable exports from this version forward

### Stable vs experimental

- **203** `STABLE_1_0` root exports
- **64** `EXPERIMENTAL` exports (CORE-03 evaluation corpus, CORE-04 component registry)
- Experimental subpath: `@jiplabs/core/experimental`
- `CORE_API_CHANNEL` is `"stable"`; `CORE_RELEASE_LINE` is `"1.0"`

### Validated use

Heterogeneous products consumed Core without missing primitives (CORE-VAL-01). That does **not** claim universal production maturity of every subsystem. Authorize-only is empirically proven in live adapters; durable kernel execution is proven in tests; CORE-03/04 remain experimental.

### Compatibility

- 0.3.0 root imports remain valid (additive 1.0 surface)
- Migration: [docs/MIGRATION-0.3-TO-1.0.md](../../docs/MIGRATION-0.3-TO-1.0.md)
- Known non-blocking limits: experimental corpus/registry; evidence `contentHash` hardening; products own persistence of snapshots

## 1.0.0-rc.1 — 2026-08-27

Stabilization RC. **Not published.** No new functional primitives.

### Added

- Explicit `STABLE_1_0` vs `EXPERIMENTAL` classification (`CORE_EXPERIMENTAL_EXPORTS`)
- Subpath `@jiplabs/core/experimental`
- Root exports `createFallbackRelationship`, `createReplacementProposal` (experimental)
- 1.0 conformance suite and domain-neutral reference consumers
- Integration, architecture, compatibility, and 0.3→1.0 migration docs

### Changed

- README leads with authorize-only (`evaluateDomainDecisionAuthorization`); `GovernorKernel` documented as the full-lifecycle runtime
- CORE-03 and CORE-04 marked experimental
- Constitutional vs runtime outcome/evaluation types documented (not merged)

### Migration

0.3.0 root imports remain valid. See [docs/MIGRATION-0.3-TO-1.0.md](../../docs/MIGRATION-0.3-TO-1.0.md).

## 0.3.0 — 2026-08-25

Adds CORE-04 — Agent, Model & Responsibility Governance on top of the 0.2.0 public API.

### Added

- Governed component registry with agent/model identities
- Extensible capability declarations
- Responsibilities and evidence-backed qualifications
- Deterministic responsibility eligibility evaluation
- Governed responsibility assignments with canary/probation/shadow modes
- Component selection among eligible candidates
- Validator independence contracts
- Suspension, requalification, replacement and fallback governance
- SQLite persistence migration `003_component_governance`
- Component governance ledger and decision trace integration

### Safety

- Identity does not grant authority
- Capability declaration does not grant qualification
- Qualification does not auto-assign responsibility
- Responsibility assignment does not authorize production execution
- Regression recommendations do not directly demote components
- Fallback must itself be qualified and eligible
- Historical component governance state remains reconstructable
- Provider-neutral implementation — no LLM SDK dependency

### Compatibility

- **0.2.0 public API preserved** — all existing exports remain available
- New CORE-04 exports are additive only
- Databases at schema 002 upgrade to 003 on first open with 0.3.0

## 0.2.0 — 2026-08-25

Adds CORE-03 — Evaluation Corpus & Governed Learning Loop on top of the 0.1.0 public API.

### Added

- Permanent evaluation corpus with case candidate/admission/version lifecycle
- Immutable evaluation suite versions
- Evaluation targets and observational evaluation runs
- Deterministic summaries and basic metrics aggregation
- Evaluation baselines and regression comparison
- Learning signals (evidence) and governance recommendations (non-decisions)
- SQLite persistence migration `002_evaluation_corpus`
- Restart-safe evaluation history via `corpusStore` on `openNodeSqliteGovernanceStorage`

### Safety

- Pure evaluation runs cannot invoke production `DomainActionExecutor`
- Governance recommendations are not decisions and do not authorize execution
- No automatic policy or authority mutation
- Activated case/suite versions and baselines remain immutable; supersession preserves history

### Compatibility

- **0.1.0 public API preserved** — all existing exports remain available
- New CORE-03 exports are additive only
- Databases at schema 001 upgrade to 002 on first open with 0.2.0

## 0.1.0 — 2026-08-25

First official consumable release of the JipLabs governance kernel.

### CORE-00 — Governance Constitution

- Domain-agnostic governance contracts: actors, authority, policies, evidence, decisions, actions, outcomes.
- Explicit authority grants and policy gates.
- Append-only governance ledger contracts and decision trace reconstruction.
- First-class rollback and human override (override never erases history).
- Constitutional evaluation helpers for proposals and historical audit self-containment.

### CORE-01 — Governor Kernel

- Operational runtime orchestrating the governed lifecycle from proposal through disposition.
- Autonomous execution governance with policy-driven human approval (not globally required).
- Governed action authorization, execution safety, and idempotency fingerprints.
- Rollback execution with verification before completion.
- Recovery checkpoints, concurrency claims, and in-memory reference stores for development.

### CORE-02 — Durable Governance State

- SQLite reference persistence via Node built-in `node:sqlite` (zero runtime dependencies).
- Durable governance ledger, run store, execution attempts, and claim store.
- Restart recovery, replay, and run reconstruction APIs.
- Schema migrations, integrity verification, and durable idempotency.

### Public API

- Single entry point: `@jiplabs/core`.
- Intentional public surface only; internal helpers, serialization internals, and test utilities are not exported from the package root.
