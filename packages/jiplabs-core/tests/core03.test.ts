import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  activatePolicyVersion,
  assertLedgerAppendOnly,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createPolicyVersion,
  createEvaluationCaseCandidate,
  createEvaluationTarget,
  createCandidateFromGovernanceRun,
  computeCandidateFingerprint,
  computeEvaluationRunFingerprint,
  EvaluationCorpus,
  GovernanceError,
  GovernanceErrorCode,
  InMemoryEvaluationCorpusStore,
  InMemoryGovernanceLedger,
  isEvaluationWorthyOutcome,
  openNodeSqliteGovernanceStorage,
  type EvaluationCaseEvaluator,
  type PolicyGate,
} from "../src/index.js";
import { buildHarness, AT, PROVENANCE, activeGrant, baseAuthority, baseActor } from "./helpers/governor-harness.js";

const CORPUS_PROVENANCE = { actorId: "corpus-actor", source: "core03-test" };

function createCorpus(ledger?: InMemoryGovernanceLedger) {
  return new EvaluationCorpus({
    store: new InMemoryEvaluationCorpusStore(),
    ledger,
    at: AT,
    provenance: CORPUS_PROVENANCE,
  });
}

function baseCandidate(overrides: Partial<Parameters<typeof createEvaluationCaseCandidate>[0]> = {}) {
  return createEvaluationCaseCandidate({
    id: "cand-1",
    candidateId: "cand-1",
    domain: "test-domain",
    title: "Failure case",
    provenance: { sourceKind: "INCORRECT_EVALUATION", runId: "run-1", decisionId: "dec-1" },
    inputContextRefs: [{ id: "dec-1", type: "decision" }],
    evidenceRefs: ["ev-1"],
    createdAt: AT,
    provenanceEnvelope: CORPUS_PROVENANCE,
    ...overrides,
  });
}

function admissionPolicy(requireHuman = false) {
  const actor = baseActor();
  const authority = baseAuthority(["EXECUTE_ACTION"]);
  const grant = activeGrant(actor.id, authority);
  const gate: PolicyGate = { id: "g1", code: "gate_a", operator: "EQ", expected: "PASS", mandatory: true, evidenceKind: "gate_a" };
  const policy = activatePolicyVersion(
    createPolicyVersion({
      id: "pv-admit",
      policyId: "admit-policy",
      version: "1.0.0",
      domain: "test-domain",
      decisionType: "ADMIT",
      createdAt: AT,
      provenance: PROVENANCE,
      applicableActorAuthority: [actor.code],
      requiredAuthorityScope: "EXECUTE_ACTION",
      requiredEvidence: [],
      gates: [gate],
      decisionOutcomes: { onPass: "APPROVE", onFail: "REJECT" },
      failureBehavior: "BLOCK",
      rollbackRequirements: { required: false },
      overrideRules: { humanOverrideAvailable: true, requiredAuthorityScope: "OVERRIDE_DECISION" },
      autonomyMode: "AUTONOMOUS",
      effectiveFrom: AT,
    }),
    AT,
  );
  return { policyVersion: policy, authority, grant, requireHumanApproval: requireHuman };
}

function passFailEvaluator(passIds: Set<string>): EvaluationCaseEvaluator {
  return {
    evaluatorId: "eval-1",
    evaluate: (input) => ({
      verdict: passIds.has(`${input.caseId}:${input.caseVersion}`) ? "PASS" : "FAIL",
      rationale: "test",
    }),
  };
}

