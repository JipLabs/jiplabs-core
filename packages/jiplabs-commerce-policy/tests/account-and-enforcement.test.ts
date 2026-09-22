import { describe, expect, it } from "vitest";
import { GovernanceError, GovernanceErrorCode } from "@jiplabs/core";
import {
  ACCOUNT_COMMERCIAL_ELIGIBILITY_FOLLOW_UP,
  COMMERCIAL_ELIGIBILITY_EVALUATE_METHOD,
  COMMERCIAL_ELIGIBILITY_EVALUATE_PATH,
  COMMERCIAL_ELIGIBILITY_GATED_EVENTS,
  COMMERCIAL_ENTITLEMENT_INVARIANT,
  assertCommercialActionAllowed,
  evaluateCommercialEligibility,
  isCommercialActionAllowed,
  toAccountCommercialEligibilityResponse,
} from "../src/index.js";

const AT = "2026-09-21T16:00:00.000Z";

describe("Account integration contract", () => {
  it("defines the Account evaluate path without a second engine", () => {
    expect(COMMERCIAL_ELIGIBILITY_EVALUATE_METHOD).toBe("POST");
    expect(COMMERCIAL_ELIGIBILITY_EVALUATE_PATH).toBe(
      "/policy/evaluate/commercial-eligibility",
    );
    expect(ACCOUNT_COMMERCIAL_ELIGIBILITY_FOLLOW_UP).toContain(
      "evaluateCommercialEligibility",
    );
  });

  it("maps ALLOW, BLOCK, and REVIEW as ok:true governed HTTP bodies", () => {
    const allow = toAccountCommercialEligibilityResponse(
      evaluateCommercialEligibility({
        context: { residenceCountry: "US" },
        evaluatedAt: AT,
      }),
    );
    expect(allow.ok).toBe(true);
    if (allow.ok) {
      expect(allow.decision).toBe("ALLOW");
      expect(allow.policyId).toBe("commercial-jurisdiction");
      expect(allow.policyVersion).toBe("v1");
      expect(allow.evaluatedAt).toBe(AT);
    }

    const block = toAccountCommercialEligibilityResponse(
      evaluateCommercialEligibility({
        context: { residenceCountry: "KP" },
        evaluatedAt: AT,
      }),
    );
    expect(block.ok).toBe(true);
    if (block.ok) expect(block.decision).toBe("BLOCK");

    const review = toAccountCommercialEligibilityResponse(
      evaluateCommercialEligibility({
        context: {},
        evaluatedAt: AT,
      }),
    );
    expect(review.ok).toBe(true);
    if (review.ok) expect(review.decision).toBe("REVIEW");
  });

  it("maps operational evaluation failure to decision:null, never ALLOW", () => {
    const failed = toAccountCommercialEligibilityResponse(
      evaluateCommercialEligibility({
        context: { residenceCountry: "US" },
        evaluatedAt: AT,
        policyVersion: "v-missing",
      }),
    );
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.decision).toBeNull();
      expect(failed.code).toBe("POLICY_VERSION_UNKNOWN");
    }
  });
});

describe("product enforcement contract", () => {
  it("lists the commercial events that product backends must gate", () => {
    expect(COMMERCIAL_ELIGIBILITY_GATED_EVENTS).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("refuses commercial action unless eligibility is ALLOW", () => {
    expect(COMMERCIAL_ENTITLEMENT_INVARIANT).toContain("ALLOW");
    const allow = evaluateCommercialEligibility({
      context: { residenceCountry: "DE" },
      evaluatedAt: AT,
    });
    expect(isCommercialActionAllowed(allow)).toBe(true);
    expect(() =>
      assertCommercialActionAllowed({
        event: "INITIAL_SUBSCRIPTION",
        eligibility: allow,
      }),
    ).not.toThrow();

    const review = evaluateCommercialEligibility({
      context: {},
      evaluatedAt: AT,
    });
    expect(isCommercialActionAllowed(review)).toBe(false);
    expect(() =>
      assertCommercialActionAllowed({
        event: "ONE_OFF_PURCHASE",
        eligibility: review,
      }),
    ).toThrow(GovernanceError);

    expect(isCommercialActionAllowed(null)).toBe(false);
    try {
      assertCommercialActionAllowed({
        event: "ENTITLEMENT_REACTIVATION",
        eligibility: null,
      });
      expect.unreachable("missing evaluation must not pass the gate");
    } catch (err) {
      expect(err).toBeInstanceOf(GovernanceError);
      expect((err as GovernanceError).code).toBe(
        GovernanceErrorCode.ENTITLEMENT_NOT_PERMITTED,
      );
    }
  });
});
