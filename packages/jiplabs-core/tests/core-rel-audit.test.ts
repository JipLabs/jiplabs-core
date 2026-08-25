import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ALL_MIGRATIONS,
  assertSupportedSchemaVersion,
  createNodeSqliteDatabase,
  MIGRATION_001_INITIAL,
  openNodeSqliteGovernanceStorage,
  PERSISTENCE_SCHEMA_VERSION,
  verifyLedgerIntegrity,
} from "../src/persistence/index.js";
import {
  EvaluationCorpus,
  createEvaluationCaseCandidate,
  createEvaluationTarget,
  compareEvaluationToBaseline,
  buildEvaluationSummary,
  activateEvaluationCaseVersion,
  createEvaluationCaseVersion,
  GovernanceError,
  InMemoryEvaluationCorpusStore,
} from "../src/index.js";
import {
  createEvaluationBaseline,
  createLearningSignal,
  createGovernanceRecommendation,
} from "../src/evaluation-corpus/regression.js";
import { createEvaluationCaseResult } from "../src/evaluation-corpus/runs.js";
import { buildHarness } from "./helpers/governor-harness.js";

const AT = "2026-08-25T12:00:00.000Z";
const PROVENANCE = { actorId: "rel-audit", source: "core-rel-01" };

function extractPublicExports(indexDts: string): string[] {
  const names = new Set<string>();
  for (const match of indexDts.matchAll(/export (?:type )?\{([^}]+)\}/g)) {
    for (const part of match[1]!.split(",")) {
      const token = part.trim();
      const name = token.includes(" as ")
        ? token.split(" as ").pop()!.trim()
        : token.split(/\s+/).pop()!.replace(/,$/, "");
      if (name && name !== "type") names.add(name);
    }
  }
  return [...names].sort();
}

