/**
 * 1.0 API stability contract.
 *
 * Symbols listed here remain importable from `@jiplabs/core` for 0.3.0
 * compatibility, but they are **not** covered by stable SemVer. They may
 * change in a minor 1.x release. Prefer `@jiplabs/core/experimental` when
 * depending on this surface deliberately.
 *
 * Every other public export from `@jiplabs/core` is `STABLE_1_0`.
 */
export const CORE_RELEASE_LINE = "1.0" as const;
export const CORE_API_CHANNEL = "rc" as const;

export type CoreApiStability = "STABLE_1_0" | "EXPERIMENTAL";

export const CORE_EXPERIMENTAL_EXPORTS = [
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

export type CoreExperimentalExport = (typeof CORE_EXPERIMENTAL_EXPORTS)[number];

export function isCoreExperimentalExport(name: string): boolean {
  return (CORE_EXPERIMENTAL_EXPORTS as readonly string[]).includes(name);
}

export function coreApiStability(name: string): CoreApiStability | null {
  if (isCoreExperimentalExport(name)) return "EXPERIMENTAL";
  return "STABLE_1_0";
}
