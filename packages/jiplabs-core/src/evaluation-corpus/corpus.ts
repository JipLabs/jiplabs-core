import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { evaluateAuthorityGrant } from "../authority/index.js";
import { freezeDeep } from "../envelope.js";
import type { EvaluationCaseCandidate } from "./types.js";
import {
  activateEvaluationCaseVersion,
  activateEvaluationSuiteVersion,
  assertCaseVersionImmutable,
  assertSuiteVersionImmutable,
  createEvaluationCase,
  createEvaluationCaseAdmission,
  createEvaluationCaseVersion,
  createEvaluationSuite,
  createEvaluationSuiteVersion,
} from "./cases.js";
import type {
  AdmitCandidateInput,
  EvaluationCorpusDeps,
  ExecuteEvaluationRunInput,
  RegressionConfig,
} from "./contracts.js";
import { emitEvaluationCorpusEvent } from "./ledger-events.js";
import { createCandidateFromGovernanceRun, type CandidateFromGovernanceInput } from "./pipeline.js";
import {
  assertBaselineCompatible,
  compareEvaluationToBaseline,
  createEvaluationBaseline,
  createGovernanceRecommendation,
  createLearningSignal,
  learningSignalForAssessment,
  recommendationForAssessment,
} from "./regression.js";
import {
  assertEvaluationRunIdempotency,
  buildEvaluationSummary,
  completeEvaluationRun,
  createEvaluationCaseResult,
  createEvaluationRun,
} from "./runs.js";

export class EvaluationCorpus {
  readonly #deps: EvaluationCorpusDeps;

  constructor(deps: EvaluationCorpusDeps) {
    this.#deps = deps;
  }

  get store() {
    return this.#deps.store;
  }

