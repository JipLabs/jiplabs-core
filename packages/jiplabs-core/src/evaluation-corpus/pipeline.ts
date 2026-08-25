import type { CoreEvaluation } from "../evaluation/index.js";
import type { GovernanceRun } from "../governor/runtime-state.js";
import type { DecisionTrace } from "../trace/index.js";
import type { IsoTimestamp, Provenance, Ref } from "../schema.js";
import { createEvaluationCaseCandidate } from "./cases.js";
import type { EvaluationCaseCandidate, EvaluationCaseProvenance } from "./types.js";

export type CandidateFromGovernanceInput = {
  readonly id: string;
  readonly candidateId: string;
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly run: GovernanceRun;
  readonly trace?: DecisionTrace;
  readonly evaluation?: CoreEvaluation;
  readonly sourceKind: EvaluationCaseProvenance["sourceKind"];
  readonly evidenceRefs?: readonly string[];
  readonly tags?: readonly string[];
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
};

export function buildCandidateProvenance(input: {
  readonly sourceKind: EvaluationCaseProvenance["sourceKind"];
  readonly run: GovernanceRun;
  readonly trace?: DecisionTrace;
  readonly evaluation?: CoreEvaluation;
  readonly evidenceRefs?: readonly string[];
}): EvaluationCaseProvenance {
  return {
    sourceKind: input.sourceKind,
    runId: input.run.runId,
    decisionId: input.run.decision?.id,
    decisionHash: input.run.decision?.decisionHash,
    actionRequestId: input.run.actionRequest?.id,
    actionResultId: input.run.actionResult?.id,
    outcomeId: input.run.outcome?.id,
    evaluationId: input.evaluation?.id ?? input.run.evaluation?.id,
    evaluationVerdict: input.evaluation?.verdict ?? input.run.evaluation?.verdict,
    traceId: input.trace?.id,
    evidenceRefs: input.evidenceRefs,
    governanceEventIds: input.trace?.links.map((link) => link.refId),
  };
}

export function createCandidateFromGovernanceRun(input: CandidateFromGovernanceInput): EvaluationCaseCandidate {
  const provenance = buildCandidateProvenance({
    sourceKind: input.sourceKind,
    run: input.run,
    trace: input.trace,
    evaluation: input.evaluation,
    evidenceRefs: input.evidenceRefs,
  });
  const inputContextRefs: Ref[] = [];
  if (input.run.decision?.id) {
    inputContextRefs.push({ type: "decision", id: input.run.decision.id });
  }
  if (input.run.actionRequest?.id) {
    inputContextRefs.push({ type: "action_request", id: input.run.actionRequest.id });
  }
  if (input.run.outcome?.id) {
    inputContextRefs.push({ type: "outcome", id: input.run.outcome.id });
  }
  return createEvaluationCaseCandidate({
    id: input.id,
    candidateId: input.candidateId,
    domain: input.domain,
    title: input.title,
    description: input.description,
    provenance,
    inputContextRefs,
    evidenceRefs: input.evidenceRefs ?? [],
    tags: input.tags,
    createdAt: input.at,
    provenanceEnvelope: input.provenance,
  });
}

export function isEvaluationWorthyOutcome(input: {
  readonly evaluationVerdict?: string;
  readonly disposition?: string;
  readonly actionFailed?: boolean;
  readonly rollbackTriggered?: boolean;
}): boolean {
  if (input.actionFailed || input.rollbackTriggered) {
    return true;
  }
  if (input.evaluationVerdict === "INCORRECT" || input.evaluationVerdict === "PARTIAL") {
    return true;
  }
  if (input.disposition === "ROLLBACK" || input.disposition === "FOLLOW_UP") {
    return true;
  }
  return false;
}
