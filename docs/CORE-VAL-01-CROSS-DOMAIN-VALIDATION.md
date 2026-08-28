# CORE-VAL-01 — Cross-Domain Empirical Validation & 1.0 Decision Gate

## A. STATUS

`PROCEED_TO_1_0_STABILIZATION`

No `CORE_MISSING_PRIMITIVE` survived Gates 1–6. Real integrations in Quinté Lab and JipComply consumed existing Core contracts. Product adapters, dual product engines, and documentation gaps are not justification for CORE-05+.

---

## B. BASELINE

| Field | Value |
|---|---|
| Audit | CORE-VAL-01 |
| Date/time | 2026-08-27T20:37:42-04:00 |
| Machine | `DESKTOP-H1VJFR9` (Windows 10.0.26200, user `Admin`) |
| Repository | `C:\Users\Admin\Documents\JipLabs Core` |
| Start branch | `core-rel-02-v0.3.0` |
| Validation branch | `core-val-01-cross-domain-validation` |
| Start SHA | `fe51dbb6184d54c3445e5a63ad1b31dee73c3536` |
| End SHA | recorded after this report is committed |
| Package | `@jiplabs/core` |
| Local package version | `0.3.0` (`packages/jiplabs-core/package.json`) |
| npm registry version | `0.3.0` (`npm view @jiplabs/core version`) |
| npm integrity | `sha512-ff6liRmijZfmb4+TrFm72WFx4j7dH7m9zi+wlURT1pWcWtxSrPey4/G6dnJn81G/tyOEVUuXH2EEKGRrgSP/SQ==` |
| Git tags present | `@jiplabs/core-v0.1.0`, `@jiplabs/core-v0.2.0` — **no** `@jiplabs/core-v0.3.0` tag |
| `git describe` | `@jiplabs/core-v0.2.0-2-gfe51dbb` |
| Node | `v24.19.0` |
| npm | `11.17.0` |
| pnpm | `9.15.9` |
| Working tree at start | clean except untracked `JipLabs Core V0.docx` (not committed) |
| HEAD subject | `release(core): prepare @jiplabs/core v0.3.0` |

### Implemented Core milestones (verified in source, not assumed)

| Milestone | Present | Evidence |
|---|---|---|
| CORE-00 Constitution | Yes | `src/{actors,authority,policies,evidence,decisions,actions,outcomes,override,rollback,ledger,trace,domain}` + `docs/jiplabs-core/CORE-00-CONSTITUTION.md` |
| CORE-01 Governor Kernel | Yes | `src/governor/kernel.ts`, states, authorization, execution, concurrency, recovery |
| CORE-02 Durable governance | Yes | `src/persistence/*`, SQLite via `node:sqlite`, attempt statuses `PREPARED`/`STARTED`/`COMPLETED` |
| CORE-03 Evaluation corpus | Yes | `src/evaluation-corpus/*`, migration `002` |
| CORE-04 Component governance | Yes | `src/component-governance/*`, migration `003`, `docs/jiplabs-core/CORE-04-AGENT-MODEL-GOVERNANCE.md` |

CORE-04 is in the 0.3.0 baseline even though the original CORE-VAL-01 prompt listed CORE-00…CORE-03 as the expected history. It is treated as part of current Core, not as a new proposal.

Public package surface: single entry `@jiplabs/core` → `dist/index.js` / `dist/index.d.ts`. **256** public export names inventoried from `src/index.ts`. Runtime dependencies: none.

---

## C. EXECUTIVE VERDICT

`@jiplabs/core@0.3.0` has earned functional freeze and should enter `CORE-STAB-01` toward `1.0.0`.

Two heterogeneous products already consume Core:

- Quinté Lab production live SHADOW (CORE-QL-02) invoked Core authorization on **three distinct production pipeline runs** across three business dates, with zero production mutations.
- JipComply uses Core as the **live readiness authorization path** (`authorizeReadinessWithCore` → `evaluateDomainDecisionAuthorization`) plus a shadow/compare adapter.

Neither integration demonstrated a generic semantic capability that existing Core contracts cannot express. Both products used the CORE-00 authorization API rather than `GovernorKernel`; that is an ergonomics/documentation issue, not a missing primitive. CORE-04 is architecturally coherent but empirically unused on live authorization paths and should be marked experimental in 1.0, not expanded.

Do not open CORE-05+ on current evidence.

---

## D. THREE-RUN EVIDENCE

`THREE_RUN_THRESHOLD_CONFIRMED`

Local Quinté Lab trees did **not** contain the production corpus. Confirmation is from **read-only** inspection of the production shadow runtime:

`/opt/quinte-lab-core-shadow/runtime/core-ql-01/live/window-report.json`

`generated_at`: `2026-08-28T00:29:23.031Z`  
`status`: `SHADOW_VALIDATED`  
`consecutive_successful_runs`: `3`  
`activation_ready`: `true`  
`production_mutations`: `0`  
`unauthorized_actions`: `0`  
`unexplained_divergence`: `0`

