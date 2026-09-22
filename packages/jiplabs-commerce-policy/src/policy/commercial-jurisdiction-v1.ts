import {
  createPolicyEvaluationResult,
  type PolicyEvaluationResult,
  type PolicyRule,
} from "@jiplabs/core";
import {
  billingRequiredAndMissing,
  collectCountrySignals,
  commercialContextFingerprint,
  commercialJurisdictionContentHash,
  CommercialReasonCode,
  COMMERCIAL_JURISDICTION_POLICY_ID,
  hasRequiredCountryContext,
  type CommercialEligibilityContext,
  type CommercialJurisdictionPolicyDefinition,
} from "../types.js";

/**
 * Frozen commercial-jurisdiction v1.
 *
 * Restricted ISO 3166-1 alpha-2 codes are explicit commercial-policy data,
 * not Core primitives and not a live sanctions research feed.
 */
export const COMMERCIAL_JURISDICTION_V1: CommercialJurisdictionPolicyDefinition =
  Object.freeze({
    policyId: COMMERCIAL_JURISDICTION_POLICY_ID,
    policyVersion: "v1",
    restrictedCountries: Object.freeze(["CU", "IR", "KP", "RU", "SY"]),
    reviewCountries: Object.freeze(["BY"]),
  });

export const COMMERCIAL_JURISDICTION_V1_CONTENT_HASH =
  commercialJurisdictionContentHash(COMMERCIAL_JURISDICTION_V1);

const RESTRICTED_V1 = new Set(COMMERCIAL_JURISDICTION_V1.restrictedCountries);
const REVIEW_V1 = new Set(COMMERCIAL_JURISDICTION_V1.reviewCountries);

export function evaluateCommercialJurisdiction(
  definition: CommercialJurisdictionPolicyDefinition,
  context: CommercialEligibilityContext,
  evaluatedAt: string,
): PolicyEvaluationResult {
  const collected = collectCountrySignals(context);
  const restricted = new Set(
    definition.restrictedCountries.map((c) => c.toUpperCase()),
  );
  const review = new Set(definition.reviewCountries.map((c) => c.toUpperCase()));
  const reasonCodes: string[] = [];
  let decision: PolicyEvaluationResult["decision"] = "ALLOW";

  const restrictedHits = collected.allCountries.filter((c) => restricted.has(c));
  if (restrictedHits.length > 0) {
    decision = "BLOCK";
    reasonCodes.push(CommercialReasonCode.JURISDICTION_RESTRICTED);
  } else if (collected.conflictingKinds.length > 0) {
    decision = "REVIEW";
    reasonCodes.push(CommercialReasonCode.CONFLICTING_CONTEXT);
  } else if (collected.invalidValues.length > 0) {
    decision = "REVIEW";
    reasonCodes.push(CommercialReasonCode.INVALID_CONTEXT);
  } else if (
    !hasRequiredCountryContext(collected) ||
    billingRequiredAndMissing(context, collected)
  ) {
    decision = "REVIEW";
    reasonCodes.push(CommercialReasonCode.INSUFFICIENT_CONTEXT);
  } else if (collected.allCountries.some((c) => review.has(c))) {
    decision = "REVIEW";
    reasonCodes.push(CommercialReasonCode.REGIONAL_RESTRICTION);
    reasonCodes.push(CommercialReasonCode.POLICY_REVIEW_REQUIRED);
  }

  return createPolicyEvaluationResult({
    decision,
    policyId: definition.policyId,
    policyVersion: definition.policyVersion,
    policyContentHash: commercialJurisdictionContentHash(definition),
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
        sourceKind: "POLICY",
        sourceId: definition.policyId,
        sourceVersion: definition.policyVersion,
        sourceContentHash: commercialJurisdictionContentHash(definition),
        decision,
        reasonCodes,
      },
    ],
  });
}

export function createCommercialJurisdictionPolicyRule(
  definition: CommercialJurisdictionPolicyDefinition,
): PolicyRule<CommercialEligibilityContext> {
  return {
    policyId: definition.policyId,
    policyVersion: definition.policyVersion,
    contentHash: commercialJurisdictionContentHash(definition),
    evaluate: ({ context, evaluatedAt }) =>
      evaluateCommercialJurisdiction(definition, context, evaluatedAt),
  };
}

export const commercialJurisdictionV1Policy =
  createCommercialJurisdictionPolicyRule(COMMERCIAL_JURISDICTION_V1);

export { RESTRICTED_V1 as COMMERCIAL_JURISDICTION_V1_RESTRICTED_SET };
export { REVIEW_V1 as COMMERCIAL_JURISDICTION_V1_REVIEW_SET };
