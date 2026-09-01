/**
 * 1.0 / 1.1 API stability contract.
 *
 * Symbols listed in CORE_EXPERIMENTAL_EXPORTS remain importable from
 * `@jiplabs/core/experimental` with explicit experimental SemVer.
 *
 * STABLE_1_0 — original 1.0.0 contract.
 * STABLE_1_1 — Auditor primitive promoted in 1.1.0 (additive).
 *
 * Every other public export from `@jiplabs/core` is STABLE_1_0 or STABLE_1_1.
 */
export const CORE_RELEASE_LINE = "1.1" as const;
export const CORE_API_CHANNEL = "stable" as const;

export type CoreApiStability = "STABLE_1_0" | "STABLE_1_1" | "EXPERIMENTAL";

/**
 * Auditor primitive — stable from 1.1.0 (CORE-AUDITOR-02).
 * Available from `@jiplabs/core` and `@jiplabs/core/experimental`.
 */
export const CORE_STABLE_1_1_AUDITOR_EXPORTS = [
  "AuditAdvisory",
  "AuditArtifactStore",
  "AuditEngagement",
  "AuditEngagementStatus",
  "AuditFinding",
  "AuditFindingClassification",
  "AuditFindingResolution",
  "AuditFindingSeverity",
  "AuditFindingStatus",
  "AuditGovernanceRef",
  "AuditGovernanceRefType",
  "AuditGovernedStateView",
  "AuditRemediation",
  "AuditReport",
  "AuditReportStatus",
  "AuditRuleEvaluator",
  "AuditRuleEvaluationInput",
  "AuditRuleEvaluationResult",
  "AuditRuleFindingDraft",
  "AuditScope",
  "AuditScopeKind",
  "AuditSeveritySummary",
  "AuditTarget",
  "AuditTimeRange",
  "AuditorRunnerInput",
  "AuditorRunnerResult",
  "assertAuditorIsObservationOnly",
  "assertFindingHistoryPreserved",
  "buildAuditGovernedStateView",
  "buildAuditReportSummary",
  "buildAuditSeveritySummary",
  "computeAuditFindingFingerprint",
  "computeAuditStateFingerprint",
  "createAuditEngagement",
  "createAuditFinding",
  "createAuditFindingResolution",
  "createAuditReport",
  "createAuditScope",
  "createAuditTarget",
  "getEffectiveFindingStatus",
  "InMemoryAuditArtifactStore",
  "isFindingUnresolved",
  "listUnresolvedFindingIds",
  "runAuditEngagement",
] as const;

/**
 * Experimental exports re-exported from the root `@jiplabs/core` barrel for
 * 0.3.0 compatibility (CORE-03 / CORE-04).
 */
export const CORE_EXPERIMENTAL_ROOT_EXPORTS = [
  "AssignmentMode",
  "AssignmentPolicy",
  "AgentIdentity",
  "CapabilityDeclaration",
  "ComponentGovernanceTraceRefs",
  "ComponentRole",
  "ComponentSelectionPolicy",
  "EligibilityOutcome",
  "EvaluationBaseline",
  "EvaluationCase",
  "EvaluationCaseCandidate",
  "EvaluationCaseEvaluator",
  "EvaluationCaseResult",
  "EvaluationCaseVersion",
  "EvaluationCorpus",
  "EvaluationCorpusStore",
  "EvaluationRun",
  "EvaluationSuiteVersion",
  "EvaluationSummary",
  "EvaluationTarget",
  "EvaluationTargetRunner",
  "FallbackRelationship",
  "GovernanceRecommendation",
  "GovernedComponent",
  "GovernedComponentRegistry",
  "GovernedComponentRegistryStore",
  "GovernedComponentType",
  "InMemoryEvaluationCorpusStore",
  "InMemoryGovernedComponentRegistryStore",
  "LearningSignal",
  "ModelIdentity",
  "QualificationRecord",
  "QualificationRequirement",
  "QualificationStatus",
  "RegressionAssessment",
  "RegressionComparison",
  "ReplacementProposal",
  "Responsibility",
  "ResponsibilityAssignment",
  "ResponsibilityEligibility",
  "ValidatorIndependencePolicy",
  "buildComponentGovernanceTraceRefs",
  "buildEvaluationSummary",
  "compareEvaluationToBaseline",
  "computeCandidateFingerprint",
  "computeEvaluationRunFingerprint",
  "createAgentIdentity",
  "createCandidateFromGovernanceRun",
  "createCapabilityDeclaration",
  "createEvaluationCaseCandidate",
  "createEvaluationTarget",
  "createFallbackRelationship",
  "createGovernedComponent",
  "createModelIdentity",
  "createQualificationRecord",
  "createReplacementProposal",
  "createResponsibility",
  "createResponsibilityAssignment",
  "createResponsibilityEligibility",
  "evaluateResponsibilityEligibility",
  "isAssignmentEligible",
  "isEvaluationWorthyOutcome",
  "selectEligibleComponent",
  "validateValidatorIndependence",
] as const;

/**
 * Experimental exports available only on `@jiplabs/core/experimental`
 * (not re-exported from the stable root barrel).
 */
export const CORE_EXPERIMENTAL_SUBPATH_ONLY_EXPORTS = [
  "buildAuditGovernedStateViewFromTraceInput",
  "compareFindingStatuses",
  "computeGovernedStateContentHash",
  "evaluationCaseSourceKindFromFinding",
  "isEvaluationCandidateFromFinding",
] as const;

export const CORE_EXPERIMENTAL_EXPORTS = [
  ...CORE_EXPERIMENTAL_ROOT_EXPORTS,
  ...CORE_EXPERIMENTAL_SUBPATH_ONLY_EXPORTS,
] as const;

export type CoreStable1_1AuditorExport = (typeof CORE_STABLE_1_1_AUDITOR_EXPORTS)[number];
export type CoreExperimentalExport = (typeof CORE_EXPERIMENTAL_EXPORTS)[number];
export type CoreExperimentalRootExport =
  (typeof CORE_EXPERIMENTAL_ROOT_EXPORTS)[number];
export type CoreExperimentalSubpathOnlyExport =
  (typeof CORE_EXPERIMENTAL_SUBPATH_ONLY_EXPORTS)[number];

const STABLE_1_1_SET = new Set<string>(CORE_STABLE_1_1_AUDITOR_EXPORTS);
const EXPERIMENTAL_SET = new Set<string>(CORE_EXPERIMENTAL_EXPORTS);

export function isCoreStable1_1AuditorExport(name: string): boolean {
  return STABLE_1_1_SET.has(name);
}

export function isCoreExperimentalExport(name: string): boolean {
  return EXPERIMENTAL_SET.has(name);
}

export function coreApiStability(name: string): CoreApiStability | null {
  if (isCoreStable1_1AuditorExport(name)) return "STABLE_1_1";
  if (isCoreExperimentalExport(name)) return "EXPERIMENTAL";
  return "STABLE_1_0";
}