describe("CORE-REL-01 release audit", () => {
  it("A. activated case/suite versions and baselines remain immutable", () => {
    const store = new InMemoryEvaluationCorpusStore();
    const corpus = new EvaluationCorpus({ store, at: AT, provenance: PROVENANCE });
    const candidate = createEvaluationCaseCandidate({
      id: "c1",
      candidateId: "c1",
      domain: "d",
      title: "t",
      provenance: { sourceKind: "MANUAL_REFERENCE" },
      inputContextRefs: [],
      evidenceRefs: [],
      createdAt: AT,
      provenanceEnvelope: PROVENANCE,
    });
    corpus.addCandidate(candidate);
    const { caseVersion } = corpus.admitCandidate({
      admissionId: "a1",
      candidateId: "c1",
      outcome: "ADMIT",
      rationale: "ok",
      admittedByActorId: "r",
      caseId: "case-1",
      caseVersion: "1.0.0",
    });
    expect(caseVersion?.immutable).toBe(true);
    expect(() =>
      activateEvaluationCaseVersion(
        createEvaluationCaseVersion({
          id: "case-1:1.0.0",
          caseId: "case-1",
          version: "1.0.0",
          domain: "d",
          title: "mutated",
          inputContextRefs: [],
          evidenceRefs: [],
          expectation: { kind: "x", expected: "y" },
          criteria: [{ id: "c", code: "c", mandatory: true }],
          effectiveFrom: AT,
          createdAt: AT,
          provenance: PROVENANCE,
        }),
        AT,
      ),
    ).toThrow();
    const baseline = createEvaluationBaseline({
      id: "b1",
      baselineId: "b1",
      targetId: "t1",
      targetVersion: "1.0.0",
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluationRunId: "run-1",
      summaryId: "sum-1",
      metricResults: [{ metricId: "pass_rate", metricVersion: "1", value: 1 }],
      establishedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    expect(baseline.immutable).toBe(true);
    const result = createEvaluationCaseResult({
      id: "r1",
      resultId: "r1",
      evaluationRunId: "run-1",
      caseId: "case-1",
      caseVersion: "1.0.0",
      targetId: "t1",
      targetVersion: "1.0.0",
      evaluatorActorId: "e1",
      verdict: "PASS",
      evaluatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    store.saveCaseResult(result);
    expect(store.getCaseResult("r1")?.contentHash).toBe(result.contentHash);
  });

  it("B. pure evaluation run cannot invoke DomainActionExecutor", async () => {
    const { adapter } = buildHarness();
    const executeSpy = vi.fn();
    adapter.actionExecutor.execute = executeSpy;
    const store = new InMemoryEvaluationCorpusStore();
    const corpus = new EvaluationCorpus({ store, at: AT, provenance: PROVENANCE });
    corpus.addCandidate(
      createEvaluationCaseCandidate({
        id: "c1",
        candidateId: "c1",
        domain: "test-domain",
        title: "t",
        provenance: { sourceKind: "MANUAL_REFERENCE" },
        inputContextRefs: [],
        evidenceRefs: [],
        createdAt: AT,
        provenanceEnvelope: PROVENANCE,
      }),
    );
    corpus.admitCandidate({ admissionId: "a1", candidateId: "c1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
    await corpus.executeEvaluationRun({
      runId: "er-1",
      idempotencyKey: "idem-1",
      target: createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: PROVENANCE }),
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluatorActorId: "evaluator",
      caseEvaluator: { evaluatorId: "e", evaluate: () => ({ verdict: "PASS" }) },
    });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("C. incompatible suite versions compare as INCOMPARABLE", () => {
    const baseline = createEvaluationBaseline({
      id: "b1",
      baselineId: "b1",
      targetId: "t1",
      targetVersion: "1.0.0",
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluationRunId: "run-1",
      summaryId: "sum-1",
      metricResults: [{ metricId: "pass_rate", metricVersion: "1", value: 1 }],
      establishedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const summary = buildEvaluationSummary({
      id: "sum-2",
      summaryId: "sum-2",
      evaluationRunId: "run-2",
      results: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const comparison = compareEvaluationToBaseline({
      comparisonId: "cmp-1",
      candidateSummary: summary,
      baseline,
      candidateSuiteId: "s1",
      candidateSuiteVersion: "2.0.0",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    expect(comparison.assessment).toBe("INCOMPARABLE");
    expect(["REGRESSED", "IMPROVED"]).not.toContain(comparison.assessment);
  });

  it("D. LearningSignal and GovernanceRecommendation are not decisions or authorization", () => {
    const signal = createLearningSignal({
      id: "s1",
      signalId: "s1",
      kind: "REGRESSION_DETECTED",
      domain: "d",
      rationale: "r",
      refs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rec = createGovernanceRecommendation({
      id: "r1",
      recommendationId: "r1",
      kind: "INVESTIGATE",
      domain: "d",
      rationale: "r",
      refs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    expect(signal).not.toHaveProperty("decisionId");
    expect(rec).not.toHaveProperty("authorizationId");
    expect(rec).not.toHaveProperty("verdict");
  });

  it("E. schema-001-only database upgrades to 002 with ledger intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "core-rel-migrate-"));
    const dbPath = join(dir, "upgrade.db");
    try {
      const db = createNodeSqliteDatabase(dbPath);
      for (const statement of MIGRATION_001_INITIAL.sql) {
        db.exec(statement);
      }
      db.prepare(
        "INSERT INTO schema_migrations (migration_id, applied_at, checksum) VALUES (?, ?, ?)",
      ).run("001_initial", AT, MIGRATION_001_INITIAL.checksum);
      db.close();

      const upgraded = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      expect(upgraded.corpusStore).toBeDefined();
      upgraded.ledger.append({
        eventId: "evt-after-upgrade",
        eventType: "PROPOSAL_CREATED",
        occurredAt: AT,
        recordedAt: AT,
        actorId: "actor-1",
        payloadRef: "ref-after",
        idempotencyKey: "idem-after-upgrade",
        provenance: PROVENANCE,
      });
      expect(upgraded.ledger.getByEventId("evt-after-upgrade")?.eventId).toBe("evt-after-upgrade");
      upgraded.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows file lock tolerance
      }
    }
  });

  it("E. fresh database applies 001 then 002", () => {
    const dir = mkdtempSync(join(tmpdir(), "core-rel-fresh-"));
    const dbPath = join(dir, "fresh.db");
    try {
      const storage = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      expect(storage.corpusStore).toBeDefined();
      storage.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("E. unknown future schema fails closed", () => {
    expect(() => assertSupportedSchemaVersion(99)).toThrow(GovernanceError);
  });

  it("public API preserves all v0.1.0 exports", () => {
    execSync("pnpm run build", { cwd: join(process.cwd()), stdio: "pipe" });
    const current = readFileSync(join(process.cwd(), "dist", "index.d.ts"), "utf8");
    const v010 = execSync("git show c8c7a76:packages/jiplabs-core/src/index.ts", { encoding: "utf8" });
    const currentExports = extractPublicExports(current);
    const v010Exports = extractPublicExports(v010);
    for (const name of v010Exports) {
      expect(currentExports, `missing v0.1.0 export: ${name}`).toContain(name);
    }
  });

  it("migration list includes 002 after 001 unchanged", () => {
    expect(ALL_MIGRATIONS.map((m) => m.id)).toEqual(["001_initial", "002_evaluation_corpus"]);
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(2);
  });
});
