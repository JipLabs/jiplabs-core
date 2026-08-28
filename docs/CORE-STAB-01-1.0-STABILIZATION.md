# CORE-STAB-01 — 1.0 Stabilization, API Freeze & RC Gate

## A. STATUS

`READY_FOR_1_0_RC`

Functional scope remains frozen. Public API is classified (stable vs experimental). Blocking CORE-VAL-01 API and documentation debt is resolved. Tests, packed-consumer verification, and dependency audit pass. **Do not publish `1.0.0` from this chantier** — that is `CORE-REL-1.0`.

---

## B. BASELINE

| Field | Value |
|---|---|
| Audit | CORE-STAB-01 |
| Date/time | 2026-08-27T21:02:10-04:00 |
| Machine | `DESKTOP-H1VJFR9` |
| Repository | `C:\Users\Admin\Documents\JipLabs Core` |
| Start branch | `core-val-01-cross-domain-validation` |
| Stabilization branch | `core-stab-01-v1-stabilization` |
| Start SHA | `28a61498bd58575f4973a7a7e78189dd797adbbe` |
| End SHA | branch HEAD after CORE-STAB-01 commits |
| Package version | `1.0.0-rc.1` (prepared, **not published**) |
| npm `latest` still | `0.3.0` |
| Node | `v24.19.0` |
| npm | `11.17.0` |
| pnpm | `9.15.9` |
| Working tree at start | clean except untracked `JipLabs Core V0.docx` (not committed) |
| Local git tag added | `@jiplabs/core-v0.3.0` → `fe51dbb6184d54c3445e5a63ad1b31dee73c3536` (**not pushed**) |

---

## C. EXECUTIVE VERDICT

`@jiplabs/core` is ready for a 1.0 **release-candidate process**, not for silent `1.0.0` publication.

The 0.3.0 contract was frozen functionally by CORE-VAL-01. This chantier made that contract **intentional**: authorize-only is the documented primary integration path; `GovernorKernel` stays a stable full-lifecycle runtime; CORE-03/CORE-04 are experimental; 0.3.0 root imports still compile. A 1.0 conformance suite and packed JS/TS consumers pass. Remaining work is release mechanics (RC publish, tag push, registry verification) — `CORE-REL-1.0`.

---

## D. CORE-VAL-01 FINDINGS DISPOSITION

| ID | CORE-VAL classification | Disposition | What CORE-STAB-01 did |
|---|---|---|---|
| VAL-F01 Three production runs | `NO_ACTION` | `NO_ACTION` | Unchanged; evidence remains in CORE-VAL-01 |
| VAL-F02 Authorize-only vs kernel | `CORE_API_DEBT` | `DOCUMENT_BEFORE_RC` | README + architecture: authorize-only first; kernel Option A stable |
| VAL-F03 Duplicate outcome/evaluation types | `CORE_API_DEBT` | `DOCUMENT_BEFORE_RC` | Documented two-layer model; types not merged (they differ) |
| VAL-F04 README / docs mismatch | `DOCUMENTATION_DEBT` | `FIX_BEFORE_RC` | Root + package README rewritten; CORE-04 no longer a “non-goal” |
| VAL-F05 Missing CORE-04 factories | `CORE_API_DEBT` | `FIX_BEFORE_RC` | Root-exported as experimental; test no longer deep-imports |
| VAL-F06 Quinté PROMOTE remap | `PRODUCT_SPECIFIC` | `NO_ACTION` | Migration note only |
| VAL-F07 JipComply dual envelope | `PRODUCT_SPECIFIC` | `DEFER_POST_1_0` | Product may later persist Core snapshots |
| VAL-F08 Empty observations | `CORE_CONFIGURATION` | `DOCUMENT_BEFORE_RC` | Integration guide: evidence may be pre-collected |
| VAL-F09 Historical evidence gap | `DOCUMENTATION_DEBT` | `DOCUMENT_BEFORE_RC` | Integration guide: `reconstructDecisionFromSnapshot` |
| VAL-F10 CORE_PRIMITIVE_GAP unused | `NO_ACTION` | `NO_ACTION` | — |
| VAL-F11 CORE-04 unused live | `NO_ACTION` | `KEEP_EXPERIMENTAL` | CORE-04 marked experimental |
| VAL-F12 Missing 0.3.0 git tag | `DOCUMENTATION_DEBT` | `FIX_BEFORE_RC` | Local annotated tag on `fe51dbb`; not pushed |
| VAL-F13 Product persistence | `CORE_CONFIGURATION` | `NO_ACTION` | Compatibility docs: SQLite is reference |
| VAL-F14 `buildDecisionTrace` unused | `CORE_API_DEBT` | `FIX_BEFORE_RC` | README + conformance + consumers build traces |
| VAL-F15 Coverage PRIORITIZE | `PRODUCT_SPECIFIC` | `NO_ACTION` | — |
| VAL-F16 Quinté HEAD vs deploy | `NO_ACTION` | `NO_ACTION` | Product ops |

No CORE-VAL-01 finding was dropped.

---