| Distinct production run | Business date | First Core observation | Core trace | Gates | Mutations | Classification |
|---|---|---|---|---|---|---|
| `dpr-0b2c6d0056af4656` | 2026-08-25 | 2026-08-26T02:35:46.028Z `live-c53552b64a50a09e` | `dec-live-2026-08-26T02:35:46.028Z` | 13 pass / 0 fail | 0 | Core invoked, completed, shadow blocked |
| `dpr-96533554a6817d58` | 2026-08-26 | 2026-08-26T15:35:10.402Z `live-d0ee8be6663e5a99` | `dec-live-2026-08-26T15:35:10.402Z` | 13 pass / 0 fail | 0 | Core invoked, completed, shadow blocked |
| `dpr-39447cde80837bfb` | 2026-08-27 | 2026-08-27T17:22:21.255Z `live-d9b8fae097d7895e` | `dec-live-2026-08-27T17:22:21.255Z` | 13 pass / 0 fail | 0 | Core invoked, completed, shadow blocked |

Supporting facts:

- Three distinct `product_run_id`s, three distinct `prediction_batch_id`s, three business dates.
- All observations: `authority_allowed=true`, `shadow_executor_blocked=true`, `core_errors=[]`, `mode=SHADOW`, `production_root=/opt/quinte-lab`.
- Concordance for all observations: `SEMANTIC_MATCH` (not `EXACT_MATCH`) — see finding VAL-F06.
- The window contains **523 timer reobservations** of those three runs. Reobservations are **not** additional distinct production runs.
- A local fixture observation `live-004cc86c7c91d727` (`dpr-test-fixture`, `%TEMP%`) is **excluded** from the threshold.
- Sidecar: `docs/evidence/CORE-VAL-01-QUINTE-THREE-RUNS.json`.

Confidence caveat: confirmation required production-host read access. The local Quinté working tree at HEAD `23315b03` does not contain `src/core-governance` (integration lives on `feature/core-ql-02-live-shadow` @ `524a0c6a`). That is an operational/product-branch fact, not a Core defect.

---

## E. DOMAIN EVIDENCE

### Quinté Lab

| Item | Evidence |
|---|---|
| Local repo | `C:\Users\Admin\Documents\Quinté Lab` |
| HEAD at audit | `fix/stability-closure-datahub-timeout-20260827` @ `23315b0342fe1be08e7a0c6c0428a894a5042a68` |
| Core integration branch | `feature/core-ql-02-live-shadow` @ `524a0c6a8ba059faf654ad43752b3c97edf3ae0a` |
| Declared dependency | `"@jiplabs/core": "^0.3.0"` on the feature branch; **not** on current HEAD `package.json` |
| Sibling trees | `Quinte-Lab-baseline` (`342db2a1`, 2026-08-03) and `Quinte-Lab-r2` (`7c7c70c1`, 2026-08-04): **no** Core integration |
| Integration model | Product adapter `src/core-governance/*` + CLI/timer. Calls `createDecisionProposal` + `evaluateDomainDecisionAuthorization`. `GovernorKernel` **not used**. Shadow executor always returns `BLOCKED`. |
| Policy | `QL-CORE-MODEL-LIFECYCLE-POLICY@1.0.0` |
| Capabilities exercised | Actor/authority/grant, policy gates, evidence mapping from legacy promotion, decision authorization, shadow-blocked execution, concordance, evaluation-candidate JSON |
| Production mutation | Config `production_mutation_allowed: false`; 523/523 observations `mutation_count=0` |
| Workarounds | Policy `onPass=PROMOTE_CHALLENGER` remapped to `KEEP_CHAMPION` when gates pass and shadow executor is blocked (`SEMANTIC_MATCH`). Legacy V6 `HUMAN_APPROVAL` documented as expected policy difference. In-memory ledger constructed then unused (“for future kernel runs”). |
| Failures | Local CORE-QL-01 concordance (2026-08-26T02:28:59.983Z) blocked activation on `LIVE_SHADOW_EMPIRICAL: INSUFFICIENT_EVIDENCE` — that session had no live production observation. Later CORE-QL-02 production window is `SHADOW_VALIDATED`. No Core exception in sampled production observations. |
| Findings | Product-specific policy vocabulary and deployment shadow. No generic Core hole. |

### JipComply