  addCandidate(candidate: EvaluationCaseCandidate): EvaluationCaseCandidate {
    const existing = this.#deps.store.getCandidateByFingerprint(candidate.fingerprint);
    if (existing && existing.candidateId !== candidate.candidateId) {
      throw new GovernanceError(
        GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
        `duplicate candidate fingerprint already recorded as ${existing.candidateId}`,
      );
    }
    this.#deps.store.saveCandidate(candidate);
    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: `${candidate.candidateId}:recorded`,
        eventType: "EVALUATION_CASE_CANDIDATE_RECORDED",
        at: this.#deps.at,
        actorId: this.#deps.provenance.actorId,
        payloadRef: candidate.candidateId,
        idempotencyKey: `eval-candidate:${candidate.candidateId}`,
        provenance: this.#deps.provenance,
        metadata: { fingerprint: candidate.fingerprint },
      });
    }
    return candidate;
  }

  createCandidateFromGovernance(input: CandidateFromGovernanceInput): EvaluationCaseCandidate {
    return this.addCandidate(createCandidateFromGovernanceRun(input));
  }

  getCandidate(candidateId: string): EvaluationCaseCandidate | undefined {
    return this.#deps.store.getCandidate(candidateId);
  }

  admitCandidate(input: AdmitCandidateInput): {
    readonly admission: ReturnType<typeof createEvaluationCaseAdmission>;
    readonly caseRecord?: ReturnType<typeof createEvaluationCase>;
    readonly caseVersion?: ReturnType<typeof createEvaluationCaseVersion>;
  } {
    const candidate = this.#deps.store.getCandidate(input.candidateId);
    if (!candidate) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, `unknown candidate ${input.candidateId}`);
    }

    const humanRequired = input.admissionPolicy?.requireHumanApproval ?? false;
    if (humanRequired && input.outcome === "ADMIT" && !input.humanApproved) {
      throw new GovernanceError(
        GovernanceErrorCode.HUMAN_APPROVAL_REQUIRED,
        "human approval required for case admission",
      );
    }

    if (input.admissionPolicy?.grant) {
      const check = evaluateAuthorityGrant({
        grant: input.admissionPolicy.grant,
        authority: input.admissionPolicy.authority,
        actorId: input.admittedByActorId,
        scope: "EXECUTE_ACTION",
        resource: { domain: candidate.domain, resourceType: "evaluation_case" },
        at: this.#deps.at,
      });
      if (!check.allowed && input.outcome === "ADMIT") {
        throw new GovernanceError(GovernanceErrorCode.AUTHORITY_MISSING, "admission authority denied");
      }
    }

    const admission = createEvaluationCaseAdmission({
      id: input.admissionId,
      admissionId: input.admissionId,
      candidateId: input.candidateId,
      outcome: input.outcome,
      rationale: input.rationale,
      admittedByActorId: input.admittedByActorId,
      policyVersionId: input.admissionPolicy?.policyVersion.id,
      humanApprovalRequired: humanRequired,
      humanApproved: input.humanApproved,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });

    this.#deps.store.saveAdmission(admission);

    const eventType =
      input.outcome === "ADMIT"
        ? "EVALUATION_CASE_ADMITTED"
        : input.outcome === "REJECT"
          ? "EVALUATION_CASE_REJECTED"
          : input.outcome === "QUARANTINE"
            ? "EVALUATION_CASE_QUARANTINED"
            : "EVALUATION_CASE_CANDIDATE_RECORDED";

    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: input.admissionId,
        eventType,
        at: this.#deps.at,
        actorId: input.admittedByActorId,
        payloadRef: input.admissionId,
        idempotencyKey: `eval-admission:${input.admissionId}`,
        provenance: this.#deps.provenance,
      });
    }

    if (input.outcome !== "ADMIT") {
      this.#deps.store.saveCandidate(
        freezeDeep({ ...candidate, status: input.outcome === "REJECT" ? "REJECTED" : input.outcome === "QUARANTINE" ? "QUARANTINED" : "NEEDS_REVIEW" }),
      );
      return { admission };
    }

    const caseId = input.caseId ?? `case-${input.candidateId}`;
    const caseVersionStr = input.caseVersion ?? "1.0.0";
    const expectation: import("./types.js").EvaluationExpectation =
      input.expectation ?? { kind: "outcome", expected: "PASS" };

    const existingVersion = this.#deps.store.getCaseVersion(caseId, caseVersionStr);
    const draftVersion = createEvaluationCaseVersion({
      id: `${caseId}:${caseVersionStr}`,
      caseId,
      version: caseVersionStr,
      domain: candidate.domain,
      title: candidate.title,
      description: candidate.description,
      inputContextRefs: candidate.inputContextRefs,
      evidenceRefs: candidate.evidenceRefs,
      expectation,
      criteria: input.criteria ?? [{ id: "c1", code: "default", mandatory: true }],
      candidateId: candidate.candidateId,
      admissionId: input.admissionId,
      effectiveFrom: this.#deps.at,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });

    if (existingVersion?.immutable) {
      throw new GovernanceError(
        GovernanceErrorCode.POLICY_IMMUTABLE,
        `case version ${caseId}@${caseVersionStr} is immutable`,
      );
    }
    if (existingVersion && existingVersion.fingerprint !== draftVersion.fingerprint) {
      throw new GovernanceError(
        GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
        `conflicting content for case ${caseId} version ${caseVersionStr}`,
      );
    }

    const activated = activateEvaluationCaseVersion(draftVersion, this.#deps.at);
    this.#deps.store.saveCaseVersion(activated);

    const caseRecord = createEvaluationCase({
      id: caseId,
      caseId,
      domain: candidate.domain,
      activeVersion: caseVersionStr,
      fingerprint: activated.fingerprint,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveCase(caseRecord);
    this.#deps.store.saveCandidate(freezeDeep({ ...candidate, status: "ADMITTED" }));

    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: `${caseId}:${caseVersionStr}:activated`,
        eventType: "EVALUATION_CASE_VERSION_ACTIVATED",
        at: this.#deps.at,
        actorId: input.admittedByActorId,
        payloadRef: `${caseId}:${caseVersionStr}`,
        idempotencyKey: `eval-case-version:${caseId}:${caseVersionStr}`,
        provenance: this.#deps.provenance,
      });
    }

    return { admission, caseRecord, caseVersion: activated };
  }

  createCorrectedCaseVersion(input: {
    readonly caseId: string;
    readonly newVersion: string;
    readonly supersedesVersion: string;
    readonly title?: string;
    readonly expectation: { readonly kind: string; readonly expected: import("../schema.js").JsonSafeValue; readonly description?: string };
    readonly actorId: string;
  }): ReturnType<typeof createEvaluationCaseVersion> {
    const prior = this.#deps.store.getCaseVersion(input.caseId, input.supersedesVersion);
    if (!prior) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "superseded case version not found");
    }
    assertCaseVersionImmutable(prior);
    const next = createEvaluationCaseVersion({
      id: `${input.caseId}:${input.newVersion}`,
      caseId: input.caseId,
      version: input.newVersion,
      domain: prior.domain,
      title: input.title ?? prior.title,
      description: prior.description,
      inputContextRefs: prior.inputContextRefs,
      evidenceRefs: prior.evidenceRefs,
      expectation: input.expectation as import("./types.js").EvaluationExpectation,
      criteria: prior.criteria,
      limitations: prior.limitations,
      tags: prior.tags,
      supersedes: { caseId: input.caseId, version: input.supersedesVersion },
      effectiveFrom: this.#deps.at,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    const activated = activateEvaluationCaseVersion(next, this.#deps.at);
    this.#deps.store.saveCaseVersion(activated);
    const caseRecord = this.#deps.store.getCase(input.caseId);
    if (caseRecord) {
      this.#deps.store.saveCase(
        createEvaluationCase({
          ...caseRecord,
          activeVersion: input.newVersion,
          fingerprint: activated.fingerprint,
        }),
      );
    }
    return activated;
  }

  createSuite(input: {
    readonly suiteId: string;
    readonly domain: string;
    readonly title: string;
    readonly description?: string;
  }): ReturnType<typeof createEvaluationSuite> {
    const suite = createEvaluationSuite({
      id: input.suiteId,
      suiteId: input.suiteId,
      domain: input.domain,
      title: input.title,
      description: input.description,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveSuite(suite);
    return suite;
  }

  activateSuiteVersion(input: {
    readonly suiteId: string;
    readonly version: string;
    readonly domain: string;
    readonly title: string;
    readonly caseVersionRefs: readonly { readonly caseId: string; readonly version: string }[];
    readonly supersedes?: { readonly suiteId: string; readonly version: string };
  }): ReturnType<typeof createEvaluationSuiteVersion> {
    for (const ref of input.caseVersionRefs) {
      const cv = this.#deps.store.getCaseVersion(ref.caseId, ref.version);
      if (!cv) {
        throw new GovernanceError(
          GovernanceErrorCode.INVALID_VALUE,
          `missing case version ${ref.caseId}@${ref.version}`,
        );
      }
      assertCaseVersionImmutable(cv);
    }
    const draft = createEvaluationSuiteVersion({
      id: `${input.suiteId}:${input.version}`,
      suiteId: input.suiteId,
      version: input.version,
      domain: input.domain,
      title: input.title,
      caseVersionRefs: input.caseVersionRefs,
      effectiveFrom: this.#deps.at,
      supersedes: input.supersedes,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    const activated = activateEvaluationSuiteVersion(draft, this.#deps.at);
    this.#deps.store.saveSuiteVersion(activated);
    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: `${input.suiteId}:${input.version}:activated`,
        eventType: "EVALUATION_SUITE_VERSION_ACTIVATED",
        at: this.#deps.at,
        actorId: this.#deps.provenance.actorId,
        payloadRef: `${input.suiteId}:${input.version}`,
        idempotencyKey: `eval-suite-version:${input.suiteId}:${input.version}`,
        provenance: this.#deps.provenance,
      });
    }
    return activated;
  }

  async executeEvaluationRun(input: ExecuteEvaluationRunInput): Promise<{
    readonly run: ReturnType<typeof createEvaluationRun>;
    readonly results: readonly ReturnType<typeof createEvaluationCaseResult>[];
    readonly summary: ReturnType<typeof buildEvaluationSummary>;
  }> {
    const suiteVersion = this.#deps.store.getSuiteVersion(input.suiteId, input.suiteVersion);
    if (!suiteVersion) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "suite version not found");
    }
    assertSuiteVersionImmutable(suiteVersion);

    const fingerprint = createEvaluationRun({
      id: input.runId,
      runId: input.runId,
      target: input.target,
      suiteId: input.suiteId,
      suiteVersion: input.suiteVersion,
      caseVersionRefs: suiteVersion.caseVersionRefs,
      evaluatorActorId: input.evaluatorActorId,
      evaluatorVersion: input.evaluatorVersion,
      configuration: input.configuration ?? {},
      idempotencyKey: input.idempotencyKey,
      startedAt: this.#deps.at,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    }).runFingerprint;

    const existing = assertEvaluationRunIdempotency(
      this.#deps.store.getRunByIdempotencyKey(input.idempotencyKey),
      fingerprint,
      input.idempotencyKey,
    );
    if (existing?.status === "COMPLETED" && existing.summaryId) {
      const results = this.#deps.store.listCaseResults(existing.runId);
      const summary = this.#deps.store.getSummary(existing.summaryId);
      if (summary) {
        return { run: existing, results, summary };
      }
    }

    if (input.targetRunner) {
      await input.targetRunner.prepareTarget(input.target);
    }

    let run = createEvaluationRun({
      id: input.runId,
      runId: input.runId,
      status: "RUNNING",
      target: input.target,
      suiteId: input.suiteId,
      suiteVersion: input.suiteVersion,
      caseVersionRefs: suiteVersion.caseVersionRefs,
      evaluatorActorId: input.evaluatorActorId,
      evaluatorVersion: input.evaluatorVersion,
      configuration: input.configuration ?? {},
      idempotencyKey: input.idempotencyKey,
      startedAt: this.#deps.at,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveRun(run);

    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: `${input.runId}:started`,
        eventType: "EVALUATION_RUN_STARTED",
        at: this.#deps.at,
        actorId: input.evaluatorActorId,
        payloadRef: input.runId,
        idempotencyKey: `eval-run-started:${input.runId}`,
        provenance: this.#deps.provenance,
      });
    }

    const results: ReturnType<typeof createEvaluationCaseResult>[] = [];
    for (const ref of suiteVersion.caseVersionRefs) {
      const caseVersion = this.#deps.store.getCaseVersion(ref.caseId, ref.version);
      if (!caseVersion) continue;
      const evalResult = await input.caseEvaluator.evaluate({
        caseId: ref.caseId,
        caseVersion: ref.version,
        inputContextRefs: caseVersion.inputContextRefs.map((ref) => ({
          type: ref.type ?? "ref",
          id: ref.id,
        })),
        expectation: caseVersion.expectation,
        criteria: caseVersion.criteria,
        configuration: input.configuration ?? {},
      });
      const result = createEvaluationCaseResult({
        id: `${input.runId}:${ref.caseId}:${ref.version}`,
        resultId: `${input.runId}:${ref.caseId}:${ref.version}`,
        evaluationRunId: input.runId,
        caseId: ref.caseId,
        caseVersion: ref.version,
        targetId: input.target.targetId,
        targetVersion: input.target.version,
        evaluatorActorId: input.evaluatorActorId,
        verdict: evalResult.verdict,
        evidenceRefs: evalResult.evidenceRefs,
        outputRefs: evalResult.outputRefs,
        domainPayload: evalResult.domainPayload,
        limitations: evalResult.limitations,
        evaluatedAt: this.#deps.at,
        createdAt: this.#deps.at,
        provenance: this.#deps.provenance,
      });
      this.#deps.store.saveCaseResult(result);
      results.push(result);
    }

    const summary = buildEvaluationSummary({
      id: `${input.runId}:summary`,
      summaryId: `${input.runId}:summary`,
      evaluationRunId: input.runId,
      results,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveSummary(summary);

    run = completeEvaluationRun(run, {
      completedAt: this.#deps.at,
      summaryId: summary.summaryId,
    });
    this.#deps.store.saveRun(run);

    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: `${input.runId}:completed`,
        eventType: "EVALUATION_RUN_COMPLETED",
        at: this.#deps.at,
        actorId: input.evaluatorActorId,
        payloadRef: summary.summaryId,
        idempotencyKey: `eval-run-completed:${input.runId}`,
        provenance: this.#deps.provenance,
      });
    }

    return { run, results, summary };
  }

  establishBaseline(input: {
    readonly baselineId: string;
    readonly evaluationRunId: string;
    readonly governingDecisionRef?: string;
    readonly supersedes?: string;
  }): ReturnType<typeof createEvaluationBaseline> {
    const run = this.#deps.store.getRun(input.evaluationRunId);
    if (!run || !run.summaryId) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "completed evaluation run required");
    }
    const summary = this.#deps.store.getSummary(run.summaryId);
    if (!summary) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "summary not found");
    }
    const baseline = createEvaluationBaseline({
      id: input.baselineId,
      baselineId: input.baselineId,
      targetId: run.target.targetId,
      targetVersion: run.target.version,
      suiteId: run.suiteId,
      suiteVersion: run.suiteVersion,
      evaluationRunId: run.runId,
      summaryId: summary.summaryId,
      metricResults: summary.metricResults,
      establishedAt: this.#deps.at,
      governingDecisionRef: input.governingDecisionRef,
      supersedes: input.supersedes,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveBaseline(baseline);
    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: input.baselineId,
        eventType: "BASELINE_ESTABLISHED",
        at: this.#deps.at,
        actorId: this.#deps.provenance.actorId,
        payloadRef: input.baselineId,
        idempotencyKey: `eval-baseline:${input.baselineId}`,
        provenance: this.#deps.provenance,
      });
    }
    return baseline;
  }

  compareRunToBaseline(input: {
    readonly comparisonId: string;
    readonly candidateRunId: string;
    readonly baselineId: string;
    readonly config?: RegressionConfig;
  }): {
    readonly comparison: ReturnType<typeof compareEvaluationToBaseline>;
    readonly signal?: ReturnType<typeof createLearningSignal>;
    readonly recommendation?: ReturnType<typeof createGovernanceRecommendation>;
  } {
    const run = this.#deps.store.getRun(input.candidateRunId);
    const baseline = this.#deps.store.getBaseline(input.baselineId);
    if (!run?.summaryId || !baseline) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "run summary and baseline required");
    }
    const summary = this.#deps.store.getSummary(run.summaryId);
    if (!summary) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "candidate summary not found");
    }

    const compatible = assertBaselineCompatible(baseline, {
      suiteId: run.suiteId,
      suiteVersion: run.suiteVersion,
      targetId: run.target.targetId,
    });

    const comparison = compareEvaluationToBaseline({
      comparisonId: input.comparisonId,
      candidateSummary: summary,
      baseline,
      candidateSuiteId: run.suiteId,
      candidateSuiteVersion: run.suiteVersion,
      config: input.config,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });

    const finalComparison = compatible
      ? comparison
      : freezeDeep({ ...comparison, assessment: "INCOMPARABLE" as const, rationale: "suite/target mismatch" });

    this.#deps.store.saveRegressionComparison(finalComparison);

    let signal: ReturnType<typeof createLearningSignal> | undefined;
    let recommendation: ReturnType<typeof createGovernanceRecommendation> | undefined;

    const signalKind = learningSignalForAssessment(finalComparison.assessment);
    if (signalKind) {
      signal = createLearningSignal({
        id: `${input.comparisonId}:signal`,
        signalId: `${input.comparisonId}:signal`,
        kind: signalKind,
        domain: run.target.targetType,
        rationale: finalComparison.rationale,
        refs: [{ type: "evaluation_run", id: run.runId }],
        evaluationRunId: run.runId,
        comparisonId: input.comparisonId,
        createdAt: this.#deps.at,
        provenance: this.#deps.provenance,
      });
      this.#deps.store.saveLearningSignal(signal);
      if (this.#deps.ledger) {
        emitEvaluationCorpusEvent(this.#deps.ledger, {
          eventId: signal.signalId,
          eventType: finalComparison.assessment === "REGRESSED" ? "REGRESSION_DETECTED" : "LEARNING_SIGNAL_RECORDED",
          at: this.#deps.at,
          actorId: this.#deps.provenance.actorId,
          payloadRef: signal.signalId,
          idempotencyKey: `learning-signal:${signal.signalId}`,
          provenance: this.#deps.provenance,
        });
      }
    }

    const recKind = recommendationForAssessment(finalComparison.assessment);
    if (recKind !== "NO_CHANGE" || finalComparison.assessment === "REGRESSED") {
      recommendation = createGovernanceRecommendation({
        id: `${input.comparisonId}:rec`,
        recommendationId: `${input.comparisonId}:rec`,
        kind: recKind,
        domain: run.target.targetType,
        rationale: finalComparison.rationale,
        signalIds: signal ? [signal.signalId] : undefined,
        refs: [{ type: "regression_comparison", id: input.comparisonId }],
        createdAt: this.#deps.at,
        provenance: this.#deps.provenance,
      });
      this.#deps.store.saveGovernanceRecommendation(recommendation);
      if (this.#deps.ledger) {
        emitEvaluationCorpusEvent(this.#deps.ledger, {
          eventId: recommendation.recommendationId,
          eventType: "GOVERNANCE_RECOMMENDATION_CREATED",
          at: this.#deps.at,
          actorId: this.#deps.provenance.actorId,
          payloadRef: recommendation.recommendationId,
          idempotencyKey: `gov-rec:${recommendation.recommendationId}`,
          provenance: this.#deps.provenance,
        });
      }
    }

    return { comparison: finalComparison, signal, recommendation };
  }

  recordLearningSignal(input: Omit<Parameters<typeof createLearningSignal>[0], "createdAt">): ReturnType<typeof createLearningSignal> {
    const signal = createLearningSignal({ ...input, createdAt: this.#deps.at });
    this.#deps.store.saveLearningSignal(signal);
    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: signal.signalId,
        eventType: "LEARNING_SIGNAL_RECORDED",
        at: this.#deps.at,
        actorId: this.#deps.provenance.actorId,
        payloadRef: signal.signalId,
        idempotencyKey: `learning-signal:${signal.signalId}`,
        provenance: this.#deps.provenance,
      });
    }
    return signal;
  }

  createRecommendation(
    input: Omit<Parameters<typeof createGovernanceRecommendation>[0], "createdAt">,
  ): ReturnType<typeof createGovernanceRecommendation> {
    const recommendation = createGovernanceRecommendation({ ...input, createdAt: this.#deps.at });
    this.#deps.store.saveGovernanceRecommendation(recommendation);
    if (this.#deps.ledger) {
      emitEvaluationCorpusEvent(this.#deps.ledger, {
        eventId: recommendation.recommendationId,
        eventType: "GOVERNANCE_RECOMMENDATION_CREATED",
        at: this.#deps.at,
        actorId: this.#deps.provenance.actorId,
        payloadRef: recommendation.recommendationId,
        idempotencyKey: `gov-rec:${recommendation.recommendationId}`,
        provenance: this.#deps.provenance,
      });
    }
    return recommendation;
  }
}

export { createCandidateFromGovernanceRun, isEvaluationWorthyOutcome } from "./pipeline.js";
