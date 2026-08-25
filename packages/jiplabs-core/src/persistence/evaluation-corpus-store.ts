import { deserializeGovernanceRecord, serializeGovernanceRecord } from "./serialization.js";
import type { EvaluationCorpusStore } from "../evaluation-corpus/contracts.js";
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
} from "../evaluation-corpus/types.js";
import type { SqliteDatabase } from "./sqlite/storage.js";

type EntityKind =
  | "candidate"
  | "admission"
  | "case"
  | "case_version"
  | "suite"
  | "suite_version"
  | "run"
  | "run_idempotency"
  | "case_result"
  | "summary"
  | "baseline"
  | "regression"
  | "signal"
  | "recommendation";

function saveEntity(db: SqliteDatabase, kind: EntityKind, primaryKey: string, payload: unknown, secondaryKey = "", fingerprint?: string): void {
  db.prepare(
    `INSERT INTO evaluation_corpus_entities (kind, primary_key, secondary_key, fingerprint, record_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(kind, primary_key, secondary_key) DO UPDATE SET fingerprint = excluded.fingerprint, record_json = excluded.record_json`,
  ).run(kind, primaryKey, secondaryKey, fingerprint ?? null, serializeGovernanceRecord(payload));
}

function getEntity<T>(db: SqliteDatabase, kind: EntityKind, primaryKey: string, secondaryKey = ""): T | undefined {
  const row = db
    .prepare(
      "SELECT record_json FROM evaluation_corpus_entities WHERE kind = ? AND primary_key = ? AND secondary_key = ?",
    )
    .get(kind, primaryKey, secondaryKey) as { record_json: string } | undefined;
  if (!row) return undefined;
  return deserializeGovernanceRecord<T>(row.record_json);
}

function listEntities<T>(db: SqliteDatabase, kind: EntityKind): readonly T[] {
  const rows = db
    .prepare("SELECT record_json FROM evaluation_corpus_entities WHERE kind = ?")
    .all(kind) as Array<{ record_json: string }>;
  return rows.map((row) => deserializeGovernanceRecord<T>(row.record_json));
}

export class SqliteEvaluationCorpusStore implements EvaluationCorpusStore {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  saveCandidate(candidate: EvaluationCaseCandidate): void {
    saveEntity(this.#db, "candidate", candidate.candidateId, candidate, "", candidate.fingerprint);
  }

  getCandidate(candidateId: string): EvaluationCaseCandidate | undefined {
    return getEntity(this.#db, "candidate", candidateId);
  }

  getCandidateByFingerprint(fingerprint: string): EvaluationCaseCandidate | undefined {
    const row = this.#db
      .prepare("SELECT record_json FROM evaluation_corpus_entities WHERE kind = 'candidate' AND fingerprint = ?")
      .get(fingerprint) as { record_json: string } | undefined;
    return row ? deserializeGovernanceRecord<EvaluationCaseCandidate>(row.record_json) : undefined;
  }

  listCandidates(filter?: { readonly domain?: string; readonly status?: string }): readonly EvaluationCaseCandidate[] {
    return listEntities<EvaluationCaseCandidate>(this.#db, "candidate").filter((c) => {
      if (filter?.domain && c.domain !== filter.domain) return false;
      if (filter?.status && c.status !== filter.status) return false;
      return true;
    });
  }