| Item | Evidence |
|---|---|
| Local repo | `C:\Users\Admin\Documents\JipComply` |
| HEAD at audit | `master` @ `2eb8676a2845c22aa2edb76817fa59c7d992155b` |
| Dependency | `@jiplabs/core@0.3.0` **only** in `@jipcomply/regulatory-ingestion`; integrity pinned to the published tarball |
| Live integration | `packages/regulatory-ingestion/src/core-governance/live-authority.ts` — `authorizeReadinessWithCore` is the sole live readiness authorization path (commit `da7a8cbde`) |
| Shadow integration | `packages/regulatory-ingestion/src/core-shadow/*` + Postgres `core_shadow_runs` / `core_shadow_decisions` (migration `0054_core_shadow_int01.sql`) + `scripts/core-shadow-replay.mjs` |
| Core APIs used | `createActor`, `createAuthority`, `createAuthorityGrant`, `createDecisionProposal`, `createEvidence`, `createPolicyVersion`, `activatePolicyVersion`, `evaluatePolicyGates`, `mandatoryGatesPassed`, `evaluateDomainDecisionAuthorization`, in-memory `EvaluationCorpus` and `GovernedComponentRegistry` |
| Core APIs unused | `GovernorKernel`, `openNodeSqliteGovernanceStorage`, `buildDecisionTrace`, `executeGovernedAction` |
| Envelope | `@jiplabs/governance` remains the product decision-envelope / provenance layer (`governance-agent.ts`) |
| Mutation controls | Shadow script compares READY/RELEASED counts and exits `2` on change. Live path mutates only after Core authorization. |
| Workarounds | Product verdict mapper `deriveShadowReadinessVerdict`; dual gate models (Core `GateResult` vs governance `passed: boolean`); empty `fetchObservations: () => []`; historical replay comment *“Historical replay uses current evidence — decision-time evidence may differ”* → `UNDETERMINED` / `DATA_EVIDENCE_GAP`; `CORE_PRIMITIVE_GAP` mismatch class is **defined and never assigned** |
| Runtime DB rows | **Not proven in this audit** — `DATABASE_URL` not available; no committed shadow-run JSON. Live Core invocation **is** proven in source + unit tests. |
| Adapter tests | `pnpm --filter @jipcomply/regulatory-ingestion test -- core-governance core-shadow` → **9 passed** |
| Findings | JipComply did **not** expose a generic capability Core lacks. It mapped corridor readiness onto Core gates and kept product lifecycle (READY/RELEASED) in the vertical. |

### Trading Bot (negative control)

No `@jiplabs/core` dependency found under `C:\Users\Admin\Documents\trading-bot`. Not used as a validation domain. Core source/tests forbid Quinté/JipComply production imports.

---

## F. VALIDATION MATRIX

