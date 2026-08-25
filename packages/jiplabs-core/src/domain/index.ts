import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import {
  evaluateDecisionProposal,
  type Decision,
  type DecisionEvaluationResult,
  type DecisionProposal,
} from "../decisions/index.js";
import type { Evidence } from "../evidence/index.js";
import type { Authority, AuthorityGrant } from "../authority/index.js";
import type { Actor } from "../actors/index.js";
import type { PolicyVersion } from "../policies/index.js";
import type { RollbackPlan } from "../rollback/index.js";
import type { IsoTimestamp, JsonSafeMetadata, ResourceRef } from "../schema.js";

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

/** CORE-01 runtime contract — not invoked by CORE-00 evaluation. */
export type DomainActionExecutionRequest = {
  readonly decision: Decision;
  readonly action: string;
  readonly subjectId: string;
  readonly executionAttemptId: string;
};

export type DomainActionExecutionResult = {
  readonly status: "EXECUTED" | "FAILED" | "BLOCKED";
  readonly resultRef?: string;
};

export type DomainExecutionReconciliationStatus =
  | "EXECUTED"
  | "NOT_EXECUTED"
  | "UNKNOWN";

/** Optional reconciliation for crash-gap recovery — CORE-01 only. */
export interface DomainExecutionReconciler {
  readonly domain: string;
  reconcile(input: {
    readonly executionAttemptId: string;
    readonly decisionId: string;
    readonly action: string;
    readonly subjectId: string;
  }):
    | Promise<DomainExecutionReconciliationStatus>
    | DomainExecutionReconciliationStatus;
}

/** CORE-01 runtime contract — not invoked by CORE-00 evaluation. */
export interface DomainActionExecutor {
  readonly domain: string;
  execute(
    request: DomainActionExecutionRequest,
  ): Promise<DomainActionExecutionResult> | DomainActionExecutionResult;
}

export type DomainOutcomeEvaluation = {
  readonly verdict: string;
  readonly rationale: string;
  readonly details?: JsonSafeMetadata;
};

/** CORE-01 runtime contract — not invoked by CORE-00 evaluation. */
export interface DomainOutcomeEvaluator {
  readonly domain: string;
  evaluate(input: {
    readonly decisionId: string;
    readonly outcomeValue: unknown;
  }): DomainOutcomeEvaluation;
}

/** Governance-only adapter surface for CORE-00 authorization evaluation. */
export type DomainGovernanceAdapter = {
  readonly domain: string;
  readonly observationProvider: DomainObservationProvider;
  readonly policyProvider: DomainPolicyProvider;
  readonly evidenceProvider: DomainEvidenceProvider;
};

/** Full domain adapter bundle — execution/evaluation wired in CORE-01. */
export type DomainAdapterBundle = DomainGovernanceAdapter & {
  readonly actionExecutor: DomainActionExecutor;
  readonly outcomeEvaluator: DomainOutcomeEvaluator;
  readonly executionReconciler?: DomainExecutionReconciler;
};

export type EvaluateDomainDecisionAuthorizationInput = {
  readonly adapter: DomainGovernanceAdapter;
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
};

export type EvaluateDomainDecisionAuthorizationResult = DecisionEvaluationResult;

/**
 * CORE-00: deterministically evaluate whether a domain proposal is authorized.
 * Does not authorize or execute actions — that belongs to CORE-01.
 */
export function evaluateDomainDecisionAuthorization(
  input: EvaluateDomainDecisionAuthorizationInput,
): EvaluateDomainDecisionAuthorizationResult {
  if (input.adapter.domain !== input.proposal.domain) {
    return {
      ok: false,
      code: GovernanceErrorCode.INVALID_VALUE,
      message: "adapter domain mismatch",
    };
  }
  return evaluateDecisionProposal({
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
}

/**
 * @deprecated Use evaluateDomainDecisionAuthorization — CORE-00 must not orchestrate action authorization.
 */
export function governDomainDecision(
  input: EvaluateDomainDecisionAuthorizationInput & {
    readonly actionRequestId?: string;
    readonly authorizationId?: string;
  },
): EvaluateDomainDecisionAuthorizationResult {
  return evaluateDomainDecisionAuthorization(input);
}

export function assertDomainAdapterCannotBypassCore(
  result: EvaluateDomainDecisionAuthorizationResult,
  attemptedBypass: boolean,
): void {
  if (attemptedBypass && result.ok) {
    throw new GovernanceError(
      GovernanceErrorCode.ACTION_NOT_AUTHORIZED,
      "domain adapter attempted to bypass Core authorization",
    );
  }
}
