import type { EvaluationCorpusStore } from "./contracts.js";
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
  GovernanceRecommendation,
  LearningSignal,
  RegressionComparison,
} from "./types.js";
export class InMemoryEvaluationCorpusStore implements EvaluationCorpusStore {
  readonly #candidates = new Map<string, EvaluationCaseCandidate>();
  readonly #candidatesByFingerprint = new Map<string, EvaluationCaseCandidate>();
  readonly #admissions = new Map<string, EvaluationCaseAdmission>();
  readonly #admissionsByCandidate = new Map<string, EvaluationCaseAdmission[]>();
  readonly #cases = new Map<string, EvaluationCase>();
  readonly #caseVersions = new Map<string, EvaluationCaseVersion>();
  readonly #caseVersionsByFingerprint = new Map<string, EvaluationCaseVersion>();
  readonly #suites = new Map<string, EvaluationSuite>();
  readonly #suiteVersions = new Map<string, EvaluationSuiteVersion>();
  readonly #runs = new Map<string, EvaluationRun>();
  readonly #runsByIdempotency = new Map<string, EvaluationRun>();
  readonly #caseResults = new Map<string, EvaluationCaseResult>();
  readonly #caseResultsByRun = new Map<string, EvaluationCaseResult[]>();
  readonly #summaries = new Map<string, EvaluationSummary>();
  readonly #baselines = new Map<string, EvaluationBaseline>();
  readonly #comparisons = new Map<string, RegressionComparison>();
  readonly #signals = new Map<string, LearningSignal>();
  readonly #recommendations = new Map<string, GovernanceRecommendation>();

  saveCandidate(candidate: EvaluationCaseCandidate): void {
    this.#candidates.set(candidate.candidateId, candidate);
    this.#candidatesByFingerprint.set(candidate.fingerprint, candidate);
  }

  getCandidate(candidateId: string): EvaluationCaseCandidate | undefined {
    return this.#candidates.get(candidateId);
  }

  getCandidateByFingerprint(fingerprint: string): EvaluationCaseCandidate | undefined {
    return this.#candidatesByFingerprint.get(fingerprint);
  }