| Axis | Result | Evidence |
|---|---|---|
| 6.1 Domain Independence | **PASS** | Core `package.json` has zero runtime deps. Tests `core00`/`core01`/`core02`/`core03`/`core04` forbid JipComply/Quinté production imports. Product adapters depend on Core, not the reverse. Namespaced capability IDs (`jipcomply:…`, `quintelab:…`) appear only as **consumer examples** in tests. |
| 6.2 Authority | **PASS** | `Authority` / `AuthorityGrant` encode actor, scopes, resource, `validFrom`/`validUntil`, conditions, delegation, `revokedAt`. `evaluateAuthorityGrant` + kernel `freshExecutionAuthority` at execution time. Integrations create explicit grants. Revocation/delegation are implemented; live products mostly issue call-time grants (configuration, not a hole). |
| 6.3 Policy | **PASS** | Versioned `PolicyVersion` with `contentHash`, activation, immutability, supersession, gates, `autonomyMode`, `failureBehavior` including `SHADOW`. Both products bind `policyId`+`version` on proposals. Quinté mismatch is policy **label** (`PROMOTE_CHALLENGER`) vs retain observation — expressible by changing `onPass`, not by a new Core type. |
| 6.4 Proposal vs Decision | **PASS** | Distinct `DecisionProposal`, `Decision`, `GovernedActionAuthorization`, `ActionResult`, `Outcome`/`OutcomeRecord`, `Evaluation`/`CoreEvaluation`. Kernel and `evaluateDomainDecisionAuthorization` do not treat execution success as decision correctness. JipComply live path authorizes without implying the corridor model is true. |
| 6.5 Evidence Binding | **PASS_WITH_DEBT** | `Evidence` has identity, kind, subject, observation refs, value, evaluator. Decisions store `evidenceRefs` + `gateResults` + `DecisionGovernanceSnapshot`. `reconstructDecisionFromSnapshot` exists. Debt: evidence entities have no `contentHash`; JipComply shadow replay sometimes uses current evidence instead of persisting decision-time snapshots. Capability exists; products under-use it. |
| 6.6 Durable Execution | **PASS_WITH_DEBT** | Attempt lifecycle `PREPARED`/`STARTED`/`COMPLETED`/`IN_DOUBT` + replay/integrity in CORE-02 tests. Products do **not** run `GovernorKernel` against Core SQLite in production. Quinté persists JSON observations; JipComply uses Postgres. Durable **contracts** are proven in Core tests; durable **kernel runs** are not proven in these products. |
| 6.7 Concurrency / TOCTOU | **PASS_WITH_DEBT** | Kernel re-checks grant at execution (`EXECUTION_AUTHORITY_STALE`); authorization binds grant/policy content hashes; claim store serializes resource keys. Authorize-only product paths have no decision→execution gap by design (JipComply mutates immediately after auth; Quinté never executes). Empirical TOCTOU pressure is low. |
| 6.8 Decision Trace | **PASS_WITH_DEBT** | `buildDecisionTrace` / `answerTraceQuestions` cover actor, authority, policy, evidence, proposal, gates, decision, authorization, action, outcome, evaluation, override, rollback. Neither product calls it. They persist product traces (`core_trace_id`, Postgres `trace`). Architecture is sound; consumability is weak. |
| 6.9 Append-Only Historical Meaning | **PASS** | Ledger `assertLedgerAppendOnly`, temporal refs (`authorityGrantContentHash`, `policyContentHash`), override never erases original decision, policy supersession preserves prior versions. Covered by CORE-00/02/04 tests. |
| 6.10 Evaluation | **PASS_WITH_DEBT** | CORE-03 corpus, fingerprints, suites, observational runs, baselines, regression. Quinté wrote `evaluation-corpus.json` (4 candidates). JipComply builds in-memory candidates in shadow bootstrap and does not persist them. Products did **not** invent a second generic evaluation kernel; they under-used Core’s. |
| 6.11 Rollback / Compensation | **PASS** | First-class rollback plan/execution/verification + kernel rollback path. Quinté isolated-alias rollback test passed in CORE-QL-01; V6 production rollback remains product-aspirational. Shadow integrations do not need rollback of non-executed actions. Universal rollback not required. |
| 6.12 Human-on-the-Loop | **PASS** | Override, challenge, revocation, policy amendment, rollback request, policy-driven `HUMAN_APPROVAL_REQUIRED`. Not the default. Little empirical human-intervention traffic in these two integrations; contracts are present. |
| 6.13 Shadow / Observation Mode | **PASS_WITH_DEBT** | Core `failureBehavior: "SHADOW"`, assignment mode `SHADOW`. Products implemented **deployment** shadow (blocked executor, mutation guards, timers). That is the correct split. No evidence they needed a new Core “shadow kernel” type. |
| 6.14 Portability | **PASS** | No AI provider SDK. SQLite is a reference adapter via `node:sqlite`, not a semantic dependency. Interfaces allow other stores. No product/runtime topology encoded in contracts. |
| 6.15 API Fitness | **PASS_WITH_DEBT** | Single entrypoint; consumer-package tests install the tarball. Debt: 256 public names; duplicated Outcome/Evaluation types; some CORE-04 factories not re-exported; authorize-only path is the real consumer API but README leads with `GovernorKernel`; root README is stale. |

No axis is `FAIL`. `NOT_PROVEN` is reserved for JipComply **production shadow DB rows** (code+tests proven; live Postgres rows not queried).

---

## G. CROSS-DOMAIN MATRIX

| Capability | Core | Quinté Lab | JipComply | Generic invariant? | Action |
|---|---|---|---|---|---|
| Evidence | First-class `Evidence` + observation refs | Mapped from legacy promo / retain context | Mapped from corridor assessment | Yes | Keep |
| Policy | Versioned gates + snapshot hash | `QL-CORE-MODEL-LIFECYCLE-POLICY@1.0.0` | `jipcomply-readiness-governance@1.0.0` (+ coverage policy) | Yes | Keep |
| Authority | Grants, scopes, resource, validity, revoke/delegate | Call-time Quinté authority | Call-time readiness grants | Yes | Keep |
| Decision | Proposal ≠ decision | `evaluateDomainDecisionAuthorization` | Same API, live + shadow | Yes | Keep |
| Authorization | Separate from decision; hash-bound | Authorize-only; no production action auth | Live readiness auth then product mutation | Yes | Keep; document authorize-only path |
| Execution | Kernel + executor port | Structurally blocked shadow executor | Not via Core executor | Yes | Keep kernel; do not force products onto it |
| Durable state | SQLite reference + interfaces | JSON files on disk | Postgres product tables | Yes (interface) | Keep; no Postgres primitive |
| Audit / trace | Ledger + `DecisionTrace` | Product `core_trace_id` | Product `trace` JSON in Postgres | Yes | Document; optional STAB simplification |
| Provenance | Envelope + temporal refs | `production_commit`, observation timestamps | `DecisionTimeSnapshot` (package+integrity+gates+evidence) | Yes | Keep |
| Evaluation | CORE-03 corpus | 4 candidates persisted once | In-memory candidates in shadow bootstrap | Yes | Keep; mark under-used |
| Replay | `replayGovernanceRun` / reconstruct | Historical promo replay + live retain observe | Shadow replay vs current corridor | Yes | Keep |
| Rollback | First-class | Isolated alias test; not live | Product RELEASED immutability (vertical) | Yes in Core; product-specific extra | No Core change |
| Override | First-class | Not empirically exercised | Product holds/suspends + Core deny | Yes | Keep |
| Shadow execution | `failureBehavior` / assignment mode | Production timer + blocked executor | Replay script + UI | Yes, already expressible | No new primitive |
| Temporal state | `validFrom`/`validUntil`, snapshots | Observation timestamps | Decision-time snapshot; historical compare gap is adapter | Yes | Docs / adapter |
| Outcome feedback | Outcome + evaluation + corpus admission | KEEP_CHAMPION concordance | Corridor READY/NOT_READY mapper | Domain mappers are product | No Core change |
| Component/responsibility (CORE-04) | Registry, qualification, assignment | Not on live path | In-memory bootstrap only | Foundational, unproven live | Experimental in 1.0 |

