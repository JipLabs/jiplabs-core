import type { PolicyVersion } from "../policies/index.js";
import type { AuthorityGrant } from "../authority/index.js";
import type { GovernanceLedger } from "../ledger/index.js";
import type { IsoTimestamp, JsonSafeMetadata, JsonSafeValue, Provenance } from "../schema.js";
import type {
  EvaluationBaseline,
  EvaluationCase,
  EvaluationCaseAdmission,
  EvaluationCaseCandidate,
  EvaluationCaseResult,
  EvaluationCaseVersion,
  EvaluationRun,
  EvaluationSuite,
  EvaluationSuiteVersion,
  EvaluationSummary,
  EvaluationTarget,
  GovernanceRecommendation,
  LearningSignal,
  RegressionComparison,
} from "./types.js";

export type EvaluationCaseEvaluatorInput = {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly inputContextRefs: readonly { readonly type: string; readonly id: string; readonly domain?: string }[];
  readonly expectation: { readonly kind: string; readonly expected: unknown };
  readonly criteria: readonly { readonly id: string; readonly code: string; readonly mandatory: boolean }[];
  readonly configuration: JsonSafeMetadata;
};

export type EvaluationCaseEvaluatorResult = {
  readonly verdict: "PASS" | "FAIL" | "PARTIAL" | "INCONCLUSIVE" | "PENDING" | "NOT_EVALUABLE" | "ERROR";
  readonly evidenceRefs?: readonly string[];
  readonly outputRefs?: readonly string[];
  readonly domainPayload?: JsonSafeMetadata;
  readonly limitations?: readonly string[];
};

export interface EvaluationCaseEvaluator {
  readonly evaluatorId: string;
  readonly version?: string;
  evaluate(input: EvaluationCaseEvaluatorInput): EvaluationCaseEvaluatorResult | Promise<EvaluationCaseEvaluatorResult>;
}

export interface EvaluationTargetRunner {
  readonly runnerId: string;
  readonly version?: string;
  prepareTarget(target: EvaluationTarget): void | Promise<void>;
}

export type EvaluationAdmissionPolicy = {
  readonly policyVersion: PolicyVersion;
  readonly authority: import("../authority/index.js").Authority;
  readonly grant: AuthorityGrant | null;
  readonly requireHumanApproval?: boolean;
};

export interface EvaluationCorpusStore {
  saveCandidate(candidate: EvaluationCaseCandidate): void;
  getCandidate(candidateId: string): EvaluationCaseCandidate | undefined;
  getCandidateByFingerprint(fingerprint: string): EvaluationCaseCandidate | undefined;
  listCandidates(filter?: { readonly domain?: string; readonly status?: string }): readonly EvaluationCaseCandidate[];

  saveAdmission(admission: EvaluationCaseAdmission): void;
  getAdmission(admissionId: string): EvaluationCaseAdmission | undefined;
  listAdmissions(candidateId: string): readonly EvaluationCaseAdmission[];

  saveCase(caseRecord: EvaluationCase): void;
  getCase(caseId: string): EvaluationCase | undefined;
  listCases(filter?: { readonly domain?: string }): readonly EvaluationCase[];

  saveCaseVersion(version: EvaluationCaseVersion): void;
  getCaseVersion(caseId: string, version: string): EvaluationCaseVersion | undefined;
  getCaseVersionByFingerprint(fingerprint: string): EvaluationCaseVersion | undefined;
  listCaseVersions(caseId: string): readonly EvaluationCaseVersion[];

  saveSuite(suite: EvaluationSuite): void;
  getSuite(suiteId: string): EvaluationSuite | undefined;

  saveSuiteVersion(version: EvaluationSuiteVersion): void;
  getSuiteVersion(suiteId: string, version: string): EvaluationSuiteVersion | undefined;
  listSuiteVersions(suiteId: string): readonly EvaluationSuiteVersion[];

  saveRun(run: EvaluationRun): void;
  getRun(runId: string): EvaluationRun | undefined;
  getRunByIdempotencyKey(key: string): EvaluationRun | undefined;
  listRuns(filter?: { readonly suiteId?: string; readonly targetId?: string }): readonly EvaluationRun[];

  saveCaseResult(result: EvaluationCaseResult): void;
  getCaseResult(resultId: string): EvaluationCaseResult | undefined;
  listCaseResults(evaluationRunId: string): readonly EvaluationCaseResult[];

  saveSummary(summary: EvaluationSummary): void;
  getSummary(summaryId: string): EvaluationSummary | undefined;

  saveBaseline(baseline: EvaluationBaseline): void;
  getBaseline(baselineId: string): EvaluationBaseline | undefined;
  getActiveBaseline(input: {
    readonly targetId: string;
    readonly targetVersion: string;
    readonly suiteId: string;
    readonly suiteVersion: string;
  }): EvaluationBaseline | undefined;
  listBaselines(filter?: { readonly suiteId?: string }): readonly EvaluationBaseline[];

  saveRegressionComparison(comparison: RegressionComparison): void;
  getRegressionComparison(comparisonId: string): RegressionComparison | undefined;

  saveLearningSignal(signal: LearningSignal): void;
  getLearningSignal(signalId: string): LearningSignal | undefined;
  listLearningSignals(filter?: { readonly domain?: string }): readonly LearningSignal[];

  saveGovernanceRecommendation(recommendation: GovernanceRecommendation): void;
  getGovernanceRecommendation(recommendationId: string): GovernanceRecommendation | undefined;
}

export type EvaluationCorpusDeps = {
  readonly store: EvaluationCorpusStore;
  readonly ledger?: GovernanceLedger;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
};

export type ExecuteEvaluationRunInput = {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly target: EvaluationTarget;
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly evaluatorActorId: string;
  readonly evaluatorVersion?: string;
  readonly configuration?: JsonSafeMetadata;
  readonly caseEvaluator: EvaluationCaseEvaluator;
  readonly targetRunner?: EvaluationTargetRunner;
};

export type AdmitCandidateInput = {
  readonly admissionId: string;
  readonly candidateId: string;
  readonly outcome: "ADMIT" | "REJECT" | "QUARANTINE" | "NEEDS_REVIEW";
  readonly rationale: string;
  readonly admittedByActorId: string;
  readonly caseId?: string;
  readonly caseVersion?: string;
  readonly expectation?: { readonly kind: string; readonly expected: JsonSafeValue; readonly description?: string };
  readonly criteria?: readonly { readonly id: string; readonly code: string; readonly mandatory: boolean; readonly description?: string }[];
  readonly admissionPolicy?: EvaluationAdmissionPolicy;
  readonly humanApproved?: boolean;
};

export type RegressionConfig = {
  readonly failRateIncreaseThreshold?: number;
  readonly passRateDecreaseThreshold?: number;
};
