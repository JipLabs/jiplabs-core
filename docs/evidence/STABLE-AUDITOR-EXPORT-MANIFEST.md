# STABLE Auditor Export Manifest — `@jiplabs/core` root (`STABLE_1_1`)

| Field | Value |
|-------|-------|
| Status | `STABLE_AUDITOR_EXPORT_MANIFEST_RECONCILED` |
| Count | **44** unique stable Auditor root exports |
| Source of truth | `packages/jiplabs-core/src/api-stability.ts` → `CORE_STABLE_1_1_AUDITOR_EXPORTS` |

## 44/45 discrepancy resolution

**Outcome 2:** The promotion report count of **45** was incorrect. The approved stable surface contains **44** unique exports. No export is missing from `index.ts`, built declarations, or the packed tarball.

The earlier "45" likely counted a duplicate category or rounded a non-export artifact. **Do not add a 45th export.**

## Authoritative list (44)

| # | Export | Kind |
|---|--------|------|
| 1 | `AuditAdvisory` | type |
| 2 | `AuditArtifactStore` | type (interface) |
| 3 | `AuditEngagement` | type |
| 4 | `AuditEngagementStatus` | type |
| 5 | `AuditFinding` | type |
| 6 | `AuditFindingClassification` | type |
| 7 | `AuditFindingResolution` | type |
| 8 | `AuditFindingSeverity` | type |
| 9 | `AuditFindingStatus` | type |
| 10 | `AuditGovernanceRef` | type |
| 11 | `AuditGovernanceRefType` | type |
| 12 | `AuditGovernedStateView` | type |
| 13 | `AuditRemediation` | type |
| 14 | `AuditReport` | type |
| 15 | `AuditReportStatus` | type |
| 16 | `AuditRuleEvaluator` | type |
| 17 | `AuditRuleEvaluationInput` | type |
| 18 | `AuditRuleEvaluationResult` | type |
| 19 | `AuditRuleFindingDraft` | type |
| 20 | `AuditScope` | type |
| 21 | `AuditScopeKind` | type |
| 22 | `AuditSeveritySummary` | type |
| 23 | `AuditTarget` | type |
| 24 | `AuditTimeRange` | type |
| 25 | `AuditorRunnerInput` | type |
| 26 | `AuditorRunnerResult` | type |
| 27 | `assertAuditorIsObservationOnly` | function |
| 28 | `assertFindingHistoryPreserved` | function |
| 29 | `buildAuditGovernedStateView` | function |
| 30 | `buildAuditReportSummary` | function |
| 31 | `buildAuditSeveritySummary` | function |
| 32 | `computeAuditFindingFingerprint` | function |
| 33 | `computeAuditStateFingerprint` | function |
| 34 | `createAuditEngagement` | function |
| 35 | `createAuditFinding` | function |
| 36 | `createAuditFindingResolution` | function |
| 37 | `createAuditReport` | function |
| 38 | `createAuditScope` | function |
| 39 | `createAuditTarget` | function |
| 40 | `getEffectiveFindingStatus` | function |
| 41 | `InMemoryAuditArtifactStore` | class |
| 42 | `isFindingUnresolved` | function |
| 43 | `listUnresolvedFindingIds` | function |
| 44 | `runAuditEngagement` | function |

## Experimental-only (5) — `@jiplabs/core/experimental` only

1. `buildAuditGovernedStateViewFromTraceInput`
2. `compareFindingStatuses`
3. `computeGovernedStateContentHash`
4. `evaluationCaseSourceKindFromFinding`
5. `isEvaluationCandidateFromFinding`

## Verification cross-check

| Layer | Match |
|-------|-------|
| `CORE_STABLE_1_1_AUDITOR_EXPORTS` | 44 entries |
| `src/index.ts` auditor block | 44 symbols |
| `dist/index.d.ts` | 44 Auditor symbols |
| Packed tarball consumer | 44 importable |
