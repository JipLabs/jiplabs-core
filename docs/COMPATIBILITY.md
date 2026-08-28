# Compatibility — @jiplabs/core

## SemVer (from 1.0.0 onward)

From published **1.0.0**, this is the SemVer contract for `@jiplabs/core`. 0.x versions had no strict compatibility promise.

### PATCH

- Bug fix that preserves documented behavior
- Documentation correction
- Additional tests
- Performance improvement with identical semantics

### MINOR

- Backward-compatible new **stable** API
- Optional new field on a persisted object that old readers ignore
- New experimental helper
- New storage adapter that does not break existing `Governance*Store` consumers

### MAJOR

- Removing a **stable** export
- Changing the meaning of a stable type
- Changing authorization, gate, or disposition semantics
- Changing how traces are interpreted
- Incompatible change to serialized stable contracts (`schemaVersion`, snapshot hashes, ledger event payloads)
- Changing deterministic disposition for the same recorded inputs

### Experimental APIs

CORE-03 and CORE-04 may change in a **minor** 1.x release without a major bump. Consumers must not treat them as frozen. The experimental subpath makes that explicit.

## Serialization and historical compatibility

Persisted objects that 1.0 consumers may store:

| Contract | Version field | Unknown fields | Replay notes |
|---|---|---|---|
| Entity envelope | `schemaVersion` (`core-00.1`) | Extra keys should be ignored by readers you write; Core freezeDeep factories do not round-trip unknown keys | Treat unknown `schemaVersion` as unsupported |
| `Decision` + `governanceSnapshot` | envelope + policy/grant content hashes | Snapshot is the historical meaning | `reconstructDecisionFromSnapshot` requires **decision-time** evidence and policy bytes matching hashes |
| Ledger events | event type + `temporalRefs` | Append-only | Later override/revocation must not mutate prior events |
| SQLite store | `PERSISTENCE_SCHEMA_VERSION` (3) | Migrations 001→003 | Opening a future schema fails closed (`STORAGE_SCHEMA_UNSUPPORTED`) |
| Evaluation corpus / component records | content hashes | Experimental | May evolve in 1.x minor |

Core does **not** provide a universal unknown-field JSON schema. If you persist Core objects, persist the JSON produced by Core (already frozen, hashes included). Do not mutate stored bytes.

Replay of `GovernorKernel` runs depends on stored run state + ledger, not on wall clock. Callers still supply `at` for new evaluations.

## Determinism

**Deterministic given equivalent inputs:**

- `evaluateAuthorityGrant`
- `evaluatePolicyGates` / `evaluateDomainDecisionAuthorization`
- fingerprints, content hashes, decision hashes
- disposition from a recorded evaluation verdict
- `reconstructDecisionFromSnapshot`

**May be nondeterministic / external:**

- evidence values (adapters, clocks, humans, models)
- executor results
- `Date` if the caller passes `new Date().toISOString()` as `at` or `createdAt`
- UUIDs / run ids chosen by the caller
- SQLite filesystem and concurrency interleaving of claims

Core makes external inputs **explicit arguments**. It does not pretend the whole product is deterministic.

## Time

Callers pass `at` into authorization and kernel runs. Grant validity and policy evaluation use that timestamp, not a hidden `Date.now()` on the authorize-only path. Claim expiry in the in-memory claim store **does** consult `Date.now()` when reading expired claims — that is a runtime lock, not historical meaning.

## Errors

See [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md#errors). `GovernanceError` is the typed thrown error. Authorize-only denials are result objects.
