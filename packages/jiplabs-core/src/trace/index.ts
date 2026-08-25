import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { freezeDeep } from "../envelope.js";
import type { ActionAuthorization, ActionRequest, ActionResult } from "../actions/index.js";
import type { Decision, DecisionExplanation, DecisionProposal } from "../decisions/index.js";
import type { Evidence, ObservationRef } from "../evidence/index.js";
import type { GovernanceEvent } from "../ledger/index.js";
import type { Evaluation, Outcome } from "../outcomes/index.js";
import type { Override } from "../override/index.js";
import type { PolicyVersion } from "../policies/index.js";
import type { RollbackExecution, RollbackPlan } from "../rollback/index.js";
import type { EntityEnvelope, IsoTimestamp } from "../schema.js";

export type TraceStage =
  | "OBSERVATION"
  | "EVIDENCE"
  | "PROPOSAL"
  | "AUTHORITY_CHECK"
  | "POLICY"
  | "GATE_EVALUATION"
  | "DECISION"
  | "AUTHORIZATION"
  | "ACTION"
  | "OUTCOME"
  | "EVALUATION"
  | "OVERRIDE"
  | "ROLLBACK";

export type TraceLink = {
  readonly stage: TraceStage;
  readonly refId: string;
  readonly at: IsoTimestamp;
  readonly summary: string;
};

export type DecisionTrace = EntityEnvelope & {
  readonly decisionId: string;
  readonly links: readonly TraceLink[];
  readonly who: string;
  readonly what: string;
  readonly when: IsoTimestamp;
  readonly why: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly evidenceIds: readonly string[];
  readonly actionId?: string;
  readonly outcomeId?: string;
  readonly overrideIds: readonly string[];
  readonly rollbackPlanId?: string;
  readonly canRollback: boolean;
  readonly humanIntervened: boolean;
};

export type TraceInput = {
  readonly id: string;
  readonly decisionId: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: DecisionTrace["provenance"];
  readonly proposal: DecisionProposal;
  readonly decision: Decision;
  readonly explanation: DecisionExplanation;
  readonly policyVersion: PolicyVersion;
  readonly evidence: readonly Evidence[];
  readonly observations?: readonly ObservationRef[];
  readonly actionRequest?: ActionRequest;
  readonly actionAuthorization?: ActionAuthorization;
  readonly actionResult?: ActionResult;
  readonly outcome?: Outcome;
  readonly evaluation?: Evaluation;
  readonly overrides?: readonly Override[];
  readonly rollbackPlan?: RollbackPlan;
  readonly rollbackExecution?: RollbackExecution;
  readonly ledgerEvents?: readonly GovernanceEvent[];
};

