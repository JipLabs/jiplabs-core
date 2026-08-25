import { envelope, freezeDeep, requireNonEmpty } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance, Ref } from "../schema.js";
import type {
  EvaluationBaseline,
  EvaluationMetricResult,
  EvaluationSummary,
  GovernanceRecommendation,
  GovernanceRecommendationKind,
  LearningSignal,
  LearningSignalKind,
  RegressionAssessment,
  RegressionComparison,
} from "./types.js";

export function createEvaluationBaseline(input: {
  readonly id: string;
  readonly baselineId: string;
  readonly targetId: string;
  readonly targetVersion: string;
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly evaluationRunId: string;
  readonly summaryId: string;
  readonly metricResults: readonly EvaluationMetricResult[];
  readonly establishedAt: IsoTimestamp;
  readonly governingDecisionRef?: string;
  readonly supersedes?: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationBaseline {
  return freezeDeep({
    ...envelope(input),
    baselineId: input.baselineId,
    targetId: input.targetId,
    targetVersion: input.targetVersion,
    suiteId: input.suiteId,
    suiteVersion: input.suiteVersion,
    evaluationRunId: input.evaluationRunId,
    summaryId: input.summaryId,
    metricResults: Object.freeze([...input.metricResults]),
    establishedAt: input.establishedAt,
    ...(input.governingDecisionRef ? { governingDecisionRef: input.governingDecisionRef } : {}),
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    immutable: true as const,
  });
}

export type RegressionConfig = {
  readonly failRateIncreaseThreshold?: number;
  readonly passRateDecreaseThreshold?: number;
};

function metricValue(summary: EvaluationSummary | EvaluationBaseline, metricId: string): number | null {
  const metric = summary.metricResults.find((m) => m.metricId === metricId);
  if (!metric || typeof metric.value !== "number") {
    return null;
  }
  return metric.value;
}

export function compareEvaluationToBaseline(input: {
  readonly comparisonId: string;
  readonly candidateSummary: EvaluationSummary;
  readonly baseline: EvaluationBaseline;
  readonly candidateSuiteId: string;
  readonly candidateSuiteVersion: string;
  readonly config?: RegressionConfig;
  readonly createdAt: IsoTimestamp;
  readonly provenance: Provenance;
}): RegressionComparison {
  const config = input.config ?? { failRateIncreaseThreshold: 0, passRateDecreaseThreshold: 0 };
  const baselinePass = metricValue(input.baseline, "pass_rate");
  const candidatePass = metricValue(input.candidateSummary, "pass_rate");
  const baselineFail = metricValue(input.baseline, "fail_rate");
  const candidateFail = metricValue(input.candidateSummary, "fail_rate");

  const compatible =
    input.baseline.suiteId === input.candidateSuiteId &&
    input.baseline.suiteVersion === input.candidateSuiteVersion;

  let assessment: RegressionAssessment = "INCOMPARABLE";
  let rationale = "baseline and candidate suites are not compatible";

  if (!compatible) {
    assessment = "INCOMPARABLE";
    rationale = "suite/version mismatch between baseline and candidate";
  } else if (input.candidateSummary.totalCases === 0) {
    assessment = "INSUFFICIENT_DATA";
    rationale = "candidate run has no case results";
  } else if (baselinePass === null || candidatePass === null || baselineFail === null || candidateFail === null) {
    assessment = "INCOMPARABLE";
    rationale = "missing comparable pass/fail rate metrics";
  } else {
    const passDelta = candidatePass - baselinePass;
    const failDelta = candidateFail - baselineFail;
    const passThreshold = config.passRateDecreaseThreshold ?? 0;
    const failThreshold = config.failRateIncreaseThreshold ?? 0;
    const improved = passDelta > 0 || failDelta < 0;
    const regressed = passDelta < -passThreshold || failDelta > failThreshold;
    if (improved && regressed) {
      assessment = "MIXED";
      rationale = "pass and fail rates moved in opposing directions";
    } else if (regressed) {
      assessment = "REGRESSED";
      rationale = "candidate performed worse than baseline on pass/fail rates";
    } else if (improved) {
      assessment = "IMPROVED";
      rationale = "candidate performed better than baseline on pass/fail rates";
    } else {
      assessment = "UNCHANGED";
      rationale = "candidate pass/fail rates match baseline within thresholds";
    }
  }

  const contentHash = sha256Canonical({
    comparisonId: input.comparisonId,
    assessment,
    candidateRunId: input.candidateSummary.evaluationRunId,
    baselineId: input.baseline.baselineId,
  });

  return freezeDeep({
    ...envelope({
      id: input.comparisonId,
      createdAt: input.createdAt,
      provenance: input.provenance,
    }),
    comparisonId: input.comparisonId,
    candidateRunId: input.candidateSummary.evaluationRunId,
    baselineId: input.baseline.baselineId,
    assessment,
    rationale,
    metricDeltas:
      baselinePass !== null && candidatePass !== null
        ? Object.freeze([
            {
              metricId: "pass_rate",
              baselineValue: baselinePass,
              candidateValue: candidatePass,
              direction: "HIGHER_IS_BETTER" as const,
              improved: candidatePass > baselinePass,
              regressed: candidatePass < baselinePass,
            },
          ])
        : undefined,
    contentHash,
  });
}

export function createLearningSignal(input: {
  readonly id: string;
  readonly signalId: string;
  readonly kind: LearningSignalKind;
  readonly domain: string;
  readonly rationale: string;
  readonly refs: readonly Ref[];
  readonly evaluationRunId?: string;
  readonly comparisonId?: string;
  readonly caseId?: string;
  readonly metadata?: JsonSafeMetadata;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): LearningSignal {
  return freezeDeep({
    ...envelope(input),
    signalId: input.signalId,
    kind: input.kind,
    domain: requireNonEmpty(input.domain, "domain"),
    rationale: requireNonEmpty(input.rationale, "rationale"),
    refs: Object.freeze([...input.refs]),
    ...(input.evaluationRunId ? { evaluationRunId: input.evaluationRunId } : {}),
    ...(input.comparisonId ? { comparisonId: input.comparisonId } : {}),
    ...(input.caseId ? { caseId: input.caseId } : {}),
    ...(input.metadata ? { metadata: freezeDeep({ ...input.metadata }) } : {}),
  });
}

export function createGovernanceRecommendation(input: {
  readonly id: string;
  readonly recommendationId: string;
  readonly kind: GovernanceRecommendationKind;
  readonly domain: string;
  readonly rationale: string;
  readonly signalIds?: readonly string[];
  readonly refs: readonly Ref[];
  readonly metadata?: JsonSafeMetadata;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): GovernanceRecommendation {
  return freezeDeep({
    ...envelope(input),
    recommendationId: input.recommendationId,
    kind: input.kind,
    domain: requireNonEmpty(input.domain, "domain"),
    rationale: requireNonEmpty(input.rationale, "rationale"),
    ...(input.signalIds ? { signalIds: Object.freeze([...input.signalIds]) } : {}),
    refs: Object.freeze([...input.refs]),
    ...(input.metadata ? { metadata: freezeDeep({ ...input.metadata }) } : {}),
  });
}

export function learningSignalForAssessment(
  assessment: RegressionAssessment,
): LearningSignalKind | null {
  switch (assessment) {
    case "REGRESSED":
      return "REGRESSION_DETECTED";
    case "IMPROVED":
      return "IMPROVEMENT_DETECTED";
    case "MIXED":
      return "UNEXPECTED_OUTCOME";
    default:
      return null;
  }
}

export function recommendationForAssessment(
  assessment: RegressionAssessment,
): GovernanceRecommendationKind {
  switch (assessment) {
    case "REGRESSED":
      return "INVESTIGATE";
    case "IMPROVED":
      return "NO_CHANGE";
    case "MIXED":
      return "EXPAND_TEST_COVERAGE";
    case "INCOMPARABLE":
    case "INSUFFICIENT_DATA":
      return "ADD_EVALUATION_CASES";
    default:
      return "NO_CHANGE";
  }
}

export function assertBaselineCompatible(
  baseline: EvaluationBaseline,
  input: { readonly suiteId: string; readonly suiteVersion: string; readonly targetId: string },
): boolean {
  return (
    baseline.suiteId === input.suiteId &&
    baseline.suiteVersion === input.suiteVersion &&
    baseline.targetId === input.targetId
  );
}
