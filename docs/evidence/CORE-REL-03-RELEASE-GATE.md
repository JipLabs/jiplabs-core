# CORE-REL-03 — `@jiplabs/core@1.1.0` Release Gate Evidence

| Field | Value |
|-------|-------|
| Status | `BLOCKED_NPM_AUTH` (CORE-REL-03B closure complete; publish pending interactive login) |
| Final release SHA | `2bd64248e41c6675feb9003265059c3123e8398f` |
| Tag `@jiplabs/core-v1.1.0` | points to final SHA (local, not pushed) |
| Manifest | `STABLE_AUDITOR_EXPORT_MANIFEST_RECONCILED` — **44** exports |
| Governance | `CORE_GOVERNANCE_HISTORY_PRESERVED` |

## Gates passed (pre-publish)

| Gate | Result |
|------|--------|
| Source version `1.1.0` | PASS |
| Lint / typecheck | PASS |
| Full tests | **309/309** PASS |
| npm pack | 156 files, 99.3 kB |
| STABLE_1_1 Auditor exports | 44 (root barrel) |
| Experimental-only helpers | 5 (subpath only) |
| MIT LICENSE | PASS |
| Zero runtime dependencies | PASS |
| Tarball consumer imports | PASS |
| Quinté Lab auditor | **12/12** |
| JipComply auditor | **22/22** |

## Blockers (initial run)

| Step | Result |
|------|--------|
| `npm whoami` | 401 Unauthorized |
| `npm publish` | 404 (scoped package — no publish permission / not authenticated) |
| `git push origin` | No `origin` remote configured |

## Authoritative repository URL

From `packages/jiplabs-core/package.json`:

`https://github.com/JipLabs/jiplabs-core.git`

## Manual completion (after CORE-REL-03B)

```powershell
cd "C:\Users\Admin\Documents\JipLabs Core\packages\jiplabs-core"
npm login
npm whoami
npm publish --access public
npm view @jiplabs/core version dist-tags

git remote add origin https://github.com/JipLabs/jiplabs-core.git
git push origin core-rel-1.0.0
git push origin @jiplabs/core-v1.1.0
```

## Registry baseline before release

- Published: `@jiplabs/core@1.0.0`
- `latest`: `1.0.0`
