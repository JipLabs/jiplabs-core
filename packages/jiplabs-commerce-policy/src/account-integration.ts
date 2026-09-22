import type {
  PolicyContribution,
  PolicyDecision,
  PolicyEvaluationOutcome,
} from "@jiplabs/core";
import type { CommercialEligibilityContext } from "./types.js";
import type { CommercialEligibilityGatedEvent } from "./product-enforcement.js";

/**
 * HTTP path JipLabs Account must expose as the central commercial-eligibility
 * evaluator. Account consumes `@jiplabs/commerce-policy`; it must not host a
 * second independent policy engine.
 */
export const COMMERCIAL_ELIGIBILITY_EVALUATE_PATH =
  "/policy/evaluate/commercial-eligibility" as const;

export const COMMERCIAL_ELIGIBILITY_EVALUATE_METHOD = "POST" as const;

export type CommercialEligibilityEvaluateRequest = {
  readonly subject: {
    readonly type: "customer" | "organisation" | "account";
    readonly id: string;
  };
  readonly context: CommercialEligibilityContext;
  readonly policyVersion?: string;
  readonly overlays?: readonly string[];
  readonly evaluatedAt?: string;
  readonly trigger: CommercialEligibilityGatedEvent;
};

export type CommercialEligibilityEvaluateSuccess = {
  readonly ok: true;
  readonly decision: PolicyDecision;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly reasonCodes: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly evaluatedAt: string;
  readonly contributingSources: readonly PolicyContribution[];
  readonly consideredSignalKinds?: readonly string[];
  readonly contextRef?: string;
};

export type CommercialEligibilityEvaluateFailure = {
  readonly ok: false;
  readonly decision: null;
  readonly code: string;
  readonly message: string;
  readonly evaluatedAt: string;
};

export type CommercialEligibilityEvaluateResponse =
  | CommercialEligibilityEvaluateSuccess
  | CommercialEligibilityEvaluateFailure;

/**
 * Map a commerce-policy outcome onto the Account HTTP contract.
 * REVIEW remains `ok: true` (governed). Operational failures stay `ok: false`
 * with `decision: null` — never ALLOW.
 */
export function toAccountCommercialEligibilityResponse(
  outcome: PolicyEvaluationOutcome,
): CommercialEligibilityEvaluateResponse {
  if (!outcome.ok) {
    return {
      ok: false,
      decision: null,
      code: outcome.code,
      message: outcome.message,
      evaluatedAt: outcome.evaluatedAt,
    };
  }
  return {
    ok: true,
    decision: outcome.result.decision,
    policyId: outcome.result.policyId,
    policyVersion: outcome.result.policyVersion,
    reasonCodes: outcome.result.reasonCodes,
    evidenceRefs: outcome.result.evidenceRefs,
    evaluatedAt: outcome.result.evaluatedAt,
    contributingSources: outcome.result.contributingSources,
    ...(outcome.result.consideredSignalKinds
      ? { consideredSignalKinds: outcome.result.consideredSignalKinds }
      : {}),
    ...(outcome.result.contextRef
      ? { contextRef: outcome.result.contextRef }
      : {}),
  };
}

export const ACCOUNT_COMMERCIAL_ELIGIBILITY_FOLLOW_UP =
  "Implement POST /policy/evaluate/commercial-eligibility in JipLabs Account by calling evaluateCommercialEligibility from @jiplabs/commerce-policy. Do not duplicate jurisdiction rules inside Account." as const;
