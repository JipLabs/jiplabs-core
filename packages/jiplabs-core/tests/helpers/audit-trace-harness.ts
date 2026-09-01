import {
  createDecision,
  createDecisionExplanation,
  createDecisionGovernanceSnapshot,
  createDecisionProposal,
  type Decision,
  type DecisionExplanation,
  type DecisionProposal,
} from "../../src/decisions/index.js";
import { createEvidence, type Evidence } from "../../src/evidence/index.js";
import {
  buildDecisionTrace,
  type DecisionTrace,
  type TraceInput,
} from "../../src/trace/index.js";
import type { PolicyVersion } from "../../src/policies/index.js";
import {
  AT,
  PROVENANCE,
  activeGrant,
  activePolicy,
  baseActor,
  baseAuthority,
  passEvidence,
} from "./governor-harness.js";

export function minimalTraceInput(overrides: {
  decisionId?: string;
  evidence?: Evidence[];
  policyVersion?: PolicyVersion;
  proposal?: DecisionProposal;
  decision?: Decision;
  explanation?: DecisionExplanation;
  withExecution?: boolean;
  withEvaluation?: boolean;
} = {}): TraceInput {
  const policyVersion = overrides.policyVersion ?? activePolicy();
  const evidence = overrides.evidence ?? passEvidence();
  const actor = baseActor();
  const authority = baseAuthority();
  const grant = activeGrant(actor.id, authority);
  const proposal =
    overrides.proposal ??
    createDecisionProposal({
      id: "prop-audit",
      actorId: actor.id,
      action: "EXECUTE",
      subject: { type: "entity", id: "target-1", domain: "test-domain" },
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: evidence.map((e) => e.id),
      createdAt: AT,
      provenance: PROVENANCE,
    });

  const explanationId = "exp-audit";
  const governanceSnapshot = createDecisionGovernanceSnapshot({
    proposalId: proposal.id,
    grant,
    authorityCode: authority.code,
    requiredCapability: "EXECUTE_ACTION",
    policyVersion,
    evidenceRefs: proposal.evidenceRefs,
    gateResults: [],
    decidedAt: AT,
  });

  const decision =
    overrides.decision ??
    createDecision({
      id: overrides.decisionId ?? "dec-audit",
      proposalId: proposal.id,
      actorId: proposal.actorId,
      authorityRef: grant.id,
      authorityCode: authority.code,
      policyRef: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evidenceRefs: proposal.evidenceRefs,
      gateResults: [],
      decisionValue: "APPROVE",
      status: overrides.withExecution ? "EXECUTED" : "DECIDED",
      decidedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
      humanApprovalRequired: false,
      humanOverrideAvailable: true,
      rollbackRequired: false,
      explanationRef: explanationId,
      autonomyMode: policyVersion.autonomyMode,
      governanceSnapshot,
    });

  const explanation =
    overrides.explanation ??
    createDecisionExplanation({
      id: explanationId,
      decisionId: decision.id,
      summary: "audit test decision",
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      gateResults: [],
      evidenceRefs: proposal.evidenceRefs,
      rejectedAlternatives: [],
      knownLimitations: [],
      rollbackPath: "none",
      createdAt: AT,
      provenance: PROVENANCE,
    });

  const input: TraceInput = {
    id: `trace-${decision.id}`,
    decisionId: decision.id,
    createdAt: AT,
    provenance: PROVENANCE,
    proposal,
    decision,
    explanation,
    policyVersion,
    evidence,
  };

  if (overrides.withExecution) {
    return {
      ...input,
      actionRequest: {
        id: "act-req-audit",
        decisionId: decision.id,
        action: proposal.action,
        subject: proposal.subject,
        requestedAt: AT,
        createdAt: AT,
        provenance: PROVENANCE,
        schemaVersion: decision.schemaVersion,
        recordedAt: AT,
      },
      actionAuthorization: {
        id: "auth-audit",
        actionRequestId: "act-req-audit",
        decisionId: decision.id,
        status: "AUTHORIZED",
        authorizedAt: AT,
        createdAt: AT,
        provenance: PROVENANCE,
        schemaVersion: decision.schemaVersion,
        recordedAt: AT,
        authorityGrantId: grant.id,
        authorityGrantContentHash: grant.contentHash,
        actionRequestContentHash: "hash-action",
      },
      actionResult: {
        id: "result-audit",
        actionRequestId: "act-req-audit",
        status: "EXECUTED",
        executedAt: AT,
        createdAt: AT,
        provenance: PROVENANCE,
        schemaVersion: decision.schemaVersion,
        recordedAt: AT,
      },
      outcome: {
        id: "out-audit",
        actionResultId: "result-audit",
        kind: "SUCCESS",
        observedAt: AT,
        createdAt: AT,
        provenance: PROVENANCE,
        schemaVersion: decision.schemaVersion,
        recordedAt: AT,
      },
      ...(overrides.withEvaluation
        ? {
            evaluation: {
              id: "eval-audit",
              outcomeId: "out-audit",
              verdict: "KEEP",
              evaluatedAt: AT,
              rationale: "ok",
              createdAt: AT,
              provenance: PROVENANCE,
              schemaVersion: decision.schemaVersion,
              recordedAt: AT,
            },
          }
        : {}),
    };
  }

  return input;
}

export function buildTestDecisionTrace(
  overrides: Parameters<typeof minimalTraceInput>[0] = {},
): DecisionTrace {
  return buildDecisionTrace(minimalTraceInput(overrides));
}

export function sparseEvidence(): Evidence[] {
  return [
    createEvidence({
      id: "ev-sparse",
      kind: "gate_a",
      subject: { type: "entity", id: "target-1", domain: "test-domain" },
      observationRefs: [],
      value: "PASS",
      evaluatorActorId: "evaluator-1",
      createdAt: AT,
      provenance: PROVENANCE,
    }),
  ];
}