## E. PUBLIC API INVENTORY SUMMARY

| Class | Count |
|---|---|
| `STABLE_1_0` | **203** |
| `EXPERIMENTAL` | **64** |
| Internalized | **0** |
| Removed / deprecated-for-removal | **0** |
| Total root exports | **267** (0.3.0 had 256; +11 stability metadata and CORE-04 factories/types) |

Full table: [docs/API-INVENTORY.md](./API-INVENTORY.md)  
Runtime list: `CORE_EXPERIMENTAL_EXPORTS` / `isCoreExperimentalExport()`.

Mechanism: documentation + `CORE_EXPERIMENTAL_EXPORTS` + subpath `@jiplabs/core/experimental`. Root still re-exports experimental names so 0.3.0 adapters do not break.

---

## F. GOVERNORKERNEL DECISION

**Option A — legitimate stable public full-lifecycle API.**

- Not experimental.
- Not internalized.
- Not the default README example (authorize-only is).
- Does not bypass authority, policy, or execution binding.
- Products that only decide should keep using `evaluateDomainDecisionAuthorization` (also **STABLE_1_0**).

Restructuring the layering (Option D) was rejected: two APIs, two jobs, both proven in tests; only one proven in live products.

---

## G. API CHANGES

| Change | Impact |
|---|---|
| **Kept** all 0.3.0 root exports | Zero required adapter breakage |
| **Added** stability metadata | Additive |
| **Added** `@jiplabs/core/experimental` | Additive |
| **Added** `createFallbackRelationship`, `createReplacementProposal`, types | Additive, experimental |
| **Experimentalized** CORE-03 / CORE-04 (docs + list + JSDoc) | Import path unchanged |
| **Renamed** | None |
| **Removed** | None |
| **Internalized** | None |

`Outcome` / `OutcomeRecord` and `Evaluation` / `CoreEvaluation` remain both public; mapping functions documented.

---

## H. CONFORMANCE

`tests/conformance-1.0.test.ts` — **18 passed**.

| Invariant | Result |
|---|---|
| Authority — no execute/decide without grant | PASS |
| Policy snapshot bound (id/version/hash) | PASS |
| Proposal ≠ decision | PASS |
| Decision ≠ execution | PASS |
| Evidence reconstructable from snapshot | PASS |
| Durable kernel KEEP + append-only ledger | PASS |
| Idempotency — duplicate run does not re-execute | PASS |
| TOCTOU — revoked grant denied | PASS |
| Historical integrity — override does not rewrite decision | PASS |
| Rollback governed + verified | PASS |
| Outcome ≠ evaluation correctness | PASS |
| Evaluation distinct and reproducible | PASS |
| Shadow/observation authorize-only cannot mutate via Core | PASS |
| Authorize-only `buildDecisionTrace` | PASS |
| Reference consumer A (predictive authorize-only) | PASS |
| Reference consumer B (compliance authorize-only) | PASS |
| Performance sanity (250 authorize-only evals < 5s) | PASS |

---

## I. PACKAGING

| Check | Result |
|---|---|
| `pnpm --filter @jiplabs/core pack:check` | PASS — `@jiplabs/core@1.0.0-rc.1`, 134 files, 86.3 kB |
| Tarball | `dist/index.*`, `dist/experimental.*`, README, LICENSE, CHANGELOG; no tests/`.env` |
| Clean install from pack | PASS (consumer-package) |
| JS runtime consumer | PASS (`ok: true`, `state: KEEP`, experimental subpath) |
| TypeScript consumer `tsc --strict` | PASS |
| npm registry (published) | still `0.3.0` `latest`; RC **not** published |
| Metadata | `type: module`, `sideEffects: false`, `engines.node >=22.5.0`, `types` + `exports` |

---

## J. DOCUMENTATION

Created/updated:

- `packages/jiplabs-core/README.md` (consumability)
- `README.md` (repo)
- `docs/ARCHITECTURE.md`
- `docs/INTEGRATION-GUIDE.md`
- `docs/API-STABILITY.md`
- `docs/COMPATIBILITY.md`
- `docs/MIGRATION-0.3-TO-1.0.md`
- `docs/API-INVENTORY.md`
- `packages/jiplabs-core/CHANGELOG.md`
- `packages/jiplabs-core/examples/README.md`

Existing `docs/jiplabs-core/*` constitutional docs remain.

**External consumability:** `READY`

A competent engineer can answer from the package README: problem, when to use / not, install, smallest example, lifecycle, guarantees / non-guarantees, stable vs experimental, where to go next.

---

## K. COMPATIBILITY

- SemVer rules in `docs/COMPATIBILITY.md` (patch / minor / major / experimental).
- Serialized `Decision` + `governanceSnapshot` + ledger events + SQLite schema 3 documented.
- Unknown future SQLite schema fails closed.
- Experimental APIs may change in 1.x minor.
- 0.3.0 → 1.0: additive; see migration doc.

---

## L. SECURITY / SAFETY

