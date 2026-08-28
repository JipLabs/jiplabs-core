# CORE-REL-1.0 — Final 1.0 Release Report

## A. STATUS

`CORE_1_0_READY_PUBLICATION_BLOCKED`

All technical release gates passed. `@jiplabs/core@1.0.0` is prepared, packed, tagged locally, and ready to publish. npm publication did not complete because registry authentication failed. This is not a Core defect.

---

## B. BASELINE

| Field | Value |
|---|---|
| Audit | CORE-REL-1.0 |
| Date/time | 2026-08-27T21:31:25-04:00 |
| Machine | `DESKTOP-H1VJFR9` (Windows 10.0.26200, user `Admin`) |
| Repository | `C:\Users\Admin\Documents\JipLabs Core` |
| Start branch | `core-stab-01-v1-stabilization` |
| Release branch | `core-rel-1.0.0` |
| Start SHA | `a893ef1813fb6ee097eb6cb37e9d1fb0cf544ba6` |
| Release SHA | `b8304e937fb6620e4b79f176414acc4fc29bc5fb` |
| Node | `v24.19.0` |
| npm | `11.17.0` |
| Package manager | `pnpm@9.15.9` |
| Authenticated npm identity | **unavailable** — `npm whoami` returned `E401` |
| Initial package version | `1.0.0-rc.1` (prepared in CORE-STAB-01, never published) |
| Final package version | `1.0.0` |
| Working tree at start | clean except untracked `JipLabs Core V0.docx` |
| Git remotes | **none configured** |
| npm `latest` at start | `0.3.0` |
| Published versions at start | `0.1.0`, `0.2.0`, `0.3.0` |

CORE-VAL-01 and CORE-STAB-01 recorded **zero** unresolved blockers. Post-1.0 debt listed there was not reopened.

---

## C. PRE-RELEASE VALIDATION

Substitution: this is a pnpm workspace. `npm ci` is not the native install path. `pnpm audit` is used instead of a package-folder `npm audit` (no package-lock in the package).

### RC baseline revalidation (`1.0.0-rc.1` on `a893ef1`)

| Command | Result |
|---|---|
| `pnpm --filter @jiplabs/core lint` | PASS (`tsc --noEmit`) |
| `pnpm --filter @jiplabs/core test` | **12 files, 278 passed, 0 failed** |
| `pnpm --filter @jiplabs/core build` | PASS |
| `pnpm --filter @jiplabs/core pack:check` | PASS — `@jiplabs/core@1.0.0-rc.1`, 134 files, 86.3 kB |
| `pnpm audit` | No known vulnerabilities |

API freeze at RC: **203** stable / **64** experimental / **0** missing (`node scripts/generate-api-inventory.mjs`).

### Final `1.0.0` gate (release commit `b8304e9`)

| Command | Result |
|---|---|
| `pnpm --filter @jiplabs/core lint` | PASS |
| `pnpm --filter @jiplabs/core test` | **12 files, 279 passed, 0 failed** |
| `pnpm --filter @jiplabs/core build` | PASS |
| `pnpm --filter @jiplabs/core pack:check` | PASS — `@jiplabs/core@1.0.0`, 134 files, 86.8 kB |
| `pnpm audit` | No known vulnerabilities |

The extra test is release metadata: `CORE_API_CHANNEL === "stable"` and `CORE_RELEASE_LINE === "1.0"`. No unexplained regression versus 278.

---

## D. API FREEZE CONFIRMATION

| Item | Value |
|---|---|
| Stable exports | **203** |
| Experimental exports | **64** |
| Internalized | **0** |
| Removed | **0** |
| API drift vs CORE-STAB-01 | **no** (counts unchanged; `CORE_API_CHANNEL` value `rc` → `stable`) |
| GovernorKernel | **STABLE_1_0** full-lifecycle runtime (CORE-STAB-01 Option A) |
| Primary recommended API | `evaluateDomainDecisionAuthorization` (authorize-only) |
| Experimental separation | `@jiplabs/core/experimental` plus `CORE_EXPERIMENTAL_EXPORTS` |

Inventory: [docs/API-INVENTORY.md](./API-INVENTORY.md).

---

## E. PACKAGE ARTIFACT

| Field | Value |
|---|---|
| Tarball name | `jiplabs-core-1.0.0.tgz` |
| Size | 86 841 bytes (86.8 kB packed; 494.9 kB unpacked) |
| Files | 134 |
| shasum (SHA-1) | `15f24b0f65ad0e798c90f15c47faa768257564b3` |
| SHA-256 | `d65da82e6ea228b1545652688ab4bea492ce35b1fd1877e0ebfd7ee70e1d4cb9` |
| integrity | `sha512-aIAsuPCQLLFDvgYKksDRw2C/vvOzmxmQppk4CBVnwskub0bb2Zm/plg2Uq0FVvi28aX6W/E19FABWKHnbUfpNQ==` |

Inspected contents: `package.json` version `1.0.0`; README; LICENSE; CHANGELOG; `dist/index.js` + `.d.ts`; `dist/experimental.js` + `.d.ts`; exports map `.` and `./experimental`. No tests, `.env`, `.cursor`, `node_modules`, sqlite/db files, or credential filenames.

Secret scan (filenames + content patterns for private keys, npm auth, `sk-` tokens, local `C:\Users\Admin` paths): **clean**. Consumer-package tests also assert no secrets in published metadata.

---

## F. NPM PUBLICATION

