import {
  assertEntitlementPermitted,
  isEntitlementPermitted,
  type PolicyEvaluationOutcome,
  type PolicyEvaluationResult,
} from "@jiplabs/core";
import { COMMERCIAL_ENTITLEMENT_INVARIANT } from "./commercial-eligibility.js";

/**
 * Commercial actions that must be gated by a fresh or still-valid ALLOW
 * commercial-eligibility decision. A UI restriction alone is insufficient;
 * product backends must call {@link assertCommercialActionAllowed}.
 */
export const COMMERCIAL_ELIGIBILITY_GATED_EVENTS = [
  "INITIAL_SUBSCRIPTION",
  "SUBSCRIPTION_RENEWAL",
  "UPGRADE",
  "DOWNGRADE_MATERIAL_ENTITLEMENT_CHANGE",
  "NEW_PAYMENT_METHOD",
  "BILLING_COUNTRY_CHANGE",
  "RESIDENCE_COUNTRY_CHANGE",
  "ORGANISATION_COUNTRY_CHANGE",
  "PAYING_ORGANISATION_CREATION",
  "ONE_OFF_PURCHASE",
  "PAID_SERVICE_ACTIVATION",
  "PROVIDER_WEBHOOK_COMMERCIAL_CONTEXT_CHANGE",
  "ENTITLEMENT_REACTIVATION",
] as const;

export type CommercialEligibilityGatedEvent =
  (typeof COMMERCIAL_ELIGIBILITY_GATED_EVENTS)[number];

export type ProductCommercialGateInput = {
  readonly event: CommercialEligibilityGatedEvent;
  readonly eligibility: PolicyEvaluationOutcome | PolicyEvaluationResult | null | undefined;
};

/**
 * Backend enforcement gate. Stale-absent, BLOCK, REVIEW, and evaluation
 * failure are not ALLOW.
 */
export function assertCommercialActionAllowed(
  input: ProductCommercialGateInput,
): void {
  assertEntitlementPermitted(input.eligibility);
}

export function isCommercialActionAllowed(
  eligibility: PolicyEvaluationOutcome | PolicyEvaluationResult | null | undefined,
): boolean {
  return isEntitlementPermitted(eligibility);
}

export { COMMERCIAL_ENTITLEMENT_INVARIANT };
