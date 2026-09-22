import {
  createPolicyEvaluationResult,
  type PolicyEvaluationResult,
  type PolicyRule,
} from "@jiplabs/core";
import {
  collectCountrySignals,
  CommercialReasonCode,
  commercialContextFingerprint,
  type CommercialEligibilityContext,
} from "../types.js";

export const STRIPE_OVERLAY_ID = "stripe" as const;
export const STRIPE_OVERLAY_VERSION = "v1" as const;

/**
 * Stripe overlay v1 — additional commercial restrictions that may apply when
 * Stripe is the payment provider. This overlay may only tighten JipLabs
 * policy; it never relaxes a JipLabs BLOCK or REVIEW.
 *
 * Codes listed here are versioned overlay data, not a live Stripe API.
 */
export const STRIPE_OVERLAY_V1_RESTRICTED_COUNTRIES = Object.freeze([
  "AF",
  "MM",
  "SS",
]);

export type ProviderOverlayDefinition = {
  readonly overlayId: string;
  readonly overlayVersion: string;
  readonly restrictedCountries: readonly string[];
};

export const STRIPE_OVERLAY_V1: ProviderOverlayDefinition = Object.freeze({
  overlayId: STRIPE_OVERLAY_ID,
  overlayVersion: STRIPE_OVERLAY_VERSION,
  restrictedCountries: STRIPE_OVERLAY_V1_RESTRICTED_COUNTRIES,
});

export function evaluateProviderOverlay(
  overlay: ProviderOverlayDefinition,
  context: CommercialEligibilityContext,
  evaluatedAt: string,
  contentHash: string,
): PolicyEvaluationResult {
  const collected = collectCountrySignals(context);
  const restricted = new Set(
    overlay.restrictedCountries.map((c) => c.toUpperCase()),
  );
  const hits = collected.allCountries.filter((c) => restricted.has(c));
  const decision = hits.length > 0 ? "BLOCK" : "ALLOW";
  const reasonCodes =
    hits.length > 0 ? [CommercialReasonCode.PROVIDER_RESTRICTION] : [];

  return createPolicyEvaluationResult({
    decision,
    policyId: overlay.overlayId,
    policyVersion: overlay.overlayVersion,
    policyContentHash: contentHash,
    evaluatedAt,
    reasonCodes,
    evidenceRefs: [...(context.evidenceRefs ?? [])],
    subject: context.subject,
    contextRef:
      context.contextRef ??
      commercialContextFingerprint(context, collected, evaluatedAt),
    consideredSignalKinds: collected.consideredSignalKinds,
    contributingSources: [
      {
        sourceKind: "OVERLAY",
        sourceId: overlay.overlayId,
        sourceVersion: overlay.overlayVersion,
        sourceContentHash: contentHash,
        decision,
        reasonCodes,
      },
    ],
  });
}

export function createProviderOverlayRule(
  overlay: ProviderOverlayDefinition,
  contentHash: string,
): PolicyRule<CommercialEligibilityContext> {
  return {
    policyId: overlay.overlayId,
    policyVersion: overlay.overlayVersion,
    contentHash,
    evaluate: ({ context, evaluatedAt }) =>
      evaluateProviderOverlay(overlay, context, evaluatedAt, contentHash),
  };
}