| Item | Class |
|---|---|
| Zero runtime dependencies | `ACCEPTABLE` |
| `pnpm audit` — no known vulnerabilities | `ACCEPTABLE` |
| Adapter / executor trust boundary (Core trusts injected evidence/executor) | `ACCEPTABLE` (documented) |
| SQLite uses bound parameters | `ACCEPTABLE` |
| Stale grant re-check at kernel execution | `ACCEPTABLE` |
| Append-only ledger / override as new event | `ACCEPTABLE` |
| No secret logging in package metadata | `ACCEPTABLE` |
| Evidence entity has no `contentHash` (gate actuals + snapshot refs bind values) | `POST_1_0_HARDENING` |
| In-memory claim expiry uses `Date.now()` | `ACCEPTABLE` (lock, not history) |

**Security blockers:** 0  
No formal certification claimed.

---

## M. DEPENDENCIES

Runtime: **none**.

Dev: TypeScript, Vitest, `@types/node`. Domain-neutral, replaceable, no public semantic coupling. SQLite via Node built-in `node:sqlite` (engine `>=22.5.0`).

---

## N. REAL INTEGRATION IMPACT

### Quinté Lab

Adapters on `feature/core-ql-02-live-shadow` import `evaluateDomainDecisionAuthorization` from `@jiplabs/core`. **Viable 1.0 path with no required code change.** Optional: persist snapshots, `buildDecisionTrace`, set `onPass` to retain semantics, import corpus from `/experimental`.

### JipComply

`@jipcomply/regulatory-ingestion` pins `@jiplabs/core@0.3.0` and uses the same authorize-only API plus in-memory experimental corpus/registry. **Viable 1.0 path with no required code change.** Optional: `reconstructDecisionFromSnapshot` for shadow historical compare; later bump from 0.3.0 to 1.0 when published.

---

## O. OVERENGINEERING REVIEW

| Abstraction | Class |
|---|---|
| Authorize-only + constitution | `STABLE_AND_PROVEN` |
| GovernorKernel / durable SQLite | `FOUNDATIONAL_AND_JUSTIFIED` |
| CORE-03 corpus | `EXPERIMENTAL` |
| CORE-04 registry | `EXPERIMENTAL` |
| Duplicate outcome/evaluation type pairs | `FOUNDATIONAL_AND_JUSTIFIED` (documented, not removed) |
| `governDomainDecision` | `DEPRECATION_CANDIDATE` (already not a root export) |

Nothing removed for prestige. Public surface grew only for classification and missing factories.

---

## P. TEST RESULTS

| Command | Result |
|---|---|
| `pnpm --filter @jiplabs/core lint` | PASS (`tsc --noEmit`) |
| `pnpm --filter @jiplabs/core test` | **12 files, 278 passed, 0 failed** (23.51s) |
| `pnpm --filter @jiplabs/core build` | PASS |
| `pnpm --filter @jiplabs/core pack:check` | PASS |
| `pnpm audit` (repo) | No known vulnerabilities |

Prior 255 tests + 4 api-stability + 18 conformance + 1 extra consumer TS test = 278.

Substitution: `npm ci` not used (pnpm workspace). `npm audit` in the package folder fails without a package-lock; `pnpm audit` is the project equivalent.

---

## Q. BLOCKERS

`NONE`

---

## R. REMAINING POST-1.0 DEBT

- Evidence `contentHash` field (consistency)
- Postgres / other storage adapters (product-owned unless needed)
- Forcing products onto `GovernorKernel`
- Promoting CORE-03/04 to stable after live assignment/corpus use
- Human-on-the-loop UX
- Product merge of Quinté Core integration onto `master`
- In-memory claim store clock vs injected time
- Shrinking the 203-name stable surface further (possible later major)

---

## S. PROPOSED CORE-REL-1.0 PLAN

Smallest next chantier:

1. Confirm this branch review; do **not** merge automatically.
2. From `core-stab-01-v1-stabilization` (or a release branch): keep version `1.0.0-rc.1` or bump RC only if fixes land.
3. Pack, install the tarball in a clean dir, re-run consumer JS+TS (already in CI/tests).
4. **Optionally publish** `1.0.0-rc.1` to npm with dist-tag `rc` (not `latest`).
5. Smoke: JipComply/Quinté adapters typecheck against the RC (no production deploy).
6. If RC holds: set version `1.0.0`, changelog “released”, publish `latest`.
7. Git tags: push `@jiplabs/core-v0.3.0` (already local) and `@jiplabs/core-v1.0.0`.
8. Verify registry integrity, engines, exports.
9. Write `CORE-REL-1.0` release report.

Do not execute publication in CORE-STAB-01.

---

## T. MACHINE-READABLE RESULT

```text
CORE_STAB_01_RESULT
decision=READY_FOR_1_0_RC
package_version=1.0.0-rc.1
stable_exports=203
experimental_exports=64
internalized_exports=0
removed_exports=0
api_blockers=0
documentation_blockers=0
security_blockers=0
compatibility_blockers=0
tests_passed=278
tests_failed=0
external_consumability=READY
recommended_next_chantier=CORE-REL-1.0
```
