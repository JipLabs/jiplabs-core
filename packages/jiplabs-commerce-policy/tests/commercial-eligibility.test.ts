import { describe, expect, it } from "vitest";
import {
  GovernanceErrorCode,
  hashPolicyEvaluationResult,
  isEntitlementPermitted,
  serializePolicyEvaluationResult,
} from "@jiplabs/core";
import {
  COMMERCIAL_ENTITLEMENT_INVARIANT,
  COMMERCIAL_JURISDICTION_POLICY_ID,
  COMMERCIAL_JURISDICTION_V1,
  COMMERCIAL_JURISDICTION_V1_CONTENT_HASH,
  CommercialReasonCode,
  STRIPE_OVERLAY_V1_RESTRICTED_COUNTRIES,
  createCommercialJurisdictionPolicyRule,
  evaluateCommercialEligibility,
  evaluateCommercialJurisdiction,
} from "../src/index.js";

const AT = "2026-09-21T16:00:00.000Z";

describe("commercial eligibility v1", () => {
  it("allows a permitted jurisdiction with required context", () => {
    const outcome = evaluateCommercialEligibility({
      context: {
        subject: { type: "account", id: "acct-fr" },
        residenceCountry: "FR",
        contextRef: "acct-fr",
      },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("ALLOW");
      expect(outcome.result.policyId).toBe(COMMERCIAL_JURISDICTION_POLICY_ID);
      expect(outcome.result.policyVersion).toBe("v1");
      expect(outcome.result.policyContentHash).toBe(
        COMMERCIAL_JURISDICTION_V1_CONTENT_HASH,
      );
      expect(outcome.result.reasonCodes).toEqual([]);
      expect(outcome.result.evaluatedAt).toBe(AT);
    }
    expect(isEntitlementPermitted(outcome)).toBe(true);
  });

  it("blocks a restricted jurisdiction", () => {
    const outcome = evaluateCommercialEligibility({
      context: { residenceCountry: "RU", contextRef: "acct-ru" },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("BLOCK");
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.JURISDICTION_RESTRICTED,
      );
    }
    expect(isEntitlementPermitted(outcome)).toBe(false);
  });

  it("reviews when required country context is missing", () => {
    const outcome = evaluateCommercialEligibility({
      context: { contextRef: "acct-unknown" },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("REVIEW");
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.INSUFFICIENT_CONTEXT,
      );
    }
    expect(isEntitlementPermitted(outcome)).toBe(false);
  });

  it("reviews when payment is present but billing country is missing", () => {
    const outcome = evaluateCommercialEligibility({
      context: {
        residenceCountry: "FR",
        paymentContext: { present: true, provider: "stripe" },
      },
      evaluatedAt: AT,
      overlays: [],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("REVIEW");
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.INSUFFICIENT_CONTEXT,
      );
    }
  });

  it("reviews conflicting values for the same country signal", () => {
    const outcome = evaluateCommercialEligibility({
      context: {
        residenceCountry: "FR",
        countrySignals: [{ kind: "RESIDENCE", country: "DE" }],
      },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("REVIEW");
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.CONFLICTING_CONTEXT,
      );
    }
  });

  it("blocks rather than reviews when a conflict includes a restricted country", () => {
    const outcome = evaluateCommercialEligibility({
      context: {
        residenceCountry: "FR",
        countrySignals: [{ kind: "RESIDENCE", country: "IR" }],
      },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("BLOCK");
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.JURISDICTION_RESTRICTED,
      );
    }
  });

  it("reviews regional list countries without treating REVIEW as failure", () => {
    const outcome = evaluateCommercialEligibility({
      context: { organisationCountry: "BY" },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("REVIEW");
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.REGIONAL_RESTRICTION,
      );
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.POLICY_REVIEW_REQUIRED,
      );
    }
  });

  it("applies a Stripe overlay restriction that JipLabs v1 would otherwise allow", () => {
    const withoutOverlay = evaluateCommercialEligibility({
      context: { residenceCountry: "AF" },
      evaluatedAt: AT,
      overlays: [],
    });
    expect(withoutOverlay.ok).toBe(true);
    if (withoutOverlay.ok) {
      expect(withoutOverlay.result.decision).toBe("ALLOW");
    }

    const withOverlay = evaluateCommercialEligibility({
      context: {
        residenceCountry: "AF",
        paymentContext: { present: true, provider: "stripe" },
        billingCountry: "AF",
      },
      evaluatedAt: AT,
    });
    expect(withOverlay.ok).toBe(true);
    if (withOverlay.ok) {
      expect(withOverlay.result.decision).toBe("BLOCK");
      expect(withOverlay.result.reasonCodes).toContain(
        CommercialReasonCode.PROVIDER_RESTRICTION,
      );
      expect(withOverlay.result.contributingSources.some((s) => s.sourceKind === "OVERLAY")).toBe(
        true,
      );
      expect(STRIPE_OVERLAY_V1_RESTRICTED_COUNTRIES).toContain("AF");
    }
  });

  it("does not allow a Stripe overlay to relax a JipLabs restriction", () => {
    const outcome = evaluateCommercialEligibility({
      context: {
        residenceCountry: "CU",
        billingCountry: "CU",
        paymentContext: { present: true, provider: "stripe" },
      },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("BLOCK");
      expect(outcome.result.reasonCodes).toContain(
        CommercialReasonCode.JURISDICTION_RESTRICTED,
      );
      const overlay = outcome.result.contributingSources.find(
        (s) => s.sourceKind === "OVERLAY",
      );
      expect(overlay).toBeDefined();
      expect(overlay?.decision).toBe("ALLOW");
    }
  });

  it("replays historical v1 even when a later definition would block", () => {
    const context = { residenceCountry: "VN", contextRef: "acct-vn" };
    const v1First = evaluateCommercialEligibility({
      context,
      evaluatedAt: AT,
      policyVersion: "v1",
    });
    const v1Second = evaluateCommercialEligibility({
      context,
      evaluatedAt: AT,
      policyVersion: "v1",
    });
    expect(v1First.ok && v1Second.ok).toBe(true);
    if (v1First.ok && v1Second.ok) {
      expect(v1First.result.decision).toBe("ALLOW");
      expect(serializePolicyEvaluationResult(v1First.result)).toBe(
        serializePolicyEvaluationResult(v1Second.result),
      );
      expect(hashPolicyEvaluationResult(v1First.result)).toBe(
        hashPolicyEvaluationResult(v1Second.result),
      );
    }

    const v2Definition = {
      policyId: COMMERCIAL_JURISDICTION_V1.policyId,
      policyVersion: "v2",
      restrictedCountries: [...COMMERCIAL_JURISDICTION_V1.restrictedCountries, "VN"],
      reviewCountries: [...COMMERCIAL_JURISDICTION_V1.reviewCountries],
    };
    const v2 = evaluateCommercialJurisdiction(v2Definition, context, AT);
    expect(v2.decision).toBe("BLOCK");
    expect(v2.policyVersion).toBe("v2");
    if (v1First.ok) {
      expect(v1First.result.decision).toBe("ALLOW");
      expect(v1First.result.policyVersion).toBe("v1");
    }
  });

  it("fails closed on an unknown policy version instead of ALLOW", () => {
    const outcome = evaluateCommercialEligibility({
      context: { residenceCountry: "FR" },
      evaluatedAt: AT,
      policyVersion: "v9",
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("POLICY_VERSION_UNKNOWN");
    }
    expect(isEntitlementPermitted(outcome)).toBe(false);
  });

  it("fails closed on an unknown overlay instead of ALLOW", () => {
    const outcome = evaluateCommercialEligibility({
      context: { residenceCountry: "FR" },
      evaluatedAt: AT,
      overlays: ["wise"],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("PROVIDER_OVERLAY_UNKNOWN");
    }
    expect(isEntitlementPermitted(outcome)).toBe(false);
  });

  it("states the commercial entitlement invariant", () => {
    expect(COMMERCIAL_ENTITLEMENT_INVARIANT).toBe(
      "NO COMMERCIAL ENTITLEMENT WITHOUT COMMERCIAL_ELIGIBILITY = ALLOW",
    );
    const rule = createCommercialJurisdictionPolicyRule(COMMERCIAL_JURISDICTION_V1);
    expect(rule.policyVersion).toBe("v1");
    expect(rule.contentHash).toBe(COMMERCIAL_JURISDICTION_V1_CONTENT_HASH);
  });
});

describe("fail-closed enforcement", () => {
  it("does not treat REVIEW or evaluation failure as ALLOW", () => {
    const review = evaluateCommercialEligibility({
      context: {},
      evaluatedAt: AT,
    });
    expect(review.ok).toBe(true);
    expect(isEntitlementPermitted(review)).toBe(false);

    const failed = evaluateCommercialEligibility({
      context: { residenceCountry: "FR" },
      evaluatedAt: AT,
      policyVersion: "missing",
    });
    expect(failed.ok).toBe(false);
    expect(isEntitlementPermitted(failed)).toBe(false);
    if (!failed.ok) {
      expect(failed.code).not.toBe(GovernanceErrorCode.GATE_FAILED);
    }
  });
});
