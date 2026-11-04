import {
  createPolicyEvaluationResult,
  sha256Canonical,
  type IsoTimestamp,
  type PolicyEvaluationResult,
  type PolicyRule,
  type SubjectRef,
} from "@jiplabs/core";
import { normalizeCountryCode, type CommercialJurisdictionPolicyDefinition } from "../types.js";
import { COMMERCIAL_JURISDICTION_V1 } from "./commercial-jurisdiction-v1.js";
import type { SanctionsListId, SanctionsScreeningEvidence } from "../sanctions/screening.js";

/**
 * PAYOUT_ELIGIBILITY v1 — may a JipLabs product pay a cash award to this beneficiary?
 *
 * Country rules are the shared commercial-jurisdiction list, not a product list. Region rules cover
 * OFAC region-based embargoes that ISO country codes cannot express. Person and entity screening comes
 * in as evidence from the OFAC lists; a name match is never cleared automatically.
 */
export const PAYOUT_ELIGIBILITY_POLICY_ID = "payout-eligibility" as const;

export const PayoutReasonCode = {
  SANCTIONS_CONFIRMED_MATCH: "SANCTIONS_CONFIRMED_MATCH",
  SANCTIONS_POTENTIAL_MATCH: "SANCTIONS_POTENTIAL_MATCH",
  SCREENING_MISSING: "SCREENING_MISSING",
  SCREENING_STALE: "SCREENING_STALE",
  LIST_STALE: "LIST_STALE",
  JURISDICTION_RESTRICTED: "JURISDICTION_RESTRICTED",
  REGION_RESTRICTED: "REGION_RESTRICTED",
  REGIONAL_REVIEW: "REGIONAL_REVIEW",
  DESTINATION_RESTRICTED: "DESTINATION_RESTRICTED",
  INSUFFICIENT_CONTEXT: "INSUFFICIENT_CONTEXT",
  INVALID_CONTEXT: "INVALID_CONTEXT",
  IDENTITY_UNVERIFIED: "IDENTITY_UNVERIFIED",
  AGE_UNVERIFIED: "AGE_UNVERIFIED",
} as const;

export type PayoutReasonCode = (typeof PayoutReasonCode)[keyof typeof PayoutReasonCode];

export type PayoutEligibilityContext = {
  readonly subject?: SubjectRef;
  readonly contextRef?: string;
  readonly beneficiaryResidenceCountry?: string;
  readonly beneficiaryNationalityCountry?: string;
  /** ISO 3166-2 subdivision when known, e.g. "UA-43". */
  readonly beneficiaryRegion?: string;
  readonly bankDestinationCountry?: string;
  readonly identityVerified: boolean;
  readonly ageVerified: boolean;
  readonly screenings: readonly SanctionsScreeningEvidence[];
  readonly evidenceRefs?: readonly string[];
};

export type PayoutEligibilityPolicyDefinition = {
  readonly policyId: typeof PAYOUT_ELIGIBILITY_POLICY_ID;
  readonly policyVersion: string;
  readonly jurisdiction: CommercialJurisdictionPolicyDefinition;
  readonly restrictedRegions: readonly string[];
  readonly requiredScreeningLists: readonly SanctionsListId[];
  readonly maxScreeningAgeHours: number;
  readonly maxListAgeDays: number;
  readonly sources: readonly string[];
};

export const PAYOUT_ELIGIBILITY_V1: PayoutEligibilityPolicyDefinition = Object.freeze({
  policyId: PAYOUT_ELIGIBILITY_POLICY_ID,
  policyVersion: "v1",
  jurisdiction: COMMERCIAL_JURISDICTION_V1,
  // Crimea, Sevastopol, Donetsk, Luhansk: OFAC region embargoes (EO 13685, EO 14065).
  restrictedRegions: Object.freeze(["UA-43", "UA-40", "UA-14", "UA-09"]),
  requiredScreeningLists: Object.freeze(["OFAC-SDN", "OFAC-CONS"] as const),
  maxScreeningAgeHours: 72,
  maxListAgeDays: 14,
  sources: Object.freeze([
    "https://ofac.treasury.gov/sanctions-list-service",
    "https://ofac.treasury.gov/sanctions-programs-and-country-information",
    "commercial-jurisdiction@v1",
  ]),
});

export function payoutEligibilityContentHash(definition: PayoutEligibilityPolicyDefinition): string {
  return sha256Canonical({
    policyId: definition.policyId,
    policyVersion: definition.policyVersion,
    jurisdiction: {
      policyId: definition.jurisdiction.policyId,
      policyVersion: definition.jurisdiction.policyVersion,
      restrictedCountries: [...definition.jurisdiction.restrictedCountries].sort(),
      reviewCountries: [...definition.jurisdiction.reviewCountries].sort(),
    },
    restrictedRegions: [...definition.restrictedRegions].sort(),
    requiredScreeningLists: [...definition.requiredScreeningLists].sort(),
    maxScreeningAgeHours: definition.maxScreeningAgeHours,
    maxListAgeDays: definition.maxListAgeDays,
    sources: [...definition.sources],
  });
}

const RANK = { ALLOW: 0, REVIEW: 1, BLOCK: 2 } as const;

