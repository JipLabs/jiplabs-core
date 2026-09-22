import {
  composePolicyDecisions,
  evaluatePolicy,
  sha256Canonical,
  type IsoTimestamp,
  type PolicyEvaluationOutcome,
  type PolicyEvaluationResult,
} from "@jiplabs/core";
import {
  commercialJurisdictionV1Policy,
  COMMERCIAL_JURISDICTION_V1,
  COMMERCIAL_JURISDICTION_V1_CONTENT_HASH,
  createCommercialJurisdictionPolicyRule,
  evaluateCommercialJurisdiction,
} from "./policy/commercial-jurisdiction-v1.js";
import {
  createProviderOverlayRule,
  evaluateProviderOverlay,
  STRIPE_OVERLAY_ID,
  STRIPE_OVERLAY_V1,
} from "./provider-overlays/stripe.js";
import {
  COMMERCIAL_JURISDICTION_POLICY_ID,
  type CommercialEligibilityContext,
  type CommercialJurisdictionPolicyDefinition,
} from "./types.js";

export const COMMERCIAL_ENTITLEMENT_INVARIANT =
  "NO COMMERCIAL ENTITLEMENT WITHOUT COMMERCIAL_ELIGIBILITY = ALLOW" as const;

export type ProviderOverlayId = typeof STRIPE_OVERLAY_ID;

const JURISDICTION_POLICIES: Record<
  string,
  ReturnType<typeof createCommercialJurisdictionPolicyRule>
> = {
  v1: commercialJurisdictionV1Policy,
};

const STRIPE_OVERLAY_CONTENT_HASH = sha256Canonical({
  overlayId: STRIPE_OVERLAY_V1.overlayId,
  overlayVersion: STRIPE_OVERLAY_V1.overlayVersion,
  restrictedCountries: [...STRIPE_OVERLAY_V1.restrictedCountries].sort(),
});

const STRIPE_OVERLAY_RULE = createProviderOverlayRule(
  STRIPE_OVERLAY_V1,
  STRIPE_OVERLAY_CONTENT_HASH,
);

export type EvaluateCommercialEligibilityInput = {
  readonly context: CommercialEligibilityContext;
  readonly evaluatedAt: IsoTimestamp;
  readonly policyVersion?: string;
  readonly overlays?: readonly string[];
};

function resolveOverlays(
  context: CommercialEligibilityContext,
  requested?: readonly string[],
): readonly string[] {
  if (requested && requested.length > 0) {
    return requested;
  }
  const provider = context.paymentContext?.provider?.trim().toLowerCase();
  if (provider === STRIPE_OVERLAY_ID) {
    return [STRIPE_OVERLAY_ID];
  }
  return [];
}

/**
 * Shared commercial eligibility evaluation. Products must not reimplement
 * jurisdiction lists; they consume this result and enforce ALLOW locally.
 */
export function evaluateCommercialEligibility(
  input: EvaluateCommercialEligibilityInput,
): PolicyEvaluationOutcome {
  const policyVersion = input.policyVersion ?? COMMERCIAL_JURISDICTION_V1.policyVersion;
  const policy = JURISDICTION_POLICIES[policyVersion];
  if (!policy) {
    return {
      ok: false,
      code: "POLICY_VERSION_UNKNOWN",
      message: `unknown commercial jurisdiction policy version ${policyVersion}`,
      evaluatedAt: input.evaluatedAt,
    };
  }

  const base = evaluatePolicy({
    policy,
    context: input.context,
    evaluatedAt: input.evaluatedAt,
  });
  if (!base.ok) return base;

  const overlayIds = resolveOverlays(input.context, input.overlays);
  const overlayResults: PolicyEvaluationResult[] = [];
  for (const overlayId of overlayIds) {
    if (overlayId !== STRIPE_OVERLAY_ID) {
      return {
        ok: false,
        code: "PROVIDER_OVERLAY_UNKNOWN",
        message: `unknown provider overlay ${overlayId}`,
        evaluatedAt: input.evaluatedAt,
      };
    }
    const overlayOutcome = evaluatePolicy({
      policy: STRIPE_OVERLAY_RULE,
      context: input.context,
      evaluatedAt: input.evaluatedAt,
    });
    if (!overlayOutcome.ok) return overlayOutcome;
    overlayResults.push(overlayOutcome.result);
  }

  if (overlayResults.length === 0) {
    return base;
  }

  return {
    ok: true,
    result: composePolicyDecisions({
      base: base.result,
      overlays: overlayResults,
      evaluatedAt: input.evaluatedAt,
    }),
  };
}

export {
  COMMERCIAL_JURISDICTION_POLICY_ID,
  COMMERCIAL_JURISDICTION_V1,
  COMMERCIAL_JURISDICTION_V1_CONTENT_HASH,
  STRIPE_OVERLAY_CONTENT_HASH,
  STRIPE_OVERLAY_V1,
  createCommercialJurisdictionPolicyRule,
  evaluateCommercialJurisdiction,
  evaluateProviderOverlay,
};