| Field | Value |
|---|---|
| Command | `npm publish --access public` (cwd `packages/jiplabs-core`) |
| Registry | `https://registry.npmjs.org/` |
| Intended dist-tag | `latest` |
| Result | **FAILED** — not published |
| Published version | none (`1.0.0` still 404 on the registry) |
| Dist-tag after attempt | still `latest -> 0.3.0` |
| Registry verification | **not performed** (artifact absent) |

`npm whoami` → `E401 Unauthorized`. Publish then `PUT https://registry.npmjs.org/@jiplabs%2fcore` → **404**. npm uses 404 to hide missing publish permission; the publish stack goes through `otplease`. A user-level `//registry.npmjs.org/:_authToken` key is present but is not accepted for identity or publish.

**Blocker category:** authentication / registry permission (OTP may still be required after a valid login). Not a packaging, test, or Core integrity failure.

Do not retry from this agent. Required human command after a valid npm login as a `@jiplabs` maintainer:

```bash
cd packages/jiplabs-core
npm publish --access public
```

Complete any OTP prompt in the same session. Then independently:

```bash
npm view @jiplabs/core@1.0.0 version
npm view @jiplabs/core dist-tags
```

Expected: version `1.0.0`, `latest -> 1.0.0`.

No RC was published, so no leftover `rc`/`next` dist-tag exists.

---

## G. CLEAN REGISTRY CONSUMER

**Not run.** Installing `@jiplabs/core@1.0.0` from the registry would be a false proof until the version exists.

Packed-artifact consumers (local tarball, not registry) already passed inside `tests/consumer-package.test.ts`:

- JS consumer: PASS (`ok: true`, kernel `KEEP`, experimental subpath)
- TypeScript consumer: PASS (`tsc --strict` against packed declarations)
- Experimental subpath: PASS

Registry columns in the machine-readable footer are `NOT_RUN`.

---

## H. GIT

| Field | Value |
|---|---|
| Release commit | `b8304e937fb6620e4b79f176414acc4fc29bc5fb` |
| Message | `release(core): prepare @jiplabs/core v1.0.0` |
| Branch | `core-rel-1.0.0` |
| Final tag | `@jiplabs/core-v1.0.0` (annotated, local) |
| Tag target | `b8304e937fb6620e4b79f176414acc4fc29bc5fb` |
| Tag verified locally | **YES** (`git rev-parse '@jiplabs/core-v1.0.0^{}'`) |
| Historical tag `@jiplabs/core-v0.3.0` | still `fe51dbb6184d54c3445e5a63ad1b31dee73c3536` (not moved) |
| Push status | **not pushed** — no git remote configured; no force push; no merge to master |

This report commit is documentation only and is **not** the tagged package source.

---

## I. SECURITY

| Check | Result |
|---|---|
| Runtime dependencies | none |
| `pnpm audit` | no known vulnerabilities |
| Artifact secret scan | clean |
| Remaining findings | CORE-STAB-01 post-1.0 hardening only (evidence `contentHash`, adapter trust boundary — documented, non-blocking) |

Security blockers: **0**. No certification claimed.

---

## J. RELEASE NOTES

`@jiplabs/core@1.0.0` is the first stable JipLabs Core line. It is a domain-agnostic governance kernel: authority, policy, evidence, proposal, decision, action authorization, execution, outcome, evaluation, override, and rollback.

Products depend on Core. Core does not depend on products. A proposal is not a decision. A decision is not execution. Execution success is not decision correctness. Override/rollback are new governed events; history is not rewritten.

**Stable:** constitution, authorize-only API, `GovernorKernel`, durable SQLite reference adapter, traces.

**Experimental:** CORE-03 evaluation corpus and CORE-04 component registry (`@jiplabs/core/experimental`).

Cross-domain validation (CORE-VAL-01) showed two heterogeneous products could consume this contract without missing primitives. That does not claim universal safety, formal verification, or correctness of domain models.

Compatibility from this version: SemVer on **stable** exports. See [CHANGELOG.md](../packages/jiplabs-core/CHANGELOG.md), [COMPATIBILITY.md](./COMPATIBILITY.md), [MIGRATION-0.3-TO-1.0.md](./MIGRATION-0.3-TO-1.0.md).

---

## K. KNOWN POST-1.0 DEBT

Accepted, non-blocking (from CORE-STAB-01):

- Evidence `contentHash` field consistency
- Postgres / other storage adapters (product-owned unless needed)
- Promoting CORE-03/04 after live use
- In-memory claim store clock vs injected time
- Product snapshot persistence (adapter work)
- Pushing historical and 1.0.0 git tags once a remote exists

---

## L. FINAL VERDICT

`@jiplabs/core@1.0.0` is **not** yet a verified public npm release.

The exact local artifact that should become the public 1.0.0 is built, tested, classified, documented, and tagged at `b8304e9`. Registry install proof is blocked solely by npm authentication. After a maintainer publishes that same commit, repeat registry `npm view`, a clean-temp install of `@jiplabs/core@1.0.0` (no workspace link), JS + TS consumers, and dist-tag check.

Do not merge automatically. Do not treat local pack success as registry success.

---

```text
CORE_REL_1_0_RESULT
decision=CORE_1_0_READY_PUBLICATION_BLOCKED
package_version=1.0.0
npm_published=NO
registry_verified=NO
registry_consumer_js=NOT_RUN
registry_consumer_ts=NOT_RUN
stable_exports=203
experimental_exports=64
tests_passed=279
tests_failed=0
security_blockers=0
release_blockers=0
release_sha=b8304e937fb6620e4b79f176414acc4fc29bc5fb
git_tag=@jiplabs/core-v1.0.0
git_tag_verified=YES
recommended_next_action=COMPLETE_NPM_AUTH_AND_PUBLISH
```
