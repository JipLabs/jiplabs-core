import { describe, expect, it } from "vitest";
import { evaluatePolicy, isEntitlementPermitted } from "@jiplabs/core";
import {
  COMMERCIAL_JURISDICTION_V1,
  PAYOUT_ELIGIBILITY_V1,
  buildSanctionsSnapshot,
  evaluatePayoutEligibility,
  payoutEligibilityV1Policy,
  screenName,
  type PayoutEligibilityContext,
  type SanctionsScreeningEvidence,
} from "../src/index.js";

const NOW = "2027-04-05T10:00:00.000Z";

const SDN_CSV = [
  '36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ',
  '7001,"PETROV, Ivan Sergeyevich","individual","RUSSIA-EO14024",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"DOB 1970."',
].join("\n");
const ALT_CSV = '7001,90,"aka","PETROV, Ivan",-0- ';

function snapshot(listId: "OFAC-SDN" | "OFAC-CONS", primary = SDN_CSV, aliases = ALT_CSV) {
  return buildSanctionsSnapshot({
    listId,
    sourceUrl: `https://example.test/${listId}`,
    publishedAt: "2027-04-01T14:00:00.000Z",
    fetchedAt: "2027-04-05T09:00:00.000Z",
    primaryCsv: primary,
    aliasCsv: aliases,
  });
}

function clean(name: string): SanctionsScreeningEvidence[] {
  return [screenName(name, snapshot("OFAC-SDN"), "2027-04-05T09:30:00.000Z"), screenName(name, snapshot("OFAC-CONS", "", ""), "2027-04-05T09:30:00.000Z")];
}

function ctx(overrides: Partial<PayoutEligibilityContext> = {}): PayoutEligibilityContext {
  return {
    subject: { type: "beneficiary", id: "award-1" },
    beneficiaryResidenceCountry: "FR",
    bankDestinationCountry: "FR",
    identityVerified: true,
    ageVerified: true,
    screenings: clean("Marie Dupont"),
    ...overrides,
  };
}

describe("sanctions screening", () => {
  it("parses OFAC CSV with aliases", () => {
    const snap = snapshot("OFAC-SDN");
    expect(snap.entries.map((e) => e.entryId)).toEqual(["36", "7001"]);
    expect(snap.entries[1]!.names).toEqual(["PETROV, Ivan Sergeyevich", "PETROV, Ivan"]);
    expect(snap.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("flags a name match as POTENTIAL_MATCH, folding case, order and accents", () => {
    const hit = screenName("Ivan Pétrov", snapshot("OFAC-SDN"), NOW);
    expect(hit.result).toBe("POTENTIAL_MATCH");
    expect(hit.matchedEntryIds).toEqual(["7001"]);
    expect(screenName("Marie Dupont", snapshot("OFAC-SDN"), NOW).result).toBe("NO_MATCH");
  });

  it("does not carry the person's name in the evidence", () => {
    expect(JSON.stringify(screenName("Marie Dupont", snapshot("OFAC-SDN"), NOW))).not.toMatch(/MARIE|Dupont/i);
  });
});

describe("payout-eligibility v1", () => {
  it("allows a verified, screened beneficiary in an unrestricted country", () => {
    const outcome = evaluatePolicy({ policy: payoutEligibilityV1Policy, context: ctx(), evaluatedAt: NOW });
    expect(isEntitlementPermitted(outcome)).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.policyId).toBe("payout-eligibility");
    expect(outcome.result.evidenceRefs.some((ref) => ref.startsWith("sanctions:OFAC-SDN:"))).toBe(true);
  });

  it("reuses the shared commercial-jurisdiction list rather than its own", () => {
    expect(PAYOUT_ELIGIBILITY_V1.jurisdiction).toBe(COMMERCIAL_JURISDICTION_V1);
    for (const country of COMMERCIAL_JURISDICTION_V1.restrictedCountries) {
      expect(evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ beneficiaryResidenceCountry: country }), NOW).decision).toBe("BLOCK");
    }
  });

  it("blocks a restricted bank destination or embargoed region", () => {
    const dest = evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ bankDestinationCountry: "IR" }), NOW);
    expect(dest.decision).toBe("BLOCK");
    expect(dest.reasonCodes).toContain("DESTINATION_RESTRICTED");
    const region = evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ beneficiaryResidenceCountry: "UA", beneficiaryRegion: "ua-43" }), NOW);
    expect(region.decision).toBe("BLOCK");
    expect(region.reasonCodes).toContain("REGION_RESTRICTED");
  });

  it("sends name matches, missing or stale screening and review countries to REVIEW", () => {
    expect(evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ screenings: clean("Ivan Petrov") }), NOW).reasonCodes).toContain("SANCTIONS_POTENTIAL_MATCH");
    expect(evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ screenings: clean("Marie Dupont").slice(0, 1) }), NOW).reasonCodes).toContain("SCREENING_MISSING");
    const later = "2027-04-20T10:00:00.000Z";
    const stale = evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx(), later);
    expect(stale.decision).toBe("REVIEW");
    expect(stale.reasonCodes).toEqual(expect.arrayContaining(["SCREENING_STALE", "LIST_STALE"]));
    expect(evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ beneficiaryResidenceCountry: "BY" }), NOW).decision).toBe("REVIEW");
  });

  it("blocks a confirmed match even when everything else passes", () => {
    const confirmed = clean("Marie Dupont").map((row) => ({ ...row, result: "CONFIRMED_MATCH" as const }));
    expect(evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ screenings: confirmed }), NOW).decision).toBe("BLOCK");
  });

  it("requires identity, age, residence and destination", () => {
    const missing = evaluatePayoutEligibility(
      PAYOUT_ELIGIBILITY_V1,
      ctx({ identityVerified: false, ageVerified: false, bankDestinationCountry: undefined }),
      NOW,
    );
    expect(missing.decision).toBe("REVIEW");
    expect(missing.reasonCodes).toEqual(expect.arrayContaining(["IDENTITY_UNVERIFIED", "AGE_UNVERIFIED", "INSUFFICIENT_CONTEXT"]));
    expect(evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx({ beneficiaryResidenceCountry: "France" }), NOW).reasonCodes).toContain("INVALID_CONTEXT");
  });

  it("is deterministic and versioned", () => {
    const a = evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx(), NOW);
    const b = evaluatePayoutEligibility(PAYOUT_ELIGIBILITY_V1, ctx(), NOW);
    expect(a.policyContentHash).toBe(b.policyContentHash);
    expect(a.contextRef).toBe(b.contextRef);
    expect(a.policyVersion).toBe("v1");
  });
});