export function evaluatePayoutEligibility(
  definition: PayoutEligibilityPolicyDefinition,
  context: PayoutEligibilityContext,
  evaluatedAt: IsoTimestamp,
): PolicyEvaluationResult {
  let decision: "ALLOW" | "REVIEW" | "BLOCK" = "ALLOW";
  const reasons: string[] = [];
  const raise = (to: "REVIEW" | "BLOCK", reason: PayoutReasonCode) => {
    if (RANK[to] > RANK[decision]) decision = to;
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const restricted = new Set(definition.jurisdiction.restrictedCountries.map((c) => c.toUpperCase()));
  const review = new Set(definition.jurisdiction.reviewCountries.map((c) => c.toUpperCase()));
  const nowMs = Date.parse(evaluatedAt);

  const personCountries: string[] = [];
  for (const raw of [context.beneficiaryResidenceCountry, context.beneficiaryNationalityCountry]) {
    if (raw === undefined) continue;
    const code = normalizeCountryCode(raw);
    if (code) personCountries.push(code);
    else raise("REVIEW", PayoutReasonCode.INVALID_CONTEXT);
  }
  const destination =
    context.bankDestinationCountry === undefined ? null : normalizeCountryCode(context.bankDestinationCountry);
  if (context.bankDestinationCountry !== undefined && !destination) raise("REVIEW", PayoutReasonCode.INVALID_CONTEXT);

  if (personCountries.some((c) => restricted.has(c))) raise("BLOCK", PayoutReasonCode.JURISDICTION_RESTRICTED);
  if (destination && restricted.has(destination)) raise("BLOCK", PayoutReasonCode.DESTINATION_RESTRICTED);
  const region = context.beneficiaryRegion?.trim().toUpperCase();
  if (region && definition.restrictedRegions.includes(region)) raise("BLOCK", PayoutReasonCode.REGION_RESTRICTED);
  if ([...personCountries, ...(destination ? [destination] : [])].some((c) => review.has(c))) {
    raise("REVIEW", PayoutReasonCode.REGIONAL_REVIEW);
  }
  if (!context.beneficiaryResidenceCountry || !destination) raise("REVIEW", PayoutReasonCode.INSUFFICIENT_CONTEXT);

  for (const listId of definition.requiredScreeningLists) {
    const evidence = context.screenings.find((row) => row.listId === listId);
    if (!evidence) {
      raise("REVIEW", PayoutReasonCode.SCREENING_MISSING);
      continue;
    }
    if (evidence.result === "CONFIRMED_MATCH") raise("BLOCK", PayoutReasonCode.SANCTIONS_CONFIRMED_MATCH);
    else if (evidence.result === "POTENTIAL_MATCH") raise("REVIEW", PayoutReasonCode.SANCTIONS_POTENTIAL_MATCH);
    const screenedMs = Date.parse(evidence.screenedAt);
    if (!Number.isFinite(screenedMs) || nowMs - screenedMs > definition.maxScreeningAgeHours * 3_600_000) {
      raise("REVIEW", PayoutReasonCode.SCREENING_STALE);
    }
    const publishedMs = Date.parse(evidence.listPublishedAt);
    if (!Number.isFinite(publishedMs) || nowMs - publishedMs > definition.maxListAgeDays * 86_400_000) {
      raise("REVIEW", PayoutReasonCode.LIST_STALE);
    }
  }

  if (!context.identityVerified) raise("REVIEW", PayoutReasonCode.IDENTITY_UNVERIFIED);
  if (!context.ageVerified) raise("REVIEW", PayoutReasonCode.AGE_UNVERIFIED);

  const contentHash = payoutEligibilityContentHash(definition);
  const evidenceRefs = [
    ...context.screenings.map(
      (row) => `sanctions:${row.listId}:${row.listContentHash}:${row.result}:${row.screenedAt}`,
    ),
    ...(context.evidenceRefs ?? []),
  ];
  return createPolicyEvaluationResult({
    decision,
    policyId: definition.policyId,
    policyVersion: definition.policyVersion,
    policyContentHash: contentHash,
    evaluatedAt,
    reasonCodes: reasons,
    evidenceRefs,
    subject: context.subject,
    contextRef:
      context.contextRef ??
      sha256Canonical({
        subject: context.subject ?? null,
        personCountries,
        destination,
        region: region ?? null,
        screenings: context.screenings.map((row) => [row.listId, row.result, row.subjectFingerprint]),
        evaluatedAt,
      }),
    consideredSignalKinds: ["RESIDENCE", "NATIONALITY", "REGION", "BANK_DESTINATION", "SANCTIONS_SCREENING", "IDENTITY", "AGE"],
    contributingSources: [
      {
        sourceKind: "POLICY",
        sourceId: definition.policyId,
        sourceVersion: definition.policyVersion,
        sourceContentHash: contentHash,
        decision,
        reasonCodes: reasons,
      },
    ],
  });
}

export function createPayoutEligibilityPolicyRule(
  definition: PayoutEligibilityPolicyDefinition,
): PolicyRule<PayoutEligibilityContext> {
  return {
    policyId: definition.policyId,
    policyVersion: definition.policyVersion,
    contentHash: payoutEligibilityContentHash(definition),
    evaluate: ({ context, evaluatedAt }) => evaluatePayoutEligibility(definition, context, evaluatedAt),
  };
}

export const payoutEligibilityV1Policy = createPayoutEligibilityPolicyRule(PAYOUT_ELIGIBILITY_V1);