  listCandidates(filter?: { readonly domain?: string; readonly status?: string }): readonly EvaluationCaseCandidate[] {
    return [...this.#candidates.values()].filter((c) => {
      if (filter?.domain && c.domain !== filter.domain) return false;
      if (filter?.status && c.status !== filter.status) return false;
      return true;
    });
  }

  saveAdmission(admission: EvaluationCaseAdmission): void {
    this.#admissions.set(admission.admissionId, admission);
    const list = this.#admissionsByCandidate.get(admission.candidateId) ?? [];
    list.push(admission);
    this.#admissionsByCandidate.set(admission.candidateId, list);
  }

  getAdmission(admissionId: string): EvaluationCaseAdmission | undefined {
    return this.#admissions.get(admissionId);
  }

  listAdmissions(candidateId: string): readonly EvaluationCaseAdmission[] {
    return this.#admissionsByCandidate.get(candidateId) ?? [];
  }

  saveCase(caseRecord: EvaluationCase): void {
    this.#cases.set(caseRecord.caseId, caseRecord);
  }

  getCase(caseId: string): EvaluationCase | undefined {
    return this.#cases.get(caseId);
  }

  listCases(filter?: { readonly domain?: string }): readonly EvaluationCase[] {
    return [...this.#cases.values()].filter((c) => !filter?.domain || c.domain === filter.domain);
  }

  saveCaseVersion(version: EvaluationCaseVersion): void {
    this.#caseVersions.set(`${version.caseId}:${version.version}`, version);
    this.#caseVersionsByFingerprint.set(version.fingerprint, version);
  }

  getCaseVersion(caseId: string, version: string): EvaluationCaseVersion | undefined {
    return this.#caseVersions.get(`${caseId}:${version}`);
  }

  getCaseVersionByFingerprint(fingerprint: string): EvaluationCaseVersion | undefined {
    return this.#caseVersionsByFingerprint.get(fingerprint);
  }

  listCaseVersions(caseId: string): readonly EvaluationCaseVersion[] {
    return [...this.#caseVersions.values()].filter((v) => v.caseId === caseId);
  }

  saveSuite(suite: EvaluationSuite): void {
    this.#suites.set(suite.suiteId, suite);
  }

  getSuite(suiteId: string): EvaluationSuite | undefined {
    return this.#suites.get(suiteId);
  }

  saveSuiteVersion(version: EvaluationSuiteVersion): void {
    this.#suiteVersions.set(`${version.suiteId}:${version.version}`, version);
  }

  getSuiteVersion(suiteId: string, version: string): EvaluationSuiteVersion | undefined {
    return this.#suiteVersions.get(`${suiteId}:${version}`);
  }

  listSuiteVersions(suiteId: string): readonly EvaluationSuiteVersion[] {
    return [...this.#suiteVersions.values()].filter((v) => v.suiteId === suiteId);
  }

  saveRun(run: EvaluationRun): void {
    this.#runs.set(run.runId, run);
    this.#runsByIdempotency.set(run.idempotencyKey, run);
  }

  getRun(runId: string): EvaluationRun | undefined {
    return this.#runs.get(runId);
  }

  getRunByIdempotencyKey(key: string): EvaluationRun | undefined {
    return this.#runsByIdempotency.get(key);
  }

  listRuns(filter?: { readonly suiteId?: string; readonly targetId?: string }): readonly EvaluationRun[] {
    return [...this.#runs.values()].filter((r) => {
      if (filter?.suiteId && r.suiteId !== filter.suiteId) return false;
      if (filter?.targetId && r.target.targetId !== filter.targetId) return false;
      return true;
    });
  }

  saveCaseResult(result: EvaluationCaseResult): void {
    this.#caseResults.set(result.resultId, result);
    const list = this.#caseResultsByRun.get(result.evaluationRunId) ?? [];
    list.push(result);
    this.#caseResultsByRun.set(result.evaluationRunId, list);
  }

  getCaseResult(resultId: string): EvaluationCaseResult | undefined {
    return this.#caseResults.get(resultId);
  }

  listCaseResults(evaluationRunId: string): readonly EvaluationCaseResult[] {
    return this.#caseResultsByRun.get(evaluationRunId) ?? [];
  }

  saveSummary(summary: EvaluationSummary): void {
    this.#summaries.set(summary.summaryId, summary);
  }

  getSummary(summaryId: string): EvaluationSummary | undefined {
    return this.#summaries.get(summaryId);
  }

  saveBaseline(baseline: EvaluationBaseline): void {
    this.#baselines.set(baseline.baselineId, baseline);
  }

  getBaseline(baselineId: string): EvaluationBaseline | undefined {
    return this.#baselines.get(baselineId);
  }

  getActiveBaseline(input: {
    readonly targetId: string;
    readonly targetVersion: string;
    readonly suiteId: string;
    readonly suiteVersion: string;
  }): EvaluationBaseline | undefined {
    const matches = [...this.#baselines.values()].filter(
      (b) =>
        b.targetId === input.targetId &&
        b.targetVersion === input.targetVersion &&
        b.suiteId === input.suiteId &&
        b.suiteVersion === input.suiteVersion,
    );
    return matches.sort((a, b) => b.establishedAt.localeCompare(a.establishedAt))[0];
  }

  listBaselines(filter?: { readonly suiteId?: string }): readonly EvaluationBaseline[] {
    return [...this.#baselines.values()].filter((b) => !filter?.suiteId || b.suiteId === filter.suiteId);
  }

  saveRegressionComparison(comparison: RegressionComparison): void {
    this.#comparisons.set(comparison.comparisonId, comparison);
  }

  getRegressionComparison(comparisonId: string): RegressionComparison | undefined {
    return this.#comparisons.get(comparisonId);
  }

  saveLearningSignal(signal: LearningSignal): void {
    this.#signals.set(signal.signalId, signal);
  }

  getLearningSignal(signalId: string): LearningSignal | undefined {
    return this.#signals.get(signalId);
  }

  listLearningSignals(filter?: { readonly domain?: string }): readonly LearningSignal[] {
    return [...this.#signals.values()].filter((s) => !filter?.domain || s.domain === filter.domain);
  }

  saveGovernanceRecommendation(recommendation: GovernanceRecommendation): void {
    this.#recommendations.set(recommendation.recommendationId, recommendation);
  }

  getGovernanceRecommendation(recommendationId: string): GovernanceRecommendation | undefined {
    return this.#recommendations.get(recommendationId);
  }
}