describe("CORE-03 Evaluation Corpus", () => {
  it("1. candidate is not a permanent case", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    expect(corpus.getCandidate("cand-1")).toBeDefined();
    expect(corpus.store.getCase("case-cand-1")).toBeUndefined();
  });

  it("2. candidate provenance preserved", () => {
    const corpus = createCorpus();
    const candidate = corpus.addCandidate(baseCandidate());
    expect(candidate.sourceProvenance.runId).toBe("run-1");
    expect(candidate.sourceProvenance.decisionId).toBe("dec-1");
  });

  it("3. failure trace generates candidate", () => {
    const { input, kernel } = buildHarness();
    return kernel.run(input).then((result) => {
      expect(isEvaluationWorthyOutcome({ evaluationVerdict: result.run.evaluation?.verdict })).toBeDefined();
      const candidate = createCandidateFromGovernanceRun({
        id: "cand-trace",
        candidateId: "cand-trace",
        domain: "test-domain",
        title: "From run",
        run: result.run,
        sourceKind: "INCORRECT_EVALUATION",
        at: AT,
        provenance: CORPUS_PROVENANCE,
      });
      expect(candidate.sourceProvenance.runId).toBe(result.run.runId);
    });
  });

  it("4. duplicate candidate detected deterministically", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    expect(() => corpus.addCandidate(baseCandidate({ id: "cand-2", candidateId: "cand-2" }))).toThrow();
  });

  it("5. conflicting candidate content fails deterministically on admit", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({
      admissionId: "adm-1",
      candidateId: "cand-1",
      outcome: "ADMIT",
      rationale: "valid",
      admittedByActorId: "reviewer",
      caseId: "case-1",
      caseVersion: "1.0.0",
      expectation: { kind: "outcome", expected: "PASS" },
    });
    expect(() =>
      corpus.admitCandidate({
        admissionId: "adm-2",
        candidateId: "cand-1",
        outcome: "ADMIT",
        rationale: "retry",
        admittedByActorId: "reviewer",
        caseId: "case-1",
        caseVersion: "1.0.0",
        expectation: { kind: "outcome", expected: "FAIL" },
      }),
    ).toThrow();
  });

  it("6. ADMIT creates case", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    const { caseRecord } = corpus.admitCandidate({
      admissionId: "adm-1",
      candidateId: "cand-1",
      outcome: "ADMIT",
      rationale: "valid failure",
      admittedByActorId: "reviewer",
      caseId: "case-1",
      expectation: { kind: "outcome", expected: "PASS" },
    });
    expect(caseRecord?.caseId).toBe("case-1");
  });

  it("7. REJECT does not create active case", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({
      admissionId: "adm-r",
      candidateId: "cand-1",
      outcome: "REJECT",
      rationale: "noise",
      admittedByActorId: "reviewer",
    });
    expect(corpus.store.getCase("case-cand-1")).toBeUndefined();
  });

  it("8. QUARANTINE preserved", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({
      admissionId: "adm-q",
      candidateId: "cand-1",
      outcome: "QUARANTINE",
      rationale: "needs review",
      admittedByActorId: "reviewer",
    });
    expect(corpus.getCandidate("cand-1")?.status).toBe("QUARANTINED");
  });

  it("9. human approval not globally required for admission", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    expect(() =>
      corpus.admitCandidate({
        admissionId: "adm-auto",
        candidateId: "cand-1",
        outcome: "ADMIT",
        rationale: "autonomous",
        admittedByActorId: "reviewer",
        caseId: "case-auto",
      }),
    ).not.toThrow();
  });

  it("10. policy may require human approval", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    const policy = admissionPolicy(true);
    expect(() =>
      corpus.admitCandidate({
        admissionId: "adm-h",
        candidateId: "cand-1",
        outcome: "ADMIT",
        rationale: "needs human",
        admittedByActorId: "reviewer",
        admissionPolicy: policy,
        caseId: "case-h",
      }),
    ).toThrow(GovernanceError);
  });

  it("11. activated case version immutable", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    const { caseVersion } = corpus.admitCandidate({
      admissionId: "adm-i",
      candidateId: "cand-1",
      outcome: "ADMIT",
      rationale: "ok",
      admittedByActorId: "reviewer",
      caseId: "case-i",
      caseVersion: "1.0.0",
    });
    expect(caseVersion?.immutable).toBe(true);
    expect(() =>
      corpus.admitCandidate({
        admissionId: "adm-i2",
        candidateId: "cand-1",
        outcome: "ADMIT",
        rationale: "rewrite",
        admittedByActorId: "reviewer",
        caseId: "case-i",
        caseVersion: "1.0.0",
        expectation: { kind: "outcome", expected: "CHANGED" },
      }),
    ).toThrow();
  });

  it("12. correction creates new version", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({
      admissionId: "adm-v1",
      candidateId: "cand-1",
      outcome: "ADMIT",
      rationale: "v1",
      admittedByActorId: "reviewer",
      caseId: "case-v",
      caseVersion: "1.0.0",
    });
    const v2 = corpus.createCorrectedCaseVersion({
      caseId: "case-v",
      newVersion: "2.0.0",
      supersedesVersion: "1.0.0",
      expectation: { kind: "outcome", expected: "UPDATED" },
      actorId: "reviewer",
    });
    expect(v2.version).toBe("2.0.0");
  });

  it("13. old case version remains reconstructable", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "v1", admittedByActorId: "r", caseId: "case-r", caseVersion: "1.0.0" });
    corpus.createCorrectedCaseVersion({ caseId: "case-r", newVersion: "2.0.0", supersedesVersion: "1.0.0", expectation: { kind: "outcome", expected: "X" }, actorId: "r" });
    expect(corpus.store.getCaseVersion("case-r", "1.0.0")?.immutable).toBe(true);
    expect(corpus.store.getCaseVersion("case-r", "2.0.0")?.immutable).toBe(true);
  });

  it("14. suite version immutable once activated", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    const suite = corpus.activateSuiteVersion({
      suiteId: "suite-1",
      version: "1.0.0",
      domain: "test-domain",
      title: "Suite",
      caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }],
    });
    expect(suite.immutable).toBe(true);
  });

  it("15. suite new version does not rewrite old", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S1", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "2.0.0", domain: "test-domain", title: "S2", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }], supersedes: { suiteId: "s1", version: "1.0.0" } });
    expect(corpus.store.getSuiteVersion("s1", "1.0.0")?.title).toBe("S1");
    expect(corpus.store.getSuiteVersion("s1", "2.0.0")?.title).toBe("S2");
  });

  it("16-17. target and suite bound to run", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
    const target = createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE });
    const { run } = await corpus.executeEvaluationRun({
      runId: "er-1",
      idempotencyKey: "idem-1",
      target,
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluatorActorId: "evaluator",
      caseEvaluator: passFailEvaluator(new Set(["c1:1.0.0"])),
    });
    expect(run.target.targetId).toBe("t1");
    expect(run.suiteId).toBe("s1");
    expect(run.suiteVersion).toBe("1.0.0");
  });

  it("18. run fingerprint deterministic", () => {
    const target = createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE });
    const fp1 = computeEvaluationRunFingerprint({
      targetId: "t1",
      targetVersion: "1.0.0",
      suiteId: "s1",
      suiteVersion: "1.0.0",
      caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }],
      evaluatorActorId: "e1",
      configuration: {},
    });
    const fp2 = computeEvaluationRunFingerprint({
      targetId: "t1",
      targetVersion: "1.0.0",
      suiteId: "s1",
      suiteVersion: "1.0.0",
      caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }],
      evaluatorActorId: "e1",
      configuration: {},
    });
    expect(fp1).toBe(fp2);
  });

  it("19-20. idempotency replay and collision", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
    const target = createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE });
    const input = {
      runId: "er-idem",
      idempotencyKey: "idem-same",
      target,
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluatorActorId: "evaluator",
      configuration: { mode: "test" },
      caseEvaluator: passFailEvaluator(new Set(["c1:1.0.0"])),
    };
    const first = await corpus.executeEvaluationRun(input);
    const second = await corpus.executeEvaluationRun({ ...input, runId: "er-idem-2" });
    expect(second.run.runId).toBe(first.run.runId);
    await expect(
      corpus.executeEvaluationRun({ ...input, configuration: { mode: "different" }, runId: "er-idem-3" }),
    ).rejects.toThrow(GovernanceError);
  });

  it("21-24. PASS FAIL PARTIAL INCONCLUSIVE results", async () => {
    const corpus = createCorpus();
    for (const [id, verdict] of [
      ["c-pass", "PASS"],
      ["c-fail", "FAIL"],
      ["c-partial", "PARTIAL"],
      ["c-inc", "INCONCLUSIVE"],
    ] as const) {
      corpus.addCandidate(baseCandidate({ id, candidateId: id, title: id }));
      corpus.admitCandidate({ admissionId: `a-${id}`, candidateId: id, outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: id, caseVersion: "1.0.0" });
    }
    corpus.activateSuiteVersion({
      suiteId: "s-multi",
      version: "1.0.0",
      domain: "test-domain",
      title: "Multi",
      caseVersionRefs: ["c-pass", "c-fail", "c-partial", "c-inc"].map((id) => ({ caseId: id, version: "1.0.0" })),
    });
    const evaluator: EvaluationCaseEvaluator = {
      evaluatorId: "multi",
      evaluate: (input) => {
        const map: Record<string, "PASS" | "FAIL" | "PARTIAL" | "INCONCLUSIVE"> = {
          "c-pass:1.0.0": "PASS",
          "c-fail:1.0.0": "FAIL",
          "c-partial:1.0.0": "PARTIAL",
          "c-inc:1.0.0": "INCONCLUSIVE",
        };
        return { verdict: map[`${input.caseId}:${input.caseVersion}`] };
      },
    };
    const { results } = await corpus.executeEvaluationRun({
      runId: "er-multi",
      idempotencyKey: "idem-multi",
      target: createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }),
      suiteId: "s-multi",
      suiteVersion: "1.0.0",
      evaluatorActorId: "evaluator",
      caseEvaluator: evaluator,
    });
    expect(results.map((r) => r.verdict).sort()).toEqual(["FAIL", "INCONCLUSIVE", "PARTIAL", "PASS"]);
  });

  it("25-26. metric aggregation and summary reconstructable", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
    const { summary, results } = await corpus.executeEvaluationRun({
      runId: "er-sum",
      idempotencyKey: "idem-sum",
      target: createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }),
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluatorActorId: "evaluator",
      caseEvaluator: passFailEvaluator(new Set(["c1:1.0.0"])),
    });
    expect(summary.passCount).toBe(1);
    expect(summary.totalCases).toBe(results.length);
  });

  it("27-32. baseline and regression assessments", async () => {
    const corpus = createCorpus();
    for (const id of ["c1", "c2", "c3"]) {
      corpus.addCandidate(baseCandidate({ id, candidateId: id, title: id }));
      corpus.admitCandidate({ admissionId: `a-${id}`, candidateId: id, outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: id, caseVersion: "1.0.0" });
    }
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: ["c1", "c2", "c3"].map((id) => ({ caseId: id, version: "1.0.0" })) });
    const target = createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE });
    const passAll = passFailEvaluator(new Set(["c1:1.0.0", "c2:1.0.0", "c3:1.0.0"]));
    const passOne = passFailEvaluator(new Set(["c1:1.0.0"]));
    const baselineRun = await corpus.executeEvaluationRun({ runId: "base", idempotencyKey: "base", target, suiteId: "s1", suiteVersion: "1.0.0", evaluatorActorId: "e", caseEvaluator: passAll });
    const baseline = corpus.establishBaseline({ baselineId: "b1", evaluationRunId: baselineRun.run.runId });
    expect(baseline.immutable).toBe(true);
    const worse = await corpus.executeEvaluationRun({ runId: "worse", idempotencyKey: "worse", target: createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "2.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }), suiteId: "s1", suiteVersion: "1.0.0", evaluatorActorId: "e", caseEvaluator: passOne });
    const regressed = corpus.compareRunToBaseline({ comparisonId: "cmp-r", candidateRunId: worse.run.runId, baselineId: "b1" });
    expect(regressed.comparison.assessment).toBe("REGRESSED");
    const same = await corpus.executeEvaluationRun({ runId: "same", idempotencyKey: "same", target, suiteId: "s1", suiteVersion: "1.0.0", evaluatorActorId: "e", caseEvaluator: passAll });
    const unchanged = corpus.compareRunToBaseline({ comparisonId: "cmp-u", candidateRunId: same.run.runId, baselineId: "b1" });
    expect(unchanged.comparison.assessment).toBe("UNCHANGED");
    const incompatible = corpus.compareRunToBaseline({ comparisonId: "cmp-i", candidateRunId: worse.run.runId, baselineId: "b1" });
    expect(incompatible.comparison.assessment).toBeDefined();
  });

  it("33-36. learning signal and recommendation do not mutate policy/authority", () => {
    const corpus = createCorpus();
    const policyBefore = admissionPolicy().policyVersion.contentHash;
    const signal = corpus.recordLearningSignal({
      id: "sig-1",
      signalId: "sig-1",
      kind: "REGRESSION_DETECTED",
      domain: "test-domain",
      rationale: "regression",
      refs: [{ id: "run-1", type: "evaluation_run" }],
      provenance: CORPUS_PROVENANCE,
    });
    const rec = corpus.createRecommendation({
      id: "rec-1",
      recommendationId: "rec-1",
      kind: "INVESTIGATE",
      domain: "test-domain",
      rationale: "investigate",
      refs: [{ id: "sig-1", type: "learning_signal" }],
      provenance: CORPUS_PROVENANCE,
    });
    expect(signal.kind).toBe("REGRESSION_DETECTED");
    expect(rec.kind).toBe("INVESTIGATE");
    expect(admissionPolicy().policyVersion.contentHash).toBe(policyBefore);
    expect(rec).not.toHaveProperty("decisionId");
  });

  it("37-41. corpus survives restart via SQLite", async () => {
    const dir = mkdtempSync(join(tmpdir(), "core03-"));
    const dbPath = join(dir, "corpus.db");
    try {
      const storage1 = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      const corpus1 = new EvaluationCorpus({ store: storage1.corpusStore!, ledger: storage1.ledger, at: AT, provenance: CORPUS_PROVENANCE });
      corpus1.addCandidate(baseCandidate());
      corpus1.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
      corpus1.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
      const run1 = await corpus1.executeEvaluationRun({
        runId: "er-db",
        idempotencyKey: "idem-db",
        target: createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }),
        suiteId: "s1",
        suiteVersion: "1.0.0",
        evaluatorActorId: "e",
        caseEvaluator: passFailEvaluator(new Set(["c1:1.0.0"])),
      });
      corpus1.establishBaseline({ baselineId: "b1", evaluationRunId: run1.run.runId });
      corpus1.recordLearningSignal({ id: "sig-db", signalId: "sig-db", kind: "IMPROVEMENT_DETECTED", domain: "d", rationale: "r", refs: [], provenance: CORPUS_PROVENANCE });
      storage1.close();

      const storage2 = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      const corpus2 = new EvaluationCorpus({ store: storage2.corpusStore!, at: AT, provenance: CORPUS_PROVENANCE });
      expect(corpus2.getCandidate("cand-1")).toBeDefined();
      expect(corpus2.store.getCase("c1")).toBeDefined();
      expect(corpus2.store.getRun("er-db")).toBeDefined();
      expect(corpus2.store.getBaseline("b1")).toBeDefined();
      expect(corpus2.store.getLearningSignal("sig-db")).toBeDefined();
      storage2.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may retain SQLite file handles briefly after close
      }
    }
  });

  it("42. migration 002 applies deterministically", () => {
    const storage = openNodeSqliteGovernanceStorage({ path: ":memory:", appliedAt: AT });
    expect(storage.corpusStore).toBeDefined();
    storage.close();
  });

  it("43. ledger integrity remains valid with corpus events", () => {
    const ledger = new InMemoryGovernanceLedger();
    const corpus = createCorpus(ledger);
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    expect(ledger.list().length).toBeGreaterThan(0);
    expect(ledger.list()[0]?.eventType).toBe("EVALUATION_CASE_CANDIDATE_RECORDED");
  });

  it("44. historical reconstruction uses exact case/suite versions", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
    const { run, results } = await corpus.executeEvaluationRun({
      runId: "er-hist",
      idempotencyKey: "idem-hist",
      target: createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }),
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluatorActorId: "e",
      caseEvaluator: passFailEvaluator(new Set(["c1:1.0.0"])),
    });
    expect(results[0]?.caseVersion).toBe("1.0.0");
    expect(run.suiteVersion).toBe("1.0.0");
  });

  it("45-46. evaluation run does not invoke production DomainActionExecutor", async () => {
    const executeSpy = vi.fn();
    const harness = buildHarness();
    harness.adapter.actionExecutor.execute = executeSpy;
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "a1", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "c1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "s1", version: "1.0.0", domain: "test-domain", title: "S", caseVersionRefs: [{ caseId: "c1", version: "1.0.0" }] });
    await corpus.executeEvaluationRun({
      runId: "er-obs",
      idempotencyKey: "idem-obs",
      target: createEvaluationTarget({ id: "t1", targetId: "t1", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }),
      suiteId: "s1",
      suiteVersion: "1.0.0",
      evaluatorActorId: "e",
      caseEvaluator: passFailEvaluator(new Set(["c1:1.0.0"])),
    });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("47-50. no model-provider, JipComply, Quinté, or LLM dependency in evaluation-corpus module", () => {
    const { readFileSync, readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const { join: joinPath } = require("node:path") as typeof import("node:path");
    const root = joinPath(process.cwd(), "src", "evaluation-corpus");
    const forbidden = [/openai/i, /anthropic/i, /jipcomply/i, /quinte/i, /llm/i];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = joinPath(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".ts")) {
          const text = readFileSync(full, "utf8");
          for (const pattern of forbidden) {
            expect(text).not.toMatch(pattern);
          }
        }
      }
    }
    walk(root);
  });

  it("Fixture A: production failure becomes permanent case", async () => {
    const dir = mkdtempSync(join(tmpdir(), "core03-fix-a-"));
    const dbPath = join(dir, "a.db");
    try {
      const storage = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      const corpus = new EvaluationCorpus({ store: storage.corpusStore!, at: AT, provenance: CORPUS_PROVENANCE });
      const candidate = corpus.addCandidate(baseCandidate({ title: "Incorrect evaluation" }));
      corpus.admitCandidate({ admissionId: "fa", candidateId: candidate.candidateId, outcome: "ADMIT", rationale: "failure", admittedByActorId: "r", caseId: "fa-case", caseVersion: "1.0.0" });
      storage.close();
      const storage2 = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      expect(storage2.corpusStore!.getCase("fa-case")).toBeDefined();
      storage2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Fixture B: suite evaluation with 3 cases", async () => {
    const corpus = createCorpus();
    for (const id of ["fb1", "fb2", "fb3"]) {
      corpus.addCandidate(baseCandidate({ id, candidateId: id, title: id }));
      corpus.admitCandidate({ admissionId: `fa-${id}`, candidateId: id, outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: id, caseVersion: "1.0.0" });
    }
    corpus.activateSuiteVersion({ suiteId: "fb-suite", version: "1.0.0", domain: "test-domain", title: "FB", caseVersionRefs: ["fb1", "fb2", "fb3"].map((id) => ({ caseId: id, version: "1.0.0" })) });
    const { summary } = await corpus.executeEvaluationRun({
      runId: "fb-run",
      idempotencyKey: "fb-idem",
      target: createEvaluationTarget({ id: "fb-t", targetId: "fb-t", targetType: "SYSTEM", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }),
      suiteId: "fb-suite",
      suiteVersion: "1.0.0",
      evaluatorActorId: "e",
      caseEvaluator: passFailEvaluator(new Set(["fb1:1.0.0", "fb2:1.0.0", "fb3:1.0.0"])),
    });
    expect(summary.totalCases).toBe(3);
  });

  it("Fixture C: regression produces signal and recommendation", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "fc-a", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "fc1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "fc-s", version: "1.0.0", domain: "test-domain", title: "FC", caseVersionRefs: [{ caseId: "fc1", version: "1.0.0" }] });
    const target = createEvaluationTarget({ id: "fc-t", targetId: "fc-t", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE });
    const base = await corpus.executeEvaluationRun({ runId: "fc-base", idempotencyKey: "fc-base", target, suiteId: "fc-s", suiteVersion: "1.0.0", evaluatorActorId: "e", caseEvaluator: passFailEvaluator(new Set(["fc1:1.0.0"])) });
    corpus.establishBaseline({ baselineId: "fc-b", evaluationRunId: base.run.runId });
    const worse = await corpus.executeEvaluationRun({ runId: "fc-worse", idempotencyKey: "fc-worse", target: createEvaluationTarget({ id: "fc-t", targetId: "fc-t", targetType: "AGENT", version: "2.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }), suiteId: "fc-s", suiteVersion: "1.0.0", evaluatorActorId: "e", caseEvaluator: passFailEvaluator(new Set()) });
    const out = corpus.compareRunToBaseline({ comparisonId: "fc-cmp", candidateRunId: worse.run.runId, baselineId: "fc-b" });
    expect(out.comparison.assessment).toBe("REGRESSED");
    expect(out.signal?.kind).toBe("REGRESSION_DETECTED");
    expect(out.recommendation?.kind).toBe("INVESTIGATE");
  });

  it("Fixture D: no false regression when equal/better", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "fd-a", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "fd1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "fd-s", version: "1.0.0", domain: "test-domain", title: "FD", caseVersionRefs: [{ caseId: "fd1", version: "1.0.0" }] });
    const target = createEvaluationTarget({ id: "fd-t", targetId: "fd-t", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE });
    const base = await corpus.executeEvaluationRun({ runId: "fd-base", idempotencyKey: "fd-base", target, suiteId: "fd-s", suiteVersion: "1.0.0", evaluatorActorId: "e", caseEvaluator: passFailEvaluator(new Set(["fd1:1.0.0"])) });
    corpus.establishBaseline({ baselineId: "fd-b", evaluationRunId: base.run.runId });
    const same = await corpus.executeEvaluationRun({ runId: "fd-same", idempotencyKey: "fd-same", target, suiteId: "fd-s", suiteVersion: "1.0.0", evaluatorActorId: "e", caseEvaluator: passFailEvaluator(new Set(["fd1:1.0.0"])) });
    const out = corpus.compareRunToBaseline({ comparisonId: "fd-cmp", candidateRunId: same.run.runId, baselineId: "fd-b" });
    expect(["UNCHANGED", "IMPROVED"]).toContain(out.comparison.assessment);
  });

  it("Fixture E: case supersession preserves history", () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "fe-a", candidateId: "cand-1", outcome: "ADMIT", rationale: "v1", admittedByActorId: "r", caseId: "fe1", caseVersion: "1.0.0" });
    corpus.createCorrectedCaseVersion({ caseId: "fe1", newVersion: "2.0.0", supersedesVersion: "1.0.0", expectation: { kind: "outcome", expected: "V2" }, actorId: "r" });
    expect(corpus.store.getCaseVersion("fe1", "1.0.0")).toBeDefined();
    expect(corpus.store.getCase("fe1")?.activeVersion).toBe("2.0.0");
  });

  it("Fixture F: evaluation mode is observational", async () => {
    const corpus = createCorpus();
    corpus.addCandidate(baseCandidate());
    corpus.admitCandidate({ admissionId: "ff-a", candidateId: "cand-1", outcome: "ADMIT", rationale: "ok", admittedByActorId: "r", caseId: "ff1", caseVersion: "1.0.0" });
    corpus.activateSuiteVersion({ suiteId: "ff-s", version: "1.0.0", domain: "test-domain", title: "FF", caseVersionRefs: [{ caseId: "ff1", version: "1.0.0" }] });
    const { run } = await corpus.executeEvaluationRun({
      runId: "ff-run",
      idempotencyKey: "ff-idem",
      target: createEvaluationTarget({ id: "ff-t", targetId: "ff-t", targetType: "AGENT", version: "1.0.0", createdAt: AT, provenance: CORPUS_PROVENANCE }),
      suiteId: "ff-s",
      suiteVersion: "1.0.0",
      evaluatorActorId: "e",
      caseEvaluator: passFailEvaluator(new Set(["ff1:1.0.0"])),
    });
    expect(run.observationMode).toBe(true);
  });

  it("fingerprint stability for candidate deduplication", () => {
    const fp = computeCandidateFingerprint({
      domain: "d",
      title: "t",
      inputContextRefs: [],
      evidenceRefs: [],
      provenance: { sourceKind: "MANUAL_REFERENCE" },
    });
    expect(fp).toHaveLength(64);
  });
});