---

## H. FINDINGS

### VAL-F01 — Three distinct production Core shadow runs

- **Severity:** INFO  
- **Classification:** `NO_ACTION`  
- **Evidence:** Production `window-report.json` status `SHADOW_VALIDATED`; three `dpr-*` IDs (section D).  
- **Domains:** Quinté Lab  
- **Core implication:** Empirical usefulness of CORE-00 authorization is demonstrated.  
- **Recommendation:** None for Core. Keep production in SHADOW until a separate product activation gate.

### VAL-F02 — Real consumer path is authorize-only, not `GovernorKernel`

- **Severity:** LOW  
- **Classification:** `CORE_API_DEBT`  
- **Evidence:** Both products import `evaluateDomainDecisionAuthorization`; `GovernorKernel` grep empty in JipComply source and Quinté adapters.  
- **Domains:** Quinté Lab, JipComply  
- **Core implication:** Kernel remains the constitutional runtime; consumers currently need a thinner path that already exists but is poorly signposted.  
- **Recommendation:** CORE-STAB-01 — document authorize-only as a first-class integration mode; do not add a second kernel.

### VAL-F03 — Duplicated outcome/evaluation types

- **Severity:** LOW  
- **Classification:** `CORE_API_DEBT`  
- **Evidence:** `Outcome` vs `OutcomeRecord`; `Evaluation` (CORE-00) vs `CoreEvaluation` (CORE-01) both exported from package root.  
- **Domains:** Core  
- **Core implication:** Unstable naming for 1.0 consumers.  
- **Recommendation:** STAB — alias/deprecate one pair; do not add a third.

### VAL-F04 — Documentation does not match the 0.3.0 package

- **Severity:** MEDIUM  
- **Classification:** `DOCUMENTATION_DEBT`  
- **Evidence:** Root `README.md` stops at CORE-01. Package README lists “Agent/model routing (CORE-04)” under **Non-goals** while CORE-04 is implemented and shipped. No integration guide for authorize-only or decision-time snapshot persistence.  
- **Domains:** Core  
- **Core implication:** External consumability is `PARTIAL`.  
- **Recommendation:** Must-fix before RC in CORE-STAB-01.

### VAL-F05 — Some CORE-04 factories are not package-root exports

- **Severity:** LOW  
- **Classification:** `CORE_API_DEBT`  
- **Evidence:** `createFallbackRelationship` / `createReplacementProposal` exported from `src/component-governance/index.ts` but not from `src/index.ts`. Release audit test imports `createFallbackRelationship` via a deep path.  
- **Domains:** Core  
- **Core implication:** Accidental deep-import pressure.  
- **Recommendation:** STAB — either export deliberately or keep internal and stop using deep imports in tests.

### VAL-F06 — Quinté remaps `PROMOTE_CHALLENGER` to `KEEP_CHAMPION`

- **Severity:** INFO  
- **Classification:** `PRODUCT_SPECIFIC`  
- **Evidence:** `live-shadow.ts` comment: *“Policy onPass label is PROMOTE_CHALLENGER; live retain observations that pass gates with zero mutations and blocked shadow executor are semantic KEEP.”* Window concordance `SEMANTIC_MATCH: 523`, `EXACT_MATCH: 0`.  
- **Domains:** Quinté Lab  
- **Core implication:** None. Policy `decisionOutcomes.onPass` is a product string.  
- **Recommendation:** Product may set `onPass` to retain semantics for live-observe policies. Not CORE-05.

### VAL-F07 — JipComply dual governance envelope

- **Severity:** LOW  
- **Classification:** `PRODUCT_SPECIFIC`  
- **Evidence:** Live Core auth plus `@jiplabs/governance` `createGovernedDecision` envelope in `governance-agent.ts`. Commit `da7a8cbde`: *“keep @jiplabs/governance as decision-envelope provenance only.”*  
- **Domains:** JipComply  
- **Core implication:** Product chose not to use Core ledger/SQLite as system of record.  
- **Recommendation:** No Core action. Optional later product migration onto Core ledger.

### VAL-F08 — Empty observation providers

