import type { CoreEvaluationVerdict } from "../evaluation/index.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  JsonSafeValue,
  Provenance,
  Ref,
} from "../schema.js";

/** Origin refs for a candidate — immutable hashes/refs, not full record copies. */
export type EvaluationCaseProvenance = {
  readonly sourceKind:
    | "INCORRECT_EVALUATION"
    | "PARTIAL_EVALUATION"
    | "ROLLBACK"
    | "FAILED_ACTION"
    | "HUMAN_CHALLENGE"
    | "HUMAN_OVERRIDE"
    | "RECONCILIATION_INCIDENT"
    | "UNEXPECTED_EDGE"
    | "MANUAL_REFERENCE"
    | "DOMAIN_FAILURE_SIGNAL";
  readonly runId?: string;
  readonly decisionId?: string;
  readonly decisionHash?: string;
  readonly actionRequestId?: string;
  readonly actionResultId?: string;
  readonly outcomeId?: string;
  readonly evaluationId?: string;
  readonly evaluationVerdict?: CoreEvaluationVerdict;
  readonly rollbackId?: string;
  readonly overrideId?: string;
  readonly traceId?: string;
  readonly evidenceRefs?: readonly string[];
  readonly governanceEventIds?: readonly string[];
  readonly metadata?: JsonSafeMetadata;
};

export type EvaluationCaseCandidateStatus =
  | "PENDING"
  | "ADMITTED"
  | "REJECTED"
  | "QUARANTINED"
  | "NEEDS_REVIEW";

export type EvaluationCaseCandidate = EntityEnvelope & {
  readonly candidateId: string;
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly fingerprint: string;
  readonly sourceProvenance: EvaluationCaseProvenance;
  readonly inputContextRefs: readonly Ref[];
  readonly evidenceRefs: readonly string[];
  readonly tags?: readonly string[];
  readonly status: EvaluationCaseCandidateStatus;
  readonly contentHash: string;
};

export type CaseAdmissionOutcome = "ADMIT" | "REJECT" | "QUARANTINE" | "NEEDS_REVIEW";

export type EvaluationCaseAdmission = EntityEnvelope & {
  readonly admissionId: string;
  readonly candidateId: string;
  readonly outcome: CaseAdmissionOutcome;
  readonly rationale: string;
  readonly admittedByActorId: string;
  readonly policyVersionId?: string;
  readonly humanApprovalRequired: boolean;
  readonly humanApproved?: boolean;
  readonly caseId?: string;
  readonly caseVersion?: string;
};

export type EvaluationCaseStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "QUARANTINED";

export type EvaluationExpectation = {
  readonly kind: string;
  readonly expected: JsonSafeValue;
  readonly description?: string;
};

export type EvaluationCriterion = {
  readonly id: string;
  readonly code: string;
  readonly description?: string;
  readonly mandatory: boolean;
  readonly metadata?: JsonSafeMetadata;
};

export type EvaluationCaseVersion = EntityEnvelope & {
  readonly caseId: string;
  readonly version: string;
  readonly status: EvaluationCaseStatus;
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly inputContextRefs: readonly Ref[];
  readonly evidenceRefs: readonly string[];
  readonly expectation: EvaluationExpectation;
  readonly criteria: readonly EvaluationCriterion[];
  readonly limitations?: readonly string[];
  readonly tags?: readonly string[];
  readonly severity?: string;
  readonly effectiveFrom: IsoTimestamp;
  readonly effectiveUntil?: IsoTimestamp | null;
  readonly supersedes?: { readonly caseId: string; readonly version: string };
  readonly candidateId?: string;
  readonly admissionId?: string;
  readonly fingerprint: string;
  readonly contentHash: string;
  readonly immutable: boolean;
  readonly activatedAt: IsoTimestamp | null;
};

export type EvaluationCase = EntityEnvelope & {
  readonly caseId: string;
  readonly domain: string;
  readonly activeVersion: string;
  readonly fingerprint: string;
};

export type EvaluationSuiteStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED";

export type EvaluationSuite = EntityEnvelope & {
  readonly suiteId: string;
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
};

export type EvaluationSuiteVersion = EntityEnvelope & {
  readonly suiteId: string;
  readonly version: string;
  readonly status: EvaluationSuiteStatus;
  readonly domain: string;
  readonly title: string;
  readonly caseVersionRefs: readonly { readonly caseId: string; readonly version: string }[];
  readonly effectiveFrom: IsoTimestamp;
  readonly supersedes?: { readonly suiteId: string; readonly version: string };
  readonly contentHash: string;
  readonly immutable: boolean;
  readonly activatedAt: IsoTimestamp | null;
};

export type EvaluationTargetType =
  | "SYSTEM"
  | "ALGORITHM"
  | "MODEL"
  | "AGENT"
  | "RULE_PACK"
  | "POLICY_IMPLEMENTATION"
  | "DOMAIN_CAPABILITY"
  | "OTHER";

export type EvaluationTarget = EntityEnvelope & {
  readonly targetId: string;
  readonly targetType: EvaluationTargetType;
  readonly version: string;
  readonly code?: string;
  readonly artifactHash?: string;
  readonly runtimeMetadata?: JsonSafeMetadata;
};

