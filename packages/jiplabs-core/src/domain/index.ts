import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { authorizeAction } from "../actions/index.js";
import {
  evaluateDecisionProposal,
  type Decision,
  type DecisionProposal,
} from "../decisions/index.js";
import type { Evidence } from "../evidence/index.js";
import type {
  Authority,
  AuthorityGrant,
} from "../authority/index.js";
import type { Actor } from "../actors/index.js";
import type { PolicyVersion } from "../policies/index.js";
import type { RollbackPlan } from "../rollback/index.js";
import type { IsoTimestamp, ResourceRef } from "../schema.js";

export type DomainObservation = {
  readonly id: string;
  readonly source: string;
  readonly observedAt: IsoTimestamp;
  readonly payloadRef: string;
};

export interface DomainObservationProvider {
  readonly domain: string;
  fetchObservations(input: {
    readonly subjectId: string;
    readonly at: IsoTimestamp;
  }): Promise<readonly DomainObservation[]> | readonly DomainObservation[];
}

export interface DomainPolicyProvider {
  readonly domain: string;
  resolvePolicyVersion(input: {
    readonly policyId: string;
    readonly version: string;
  }): PolicyVersion | null;
}

export interface DomainEvidenceProvider {
  readonly domain: string;
  collectEvidence(input: {
    readonly subjectId: string;
    readonly requiredKinds: readonly string[];
    readonly at: IsoTimestamp;
  }): Promise<readonly Evidence[]> | readonly Evidence[];
}

export type DomainActionExecutionRequest = {
  readonly decision: Decision;
  readonly action: string;
  readonly subjectId: string;
};

export type DomainActionExecutionResult = {
  readonly status: "EXECUTED" | "FAILED" | "BLOCKED";
  readonly resultRef?: string;
};

export interface DomainActionExecutor {
  readonly domain: string;
  execute(
    request: DomainActionExecutionRequest,
  ): Promise<DomainActionExecutionResult> | DomainActionExecutionResult;
}

export type DomainOutcomeEvaluation = {
  readonly verdict: "KEEP" | "ROLLBACK" | "FOLLOW_UP" | "INCONCLUSIVE";
  readonly rationale: string;
};

export interface DomainOutcomeEvaluator {
  readonly domain: string;
  evaluate(input: {
    readonly decisionId: string;
    readonly outcomeValue: unknown;
  }): DomainOutcomeEvaluation;
}

export type DomainAdapterBundle = {
  readonly domain: string;
  readonly observationProvider: DomainObservationProvider;
  readonly policyProvider: DomainPolicyProvider;
  readonly evidenceProvider: DomainEvidenceProvider;
  readonly actionExecutor: DomainActionExecutor;
  readonly outcomeEvaluator: DomainOutcomeEvaluator;
};

export type GovernedDomainDecisionInput = {
  readonly adapter: DomainAdapterBundle;
  readonly actor: Actor;
  readonly authority: Authority;
  readonly grant: AuthorityGrant | null | undefined;
  readonly proposal: DecisionProposal;
  readonly policyVersion: PolicyVersion;
  readonly evidence: readonly Evidence[];
  readonly rollbackPlan?: RollbackPlan | null;
  readonly resource: ResourceRef;
  readonly at: IsoTimestamp;
  readonly decisionId: string;
  readonly explanationId: string;
  readonly actionRequestId: string;
  readonly authorizationId: string;
};

export type GovernedDomainDecisionResult =
  | {
      readonly ok: true;
      readonly decision: Decision;
      readonly authorizationId: string;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

/**
 * Domain adapters may supply semantics, but authorization always flows through Core.
 * This helper proves adapters cannot bypass authority/policy/gate evaluation.
 */
export function governDomainDecision(
  input: GovernedDomainDecisionInput,
): GovernedDomainDecisionResult {
  if (input.adapter.domain !== input.proposal.domain) {
    return {
      ok: false,
      code: GovernanceErrorCode.INVALID_VALUE,
      message: "adapter domain mismatch",
    };
  }
  const evaluation = evaluateDecisionProposal({
    proposal: input.proposal,
    actor: input.actor,
    authority: input.authority,
    grant: input.grant,
    policyVersion: input.policyVersion,
    evidence: input.evidence,
    rollbackPlan: input.rollbackPlan,
    at: input.at,
    resource: input.resource,
    decisionId: input.decisionId,
    explanationId: input.explanationId,
  });
  if (!evaluation.ok) {
    return {
      ok: false,
      code: evaluation.code,
      message: evaluation.message,
    };
  }
  if (evaluation.decision.humanApprovalRequired) {
    return {
      ok: false,
      code: GovernanceErrorCode.HUMAN_APPROVAL_REQUIRED,
      message: "human approval required before domain action execution",
    };
  }
  try {
    authorizeAction({
      id: input.authorizationId,
      decision: evaluation.decision,
      actionRequest: {
        id: input.actionRequestId,
        schemaVersion: evaluation.decision.schemaVersion,
        createdAt: input.at,
        recordedAt: input.at,
        provenance: input.proposal.provenance,
        decisionId: evaluation.decision.id,
        action: input.proposal.action,
        subject: input.proposal.subject,
        requestedAt: input.at,
      },
      at: input.at,
      createdAt: input.at,
      provenance: input.proposal.provenance,
    });
  } catch (error) {
    const code =
      error instanceof GovernanceError
        ? error.code
        : GovernanceErrorCode.ACTION_NOT_AUTHORIZED;
    const message =
      error instanceof Error ? error.message : "action authorization failed";
    return { ok: false, code, message };
  }
  return {
    ok: true,
    decision: evaluation.decision,
    authorizationId: input.authorizationId,
  };
}

export function assertDomainAdapterCannotBypassCore(
  result: GovernedDomainDecisionResult,
  attemptedBypass: boolean,
): void {
  if (attemptedBypass && result.ok) {
    throw new GovernanceError(
      GovernanceErrorCode.ACTION_NOT_AUTHORIZED,
      "domain adapter attempted to bypass Core authorization",
    );
  }
}