  saveAdmission(admission: EvaluationCaseAdmission): void {
    saveEntity(this.#db, "admission", admission.admissionId, admission, admission.candidateId);
  }

  getAdmission(admissionId: string): EvaluationCaseAdmission | undefined {
    return getEntity(this.#db, "admission", admissionId);
  }

  listAdmissions(candidateId: string): readonly EvaluationCaseAdmission[] {
    return listEntities<EvaluationCaseAdmission>(this.#db, "admission").filter((a) => a.candidateId === candidateId);
  }

  saveCase(caseRecord: EvaluationCase): void {
    saveEntity(this.#db, "case", caseRecord.caseId, caseRecord);
  }

  getCase(caseId: string): EvaluationCase | undefined {
    return getEntity(this.#db, "case", caseId);
  }

  listCases(filter?: { readonly domain?: string }): readonly EvaluationCase[] {
    return listEntities<EvaluationCase>(this.#db, "case").filter((c) => !filter?.domain || c.domain === filter.domain);
  }

  saveCaseVersion(version: EvaluationCaseVersion): void {
    saveEntity(this.#db, "case_version", version.caseId, version, version.version, version.fingerprint);
  }

  getCaseVersion(caseId: string, version: string): EvaluationCaseVersion | undefined {
    return getEntity(this.#db, "case_version", caseId, version);
  }

  getCaseVersionByFingerprint(fingerprint: string): EvaluationCaseVersion | undefined {
    const row = this.#db
      .prepare("SELECT record_json FROM evaluation_corpus_entities WHERE kind = 'case_version' AND fingerprint = ?")
      .get(fingerprint) as { record_json: string } | undefined;
    return row ? deserializeGovernanceRecord<EvaluationCaseVersion>(row.record_json) : undefined;
  }

  listCaseVersions(caseId: string): readonly EvaluationCaseVersion[] {
    return listEntities<EvaluationCaseVersion>(this.#db, "case_version").filter((v) => v.caseId === caseId);
  }

  saveSuite(suite: EvaluationSuite): void {
    saveEntity(this.#db, "suite", suite.suiteId, suite);
  }

  getSuite(suiteId: string): EvaluationSuite | undefined {
    return getEntity(this.#db, "suite", suiteId);
  }

  saveSuiteVersion(version: EvaluationSuiteVersion): void {
    saveEntity(this.#db, "suite_version", version.suiteId, version, version.version, version.contentHash);
  }

  getSuiteVersion(suiteId: string, version: string): EvaluationSuiteVersion | undefined {
    return getEntity(this.#db, "suite_version", suiteId, version);
  }

  listSuiteVersions(suiteId: string): readonly EvaluationSuiteVersion[] {
    return listEntities<EvaluationSuiteVersion>(this.#db, "suite_version").filter((v) => v.suiteId === suiteId);
  }

  saveRun(run: EvaluationRun): void {
    saveEntity(this.#db, "run", run.runId, run, "", run.runFingerprint);
    saveEntity(this.#db, "run_idempotency", run.idempotencyKey, run, run.runId);
  }

  getRun(runId: string): EvaluationRun | undefined {
    return getEntity(this.#db, "run", runId);
  }

  getRunByIdempotencyKey(key: string): EvaluationRun | undefined {
    const row = this.#db
      .prepare("SELECT record_json FROM evaluation_corpus_entities WHERE kind = 'run_idempotency' AND primary_key = ?")
      .get(key) as { record_json: string } | undefined;
    return row ? deserializeGovernanceRecord<EvaluationRun>(row.record_json) : undefined;
  }

  listRuns(filter?: { readonly suiteId?: string; readonly targetId?: string }): readonly EvaluationRun[] {
    return listEntities<EvaluationRun>(this.#db, "run").filter((r) => {
      if (filter?.suiteId && r.suiteId !== filter.suiteId) return false;
      if (filter?.targetId && r.target.targetId !== filter.targetId) return false;
      return true;
    });
  }

  saveCaseResult(result: EvaluationCaseResult): void {
    saveEntity(this.#db, "case_result", result.resultId, result);
  }

  getCaseResult(resultId: string): EvaluationCaseResult | undefined {
    return getEntity(this.#db, "case_result", resultId);
  }

  listCaseResults(evaluationRunId: string): readonly EvaluationCaseResult[] {
    return listEntities<EvaluationCaseResult>(this.#db, "case_result").filter((r) => r.evaluationRunId === evaluationRunId);
  }

  saveSummary(summary: EvaluationSummary): void {
    saveEntity(this.#db, "summary", summary.summaryId, summary);
  }

  getSummary(summaryId: string): EvaluationSummary | undefined {
    return getEntity(this.#db, "summary", summaryId);
  }

  saveBaseline(baseline: EvaluationBaseline): void {
    saveEntity(this.#db, "baseline", baseline.baselineId, baseline);
  }

  getBaseline(baselineId: string): EvaluationBaseline | undefined {
    return getEntity(this.#db, "baseline", baselineId);
  }

  getActiveBaseline(input: {
    readonly targetId: string;
    readonly targetVersion: string;
    readonly suiteId: string;
    readonly suiteVersion: string;
  }): EvaluationBaseline | undefined {
    const matches = listEntities<EvaluationBaseline>(this.#db, "baseline").filter(
      (b) =>
        b.targetId === input.targetId &&
        b.targetVersion === input.targetVersion &&
        b.suiteId === input.suiteId &&
        b.suiteVersion === input.suiteVersion,
    );
    return matches.sort((a, b) => b.establishedAt.localeCompare(a.establishedAt))[0];
  }

  listBaselines(filter?: { readonly suiteId?: string }): readonly EvaluationBaseline[] {
    return listEntities<EvaluationBaseline>(this.#db, "baseline").filter((b) => !filter?.suiteId || b.suiteId === filter.suiteId);
  }

  saveRegressionComparison(comparison: RegressionComparison): void {
    saveEntity(this.#db, "regression", comparison.comparisonId, comparison);
  }

  getRegressionComparison(comparisonId: string): RegressionComparison | undefined {
    return getEntity(this.#db, "regression", comparisonId);
  }

  saveLearningSignal(signal: LearningSignal): void {
    saveEntity(this.#db, "signal", signal.signalId, signal);
  }

  getLearningSignal(signalId: string): LearningSignal | undefined {
    return getEntity(this.#db, "signal", signalId);
  }

  listLearningSignals(filter?: { readonly domain?: string }): readonly LearningSignal[] {
    return listEntities<LearningSignal>(this.#db, "signal").filter((s) => !filter?.domain || s.domain === filter.domain);
  }

  saveGovernanceRecommendation(recommendation: GovernanceRecommendation): void {
    saveEntity(this.#db, "recommendation", recommendation.recommendationId, recommendation);
  }

  getGovernanceRecommendation(recommendationId: string): GovernanceRecommendation | undefined {
    return getEntity(this.#db, "recommendation", recommendationId);
  }
}