export function buildDecisionTrace(input: TraceInput): DecisionTrace {
  const links: TraceLink[] = [];
  const at = input.decision.decidedAt;

  for (const obs of input.observations ?? []) {
    links.push({
      stage: "OBSERVATION",
      refId: obs.id,
      at: obs.observedAt,
      summary: `Observation from ${obs.source}`,
    });
  }
  for (const ev of input.evidence) {
    links.push({
      stage: "EVIDENCE",
      refId: ev.id,
      at: ev.createdAt,
      summary: `Evidence kind=${ev.kind}`,
    });
  }
  links.push({
    stage: "PROPOSAL",
    refId: input.proposal.id,
    at: input.proposal.createdAt,
    summary: `Proposal action=${input.proposal.action}`,
  });
  links.push({
    stage: "AUTHORITY_CHECK",
    refId: input.decision.authorityRef,
    at,
    summary: `Authority ${input.decision.authorityCode}`,
  });
  links.push({
    stage: "POLICY",
    refId: input.policyVersion.id,
    at: input.policyVersion.effectiveFrom,
    summary: `Policy ${input.policyVersion.policyId}@${input.policyVersion.version}`,
  });
  links.push({
    stage: "GATE_EVALUATION",
    refId: input.explanation.id,
    at,
    summary: `${input.decision.gateResults.length} gates evaluated`,
  });
  links.push({
    stage: "DECISION",
    refId: input.decision.id,
    at,
    summary: `Decision ${input.decision.decisionValue}`,
  });
  if (input.actionAuthorization) {
    links.push({
      stage: "AUTHORIZATION",
      refId: input.actionAuthorization.id,
      at: input.actionAuthorization.authorizedAt,
      summary: "Action authorized",
    });
  }
  if (input.actionResult) {
    links.push({
      stage: "ACTION",
      refId: input.actionResult.id,
      at: input.actionResult.executedAt ?? input.actionResult.createdAt,
      summary: `Action ${input.actionResult.action} ${input.actionResult.status}`,
    });
  }
  if (input.outcome) {
    links.push({
      stage: "OUTCOME",
      refId: input.outcome.id,
      at: input.outcome.observedAt,
      summary: "Outcome recorded",
    });
  }
  if (input.evaluation) {
    links.push({
      stage: "EVALUATION",
      refId: input.evaluation.id,
      at: input.evaluation.evaluatedAt,
      summary: `Evaluation verdict=${input.evaluation.verdict}`,
    });
  }
  for (const override of input.overrides ?? []) {
    links.push({
      stage: "OVERRIDE",
      refId: override.id,
      at: override.createdAt,
      summary: `Human override ${override.requestedAction}`,
    });
  }
  if (input.rollbackExecution) {
    links.push({
      stage: "ROLLBACK",
      refId: input.rollbackExecution.id,
      at: input.rollbackExecution.executedAt ?? input.rollbackExecution.createdAt,
      summary: `Rollback ${input.rollbackExecution.status}`,
    });
  }

  links.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const overrideIds = (input.overrides ?? []).map((o) => o.id);
  const humanIntervened = overrideIds.length > 0;

  return freezeDeep({
    id: input.id,
    schemaVersion: input.decision.schemaVersion,
    createdAt: input.createdAt,
    recordedAt: input.recordedAt ?? input.createdAt,
    provenance: input.provenance,
    decisionId: input.decisionId,
    links: Object.freeze(links),
    who: input.decision.actorId,
    what: input.decision.decisionValue,
    when: at,
    why: input.explanation.summary,
    policyId: input.policyVersion.policyId,
    policyVersion: input.policyVersion.version,
    evidenceIds: Object.freeze(input.evidence.map((e) => e.id)),
    actionId: input.actionResult?.id,
    outcomeId: input.outcome?.id,
    overrideIds: Object.freeze(overrideIds),
    rollbackPlanId: input.rollbackPlan?.id ?? input.decision.rollbackPlanId,
    canRollback: Boolean(input.rollbackPlan ?? input.decision.rollbackPlanId),
    humanIntervened,
  });
}

export function assertTraceReconstructable(trace: DecisionTrace): void {
  const required = ["PROPOSAL", "AUTHORITY_CHECK", "POLICY", "GATE_EVALUATION", "DECISION"];
  for (const stage of required) {
    if (!trace.links.some((l) => l.stage === stage)) {
      throw new GovernanceError(
        GovernanceErrorCode.TRACE_INCOMPLETE,
        `trace missing required stage ${stage}`,
      );
    }
  }
}

export function answerTraceQuestions(trace: DecisionTrace): {
  readonly whoDecided: string;
  readonly authority: string;
  readonly policyVersion: string;
  readonly evidence: readonly string[];
  readonly actionExecuted?: string;
  readonly outcomeRecorded?: string;
  readonly canRollback: boolean;
  readonly humanIntervened: boolean;
} {
  return {
    whoDecided: trace.who,
    authority:
      trace.links.find((l) => l.stage === "AUTHORITY_CHECK")?.summary ?? "",
    policyVersion: `${trace.policyId}@${trace.policyVersion}`,
    evidence: trace.evidenceIds,
    actionExecuted: trace.actionId,
    outcomeRecorded: trace.outcomeId,
    canRollback: trace.canRollback,
    humanIntervened: trace.humanIntervened,
  };
}