- **Severity:** INFO  
- **Classification:** `CORE_CONFIGURATION`  
- **Evidence:** JipComply live+shadow `fetchObservations: () => []`; evidence is pre-collected and passed in.  
- **Domains:** JipComply  
- **Core implication:** Observation port is optional in practice; evidence is the material input.  
- **Recommendation:** Document that adapters may supply evidence directly.

### VAL-F09 — Historical compare without decision-time evidence

- **Severity:** LOW  
- **Classification:** `DOCUMENTATION_DEBT`  
- **Evidence:** JipComply `replay.ts` forces `UNDETERMINED` / `DATA_EVIDENCE_GAP` because replay uses current evidence. Core already has `DecisionGovernanceSnapshot` + `reconstructDecisionFromSnapshot`. Live path **does** capture `DecisionTimeSnapshot`.  
- **Domains:** JipComply  
- **Core implication:** Missing usage, not missing primitive.  
- **Recommendation:** STAB integration guide: persist snapshot + evidence values at decision time.

### VAL-F10 — Product `CORE_PRIMITIVE_GAP` class never fires

- **Severity:** INFO  
- **Classification:** `NO_ACTION`  
- **Evidence:** `MismatchClass` includes `CORE_PRIMITIVE_GAP` in `constants.ts`; `compare.ts` never assigns it.  
- **Domains:** JipComply  
- **Core implication:** The product anticipated a Core hole and did not observe one.  
- **Recommendation:** None.

### VAL-F11 — CORE-04 not on live authorization paths

- **Severity:** LOW  
- **Classification:** `NO_ACTION`  
- **Evidence:** JipComply `component-registry.ts` is in-memory bootstrap; live auth does not consult eligibility/assignment. Quinté live observations do not record component-governance refs.  
- **Domains:** Both  
- **Core implication:** CORE-04 is foundational inventory, not empirically load-bearing yet.  
- **Recommendation:** Mark CORE-04 exports **experimental** in 1.0. Do not build CORE-05 on top of it until a product assignment actually depends on it.

### VAL-F12 — 0.3.0 git tag missing

- **Severity:** LOW  
- **Classification:** `DOCUMENTATION_DEBT`  
- **Evidence:** npm `0.3.0` exists; git tags stop at `@jiplabs/core-v0.2.0`.  
- **Domains:** Core release hygiene  
- **Core implication:** Traceability of the published artifact to git is weaker than 0.1/0.2.  
- **Recommendation:** STAB — tag releases from the preparing commit.

### VAL-F13 — Products persist outside Core SQLite

- **Severity:** INFO  
- **Classification:** `CORE_CONFIGURATION`  
- **Evidence:** Quinté JSON under `/opt/quinte-lab-core-shadow/...`; JipComply Postgres. Core storage interfaces exist.  
- **Domains:** Both  
- **Core implication:** Reference SQLite is sufficient; a Core Postgres driver is not an invariant.  
- **Recommendation:** None.

### VAL-F14 — `buildDecisionTrace` unused by products

- **Severity:** LOW  
- **Classification:** `CORE_API_DEBT`  
- **Evidence:** Product `core_trace_id` / Postgres `trace` vs unused Core `DecisionTrace`.  
- **Domains:** Both  
- **Core implication:** Trace reconstruction is possible but not the path of least resistance.  
- **Recommendation:** STAB — example that returns `buildDecisionTrace` from authorize-only evaluation.

### VAL-F15 — Coverage PRIORITIZE is not a full Core decision

- **Severity:** INFO  
- **Classification:** `PRODUCT_SPECIFIC`  
- **Evidence:** JipComply `evaluateCoveragePrioritizeShadow` runs `evaluatePolicyGates` only; comment that PRIORITIZE does not imply READY.  
- **Domains:** JipComply  
- **Core implication:** Ranking/prioritization is a vertical workflow.  
- **Recommendation:** None.

### VAL-F16 — Quinté Core code not on current product HEAD

- **Severity:** INFO  
- **Classification:** `NO_ACTION`  
- **Evidence:** HEAD lacks `src/core-governance`; production timer still writes CORE-QL-02 observations.  
- **Domains:** Quinté Lab (ops)  
- **Core implication:** None.  
- **Recommendation:** Product merge/deploy hygiene. Out of Core scope.

---

## I. MISSING PRIMITIVE GATE RESULTS

Candidates considered from integration pressure. **Any FAIL blocks CORE-05.**

### Candidate A — First-class authorize-only kernel

| Gate | Result |
|---|---|
| 1 Real need | PASS — both products |
| 2 Genericity | PASS |
| 3 Architectural ownership | FAIL — already `evaluateDomainDecisionAuthorization` |
| 4 Stability | PASS |
| 5 Non-duplication | **FAIL** |
| 6 Value | FAIL — docs/API, not a new mechanism |

**Not CORE-05.** Classify as `CORE_API_DEBT` (VAL-F02).

### Candidate B — Generic shadow/observation run protocol in Core

