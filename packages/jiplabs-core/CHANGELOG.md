# Changelog

All notable changes to `@jiplabs/core` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Compatibility policy (0.x)

Until **1.0.0**:

- Core remains under active R&D.
- Breaking changes are possible but must be deliberate and documented.
- Public API changes must follow SemVer.
- Consumers must not rely on undocumented internal APIs or deep imports into `dist/` subpaths unless explicitly documented.

After **1.0.0**, accidental breaking changes are unacceptable.

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
