import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { envelope, freezeDeep, requireNonEmpty } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance } from "../schema.js";
import { computeEvaluationRunFingerprint } from "./fingerprints.js";
import type {
  EvaluationCaseResult,
  EvaluationCaseResultVerdict,
  EvaluationMetricResult,
  EvaluationRun,
  EvaluationRunStatus,
  EvaluationSummary,
  EvaluationTarget,
} from "./types.js";

export function createEvaluationRun(input: {
  readonly id: string;
  readonly runId: string;
  readonly status?: EvaluationRunStatus;
  readonly target: EvaluationTarget;
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly caseVersionRefs: readonly { readonly caseId: string; readonly version: string }[];
  readonly evaluatorActorId: string;
  readonly evaluatorVersion?: string;
  readonly configuration: JsonSafeMetadata;
  readonly idempotencyKey: string;
  readonly startedAt: IsoTimestamp;
  readonly completedAt?: IsoTimestamp | null;
  readonly summaryId?: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationRun {
  const runFingerprint = computeEvaluationRunFingerprint({
    targetId: input.target.targetId,
    targetVersion: input.target.version,
    suiteId: input.suiteId,
    suiteVersion: input.suiteVersion,
    caseVersionRefs: input.caseVersionRefs,
    evaluatorActorId: input.evaluatorActorId,
    evaluatorVersion: input.evaluatorVersion,
    configuration: input.configuration,
  });
  return freezeDeep({
    ...envelope(input),
    runId: input.runId,
    status: input.status ?? "PENDING",
    target: input.target,
    suiteId: input.suiteId,
    suiteVersion: input.suiteVersion,
    caseVersionRefs: Object.freeze([...input.caseVersionRefs]),
    evaluatorActorId: input.evaluatorActorId,
    ...(input.evaluatorVersion ? { evaluatorVersion: input.evaluatorVersion } : {}),
    configuration: freezeDeep({ ...input.configuration }),
    idempotencyKey: input.idempotencyKey,
    runFingerprint,
    startedAt: input.startedAt,
    ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    ...(input.summaryId ? { summaryId: input.summaryId } : {}),
    observationMode: true as const,
  });
}

export function completeEvaluationRun(
  run: EvaluationRun,
  input: { readonly completedAt: IsoTimestamp; readonly summaryId: string },
): EvaluationRun {
  return freezeDeep({
    ...run,
    status: "COMPLETED" as const,
    completedAt: input.completedAt,
    summaryId: input.summaryId,
  });
}

export function createEvaluationCaseResult(input: {
  readonly id: string;
  readonly resultId: string;
  readonly evaluationRunId: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly targetId: string;
  readonly targetVersion: string;
  readonly evaluatorActorId: string;
  readonly verdict: EvaluationCaseResultVerdict;
  readonly evidenceRefs?: readonly string[];
  readonly outputRefs?: readonly string[];
  readonly metricResults?: readonly EvaluationMetricResult[];
  readonly limitations?: readonly string[];
  readonly domainPayload?: JsonSafeMetadata;
  readonly evaluatedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationCaseResult {
  const contentHash = sha256Canonical({
    evaluationRunId: input.evaluationRunId,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    verdict: input.verdict,
    targetId: input.targetId,
    targetVersion: input.targetVersion,
  });
  return freezeDeep({
    ...envelope(input),
    resultId: input.resultId,
    evaluationRunId: input.evaluationRunId,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    targetId: input.targetId,
    targetVersion: input.targetVersion,
    evaluatorActorId: input.evaluatorActorId,
    verdict: input.verdict,
    ...(input.evidenceRefs ? { evidenceRefs: Object.freeze([...input.evidenceRefs]) } : {}),
    ...(input.outputRefs ? { outputRefs: Object.freeze([...input.outputRefs]) } : {}),
    ...(input.metricResults ? { metricResults: Object.freeze([...input.metricResults]) } : {}),
    ...(input.limitations ? { limitations: Object.freeze([...input.limitations]) } : {}),
    ...(input.domainPayload ? { domainPayload: freezeDeep({ ...input.domainPayload }) } : {}),
    contentHash,
    evaluatedAt: input.evaluatedAt,
  });
}

export function buildEvaluationSummary(input: {
  readonly id: string;
  readonly summaryId: string;
  readonly evaluationRunId: string;
  readonly results: readonly EvaluationCaseResult[];
  readonly metricResults?: readonly EvaluationMetricResult[];
  readonly limitations?: readonly string[];
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationSummary {
  const counts = {
    passCount: 0,
    failCount: 0,
    partialCount: 0,
    inconclusiveCount: 0,
    notEvaluableCount: 0,
    errorCount: 0,
  };
  for (const result of input.results) {
    switch (result.verdict) {
      case "PASS":
        counts.passCount += 1;
        break;
      case "FAIL":
        counts.failCount += 1;
        break;
      case "PARTIAL":
        counts.partialCount += 1;
        break;
      case "INCONCLUSIVE":
        counts.inconclusiveCount += 1;
        break;
      case "NOT_EVALUABLE":
        counts.notEvaluableCount += 1;
        break;
      case "ERROR":
        counts.errorCount += 1;
        break;
      default:
        break;
    }
  }
  const totalCases = input.results.length;
  const completed = input.results.filter((r) => r.verdict !== "PENDING").length;
  const aggregatedMetrics = aggregateMetricResults(input.results, input.metricResults);
  const contentHash = sha256Canonical({
    evaluationRunId: input.evaluationRunId,
    totalCases,
    ...counts,
    metricResults: aggregatedMetrics,
  });
  return freezeDeep({
    ...envelope(input),
    summaryId: input.summaryId,
    evaluationRunId: input.evaluationRunId,
    totalCases,
    completed,
    ...counts,
    metricResults: Object.freeze([...aggregatedMetrics]),
    ...(input.limitations ? { limitations: Object.freeze([...input.limitations]) } : {}),
    contentHash,
  });
}

export function aggregateMetricResults(
  results: readonly EvaluationCaseResult[],
  extra?: readonly EvaluationMetricResult[],
): readonly EvaluationMetricResult[] {
  const passRate = results.length === 0 ? 0 : results.filter((r) => r.verdict === "PASS").length / results.length;
  const failRate = results.length === 0 ? 0 : results.filter((r) => r.verdict === "FAIL").length / results.length;
  const base: EvaluationMetricResult[] = [
    { metricId: "pass_rate", metricVersion: "1", value: passRate, unit: "rate" },
    { metricId: "fail_rate", metricVersion: "1", value: failRate, unit: "rate" },
    { metricId: "pass_count", metricVersion: "1", value: results.filter((r) => r.verdict === "PASS").length, unit: "count" },
    { metricId: "fail_count", metricVersion: "1", value: results.filter((r) => r.verdict === "FAIL").length, unit: "count" },
  ];
  if (extra) {
    return Object.freeze([...base, ...extra]);
  }
  return Object.freeze(base);
}

export function assertEvaluationRunIdempotency(
  existing: EvaluationRun | undefined,
  fingerprint: string,
  idempotencyKey: string,
): EvaluationRun | undefined {
  if (!existing) {
    return undefined;
  }
  if (existing.idempotencyKey !== idempotencyKey) {
    throw new GovernanceError(
      GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
      `run id ${existing.runId} already bound to different idempotency key`,
    );
  }
  if (existing.runFingerprint !== fingerprint) {
    throw new GovernanceError(
      GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
      "idempotency key reused with different evaluation configuration",
    );
  }
  return existing;
}

export function mapEvaluatorVerdict(
  verdict: EvaluationCaseResultVerdict,
): EvaluationCaseResultVerdict {
  return requireNonEmpty(verdict, "verdict") as EvaluationCaseResultVerdict;
}