| Gate | Result |
|---|---|
| 1 Real need | PASS — both products built shadow |
| 2 Genericity | PASS |
| 3 Architectural ownership | FAIL — deployment/timer/mutation-guard vs Core semantics |
| 4 Stability | PASS |
| 5 Non-duplication | **FAIL** — `failureBehavior: "SHADOW"` + blocked `DomainActionExecutor` |
| 6 Value | FAIL — products would still own deploy topology |

**Not CORE-05.**

### Candidate C — Decision-time evidence store / historical compare primitive

| Gate | Result |
|---|---|
| 1 Real need | PASS — JipComply `DATA_EVIDENCE_GAP` |
| 2 Genericity | PASS |
| 3 Architectural ownership | FAIL — snapshot+reconstruct already exist |
| 4 Stability | PASS |
| 5 Non-duplication | **FAIL** |
| 6 Value | FAIL — persist existing snapshot |

**Not CORE-05.** Classify as `DOCUMENTATION_DEBT` (VAL-F09).

### Candidate D — Policy outcome aliasing / semantic equivalence

| Gate | Result |
|---|---|
| 1 Real need | PASS — Quinté remap |
| 2 Genericity | **FAIL** — product vocabulary (`PROMOTE_CHALLENGER` vs retain) |
| 3 Architectural ownership | FAIL |
| 4 Stability | FAIL — not a stable generic concept |
| 5 Non-duplication | FAIL — set `onPass` |
| 6 Value | FAIL |

**Not CORE-05.** `PRODUCT_SPECIFIC` (VAL-F06).

### Candidate E — Regulatory applicability / temporal provenance engine

| Gate | Result |
|---|---|
| 1 Real need | Weak — JipComply corridor/RELEASED lifecycle |
| 2 Genericity | **FAIL** — compliance vertical |
| 3–6 | FAIL |

**Not CORE-05.**

### Candidate F — Portable Postgres (or generic SQL) ledger driver

| Gate | Result |
|---|---|
| 1 Real need | Weak — JipComply used its own tables |
| 2 Genericity | PASS as an adapter |
| 3 Architectural ownership | **FAIL** — storage interface already exists |
| 5 Non-duplication | **FAIL** |
| 6 Value | FAIL — commodity adapter, not constitutional |

**Not CORE-05.**

### Candidate G — Evidence content hashing

| Gate | Result |
|---|---|
| 1 Real need | **FAIL** — no integration failure caused by missing evidence hash; snapshots/gate results already capture decision-time values |
| 2 Genericity | PASS |
| 5 Non-duplication | Weak — ledger payload hashes + gate actuals already bind values |
| 6 Value | FAIL for CORE-05 |

Optional STAB consistency (`contentHash` on evidence) is **not** a new primitive cycle.

**No candidate passes all six gates.**

---

## J. CORE-05+ PLAN

`NO FUNCTIONAL CORE-05+ WORK JUSTIFIED BY CURRENT EVIDENCE`

Do not implement speculative features. Freeze functional expansion.

---

## K. 1.0 STABILIZATION PLAN

Proposed next chantier: **`CORE-STAB-01`** — prepare `@jiplabs/core@1.0.0` without adding CORE-05 semantics.

### Must fix before RC

- Public API inventory (this audit counted 256 names) with **stable vs experimental** split.
- Fix README contradictions (root README; package non-goals vs CORE-04).
- Authorize-only integration guide (the path products actually use).
- Decision-time snapshot + evidence persistence example (`reconstructDecisionFromSnapshot`).
- `DecisionTrace` example on the authorize-only path.
- Semantic-versioning boundary and compatibility guarantees (what 1.0 will not break).
- Packaging verification (already passing `consumer-package` + `npm pack`; keep as release gate).
- Tag the git commit that matches the published tarball.
- Dependency audit (currently zero runtime deps — keep it that way).

### Should fix before 1.0

- Collapse or officially alias `Outcome`/`OutcomeRecord` and `Evaluation`/`CoreEvaluation`.
- Export or hide CORE-04 factories consistently (`createFallbackRelationship`, etc.).
- Authority/policy lifecycle documentation aligned to actual code.
- Durable execution documentation emphasizing *optional* kernel vs required contracts.
- Evaluation corpus documentation with a product-shaped observational example.
- Mark CORE-04 experimental until a live assignment depends on it.
- Conformance suite extracted from existing tests (constitutional + execution-safety + rel-audit).
- Security/safety review of grant/policy TOCTOU and adapter bypass assertions.
- Upgrade/migration guidance 0.3.0 → 1.0.0 (expect few breaks if STAB is mostly docs/aliases).

### May defer after 1.0

- Postgres/other storage adapters (product-owned unless a second product hits the SQLite ceiling).
- Forcing products onto `GovernorKernel`.
- Automatic admission of production outcomes into the evaluation corpus.
- Human-on-the-loop UX.
- Quinté/JipComply merge of Core integration onto product `master` (product ops).
- Evidence `contentHash` field (API consistency only).