export type EvaluationRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type EvaluationRun = EntityEnvelope & {
  readonly runId: string;
  readonly status: EvaluationRunStatus;
  readonly target: EvaluationTarget;
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly caseVersionRefs: readonly { readonly caseId: string; readonly version: string }[];
  readonly evaluatorActorId: string;
  readonly evaluatorVersion?: string;
  readonly configuration: JsonSafeMetadata;
  readonly idempotencyKey: string;
  readonly runFingerprint: string;
  readonly startedAt: IsoTimestamp;
  readonly completedAt?: IsoTimestamp | null;
  readonly summaryId?: string;
  readonly observationMode: true;
};

export type EvaluationCaseResultVerdict =
  | "PASS"
  | "FAIL"
  | "PARTIAL"
  | "INCONCLUSIVE"
  | "PENDING"
  | "NOT_EVALUABLE"
  | "ERROR";

export type EvaluationMetricDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "EXACT";

export type EvaluationMetric = EntityEnvelope & {
  readonly metricId: string;
  readonly version: string;
  readonly unit?: string;
  readonly valueType: "COUNT" | "RATE" | "BOOLEAN" | "NUMERIC" | "TEXT";
  readonly direction?: EvaluationMetricDirection;
  readonly aggregation?: "SUM" | "AVG" | "MIN" | "MAX" | "LAST";
  readonly threshold?: JsonSafeValue;
};

export type EvaluationMetricResult = {
  readonly metricId: string;
  readonly metricVersion: string;
  readonly value: JsonSafeValue;
  readonly unit?: string;
  readonly withinThreshold?: boolean;
};

export type EvaluationCaseResult = EntityEnvelope & {
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
  readonly contentHash: string;
  readonly evaluatedAt: IsoTimestamp;
};

export type EvaluationSummary = EntityEnvelope & {
  readonly summaryId: string;
  readonly evaluationRunId: string;
  readonly totalCases: number;
  readonly completed: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly partialCount: number;
  readonly inconclusiveCount: number;
  readonly notEvaluableCount: number;
  readonly errorCount: number;
  readonly metricResults: readonly EvaluationMetricResult[];
  readonly limitations?: readonly string[];
  readonly contentHash: string;
};

export type EvaluationBaseline = EntityEnvelope & {
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
  readonly immutable: true;
};

export type RegressionAssessment =
  | "IMPROVED"
  | "UNCHANGED"
  | "REGRESSED"
  | "MIXED"
  | "INCOMPARABLE"
  | "INSUFFICIENT_DATA";

export type RegressionComparison = EntityEnvelope & {
  readonly comparisonId: string;
  readonly candidateRunId: string;
  readonly baselineId: string;
  readonly assessment: RegressionAssessment;
  readonly rationale: string;
  readonly metricDeltas?: readonly {
    readonly metricId: string;
    readonly baselineValue: JsonSafeValue;
    readonly candidateValue: JsonSafeValue;
    readonly direction: EvaluationMetricDirection;
    readonly improved: boolean;
    readonly regressed: boolean;
  }[];
  readonly contentHash: string;
};

export type LearningSignalKind =
  | "NEW_FAILURE_PATTERN"
  | "REGRESSION_DETECTED"
  | "RECURRENT_FAILURE"
  | "IMPROVEMENT_DETECTED"
  | "EVALUATION_GAP"
  | "INSUFFICIENT_EVIDENCE"
  | "ROLLBACK_CONFIRMED"
  | "HUMAN_OVERRIDE_CONFIRMED"
  | "UNEXPECTED_OUTCOME";

export type LearningSignal = EntityEnvelope & {
  readonly signalId: string;
  readonly kind: LearningSignalKind;
  readonly domain: string;
  readonly rationale: string;
  readonly refs: readonly Ref[];
  readonly evaluationRunId?: string;
  readonly comparisonId?: string;
  readonly caseId?: string;
  readonly metadata?: JsonSafeMetadata;
};

export type GovernanceRecommendationKind =
  | "REASSESS_POLICY"
  | "REASSESS_AUTHORITY"
  | "ADD_EVALUATION_CASES"
  | "EXPAND_TEST_COVERAGE"
  | "RESTRICT_RESPONSIBILITY"
  | "INVESTIGATE"
  | "NO_CHANGE"
  | "CANDIDATE_FOR_PROMOTION_REVIEW";

export type GovernanceRecommendation = EntityEnvelope & {
  readonly recommendationId: string;
  readonly kind: GovernanceRecommendationKind;
  readonly domain: string;
  readonly rationale: string;
  readonly signalIds?: readonly string[];
  readonly refs: readonly Ref[];
  readonly metadata?: JsonSafeMetadata;
};

export type EvaluationCorpusEventType =
  | "EVALUATION_CASE_CANDIDATE_RECORDED"
  | "EVALUATION_CASE_ADMITTED"
  | "EVALUATION_CASE_REJECTED"
  | "EVALUATION_CASE_QUARANTINED"
  | "EVALUATION_CASE_VERSION_ACTIVATED"
  | "EVALUATION_SUITE_VERSION_ACTIVATED"
  | "EVALUATION_RUN_STARTED"
  | "EVALUATION_RUN_COMPLETED"
  | "BASELINE_ESTABLISHED"
  | "REGRESSION_DETECTED"
  | "LEARNING_SIGNAL_RECORDED"
  | "GOVERNANCE_RECOMMENDATION_CREATED";

export type EvaluationCorpusEvent = EntityEnvelope & {
  readonly eventId: string;
  readonly eventType: EvaluationCorpusEventType;
  readonly occurredAt: IsoTimestamp;
  readonly actorId: string;
  readonly payloadRef: string;
  readonly idempotencyKey: string;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
};