`1.0.0` means the **current stable contracts are mature enough to depend on deliberately**. It does not mean Core will never grow again.

---

## L. OVERENGINEERING REVIEW

| Primitive / area | Classification | Rationale |
|---|---|---|
| Actor, authority, policy, evidence, proposal, decision | `PROVEN` | Used by both products |
| `evaluateDomainDecisionAuthorization` | `PROVEN` | Actual integration API |
| Policy gates + `failureBehavior` | `PROVEN` | Both products |
| Decision governance snapshot / reconstruct | `JUSTIFIED_FOUNDATIONAL` | Needed; under-used |
| Governor Kernel + execution safety | `JUSTIFIED_FOUNDATIONAL` | Constitutional runtime; unused by current products; do not remove |
| Durable SQLite / replay / integrity | `JUSTIFIED_FOUNDATIONAL` | Proven in tests; unused in these productions |
| Rollback / override contracts | `JUSTIFIED_FOUNDATIONAL` | Little live traffic; constitutionally required |
| CORE-03 evaluation corpus | `UNPROVEN_BUT_LOW_COST` | Light product use; keep; don’t expand |
| CORE-04 component governance | `UNPROVEN_BUT_LOW_COST` | Shipped; not load-bearing live; **experimental in 1.0** |
| In-memory stores | `PROVEN` | Tests + product bootstrap |
| `governDomainDecision` deprecated alias | `DEPRECATION_CANDIDATE` | Already deprecated; confirm not public-root exported in 1.0 |
| Deep `dist/` modules in pack tarball | `UNPROVEN_BUT_LOW_COST` | Packaging ships `dist/**`; public contract is package root only — document, don’t split packages now |

Core should not grow. It may become **smaller at the public boundary** (experimental CORE-04, aliased duplicates) without deleting the constitution.

---

## M. TEST RESULTS

Workspace: `C:\Users\Admin\Documents\JipLabs Core`  
Date: 2026-08-27T20:35:18-04:00 local (vitest start).

| Command | Result |
|---|---|
| `pnpm install` | Lockfile up to date |
| `pnpm --filter @jiplabs/core lint` (`tsc -p tsconfig.json --noEmit`) | **pass** |
| `pnpm --filter @jiplabs/core test` (`vitest run`) | **10 files, 255 tests passed**, 10.56s |
| `pnpm --filter @jiplabs/core build` | **pass** |
| `pnpm --filter @jiplabs/core pack:check` (`npm pack --dry-run`) | **pass** — `@jiplabs/core@0.3.0`, 130 files, integrity matches JipComply pin |

Test files: `constitutional-audit`, `execution-safety-audit`, `core00`, `core01`, `core02`, `core03`, `core04`, `core-rel-audit`, `core-rel-02-audit`, `consumer-package`.

Product tests (no production mutation):

| Command | Result |
|---|---|
| `pnpm --filter @jipcomply/regulatory-ingestion test -- core-governance core-shadow` | **2 files, 9 tests passed** |

Not run (unsafe or missing on HEAD): Quinté `tests/core-ql-*` (not on current product HEAD); JipComply `scripts/core-shadow-replay.mjs` against live `DATABASE_URL`.

No npm publish. No deploy. No live timer changes. Production Quinté inspection was **read-only**.

---

## N. RISKS

1. **Authorize-only vs kernel split** — if 1.0 docs still lead with `GovernorKernel`, new consumers will copy the unused path. Mitigation: STAB docs.
2. **CORE-04 experimental creep** — treating unproven component governance as frozen 1.0 surface. Mitigation: experimental export bucket.
3. **Product persistence divergence** — Core SQLite unused; reconstruction quality depends on adapters persisting snapshots. Mitigation: integration guide + conformance examples.
4. **Quinté SEMANTIC_MATCH forever** — if live observe policy stays `onPass=PROMOTE_CHALLENGER`, EXACT_MATCH will never appear. Product issue; do not “fix” in Core.
5. **JipComply shadow DB unproven here** — live authorization code is real; shadow *rows* were not queried. Does not justify CORE-05.
6. **Tag/git mismatch** — published 0.3.0 vs missing git tag. Release-process risk for 1.0.
7. **Public API size (256 names)** — accidental breakage if internals leak. Mitigation: inventory + export lint in STAB.
8. **Human override / rollback unexercised in these two live paths** — residual constitutional risk, not a demonstrated hole.

---

## O. FINAL MACHINE-READABLE DECISION

```text
CORE_VAL_01_RESULT
decision=PROCEED_TO_1_0_STABILIZATION
three_run_threshold=CONFIRMED
core_defects=0
missing_primitives=0
product_specific_findings=3
api_debt_findings=4
documentation_debt_findings=4
critical_findings=0
high_findings=0
recommended_next_chantier=CORE-STAB-01
```
