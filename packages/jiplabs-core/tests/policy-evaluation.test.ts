import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GovernanceError,
  GovernanceErrorCode,
  POLICY_DECISIONS,
  POLICY_EVALUATION_CONTRACT_VERSION,
  assertEntitlementPermitted,
  composePolicyDecisions,
  createPolicyEvaluationResult,
  evaluatePolicy,
  hashPolicyEvaluationResult,
  isEntitlementPermitted,
  isPolicyAllow,
  isPolicyDecision,
  moreRestrictivePolicyDecision,
  parsePolicyEvaluationResult,
  serializePolicyEvaluationResult,
  type PolicyEvaluationOutcome,
  type PolicyEvaluationResult,
  type PolicyRule,
} from "../src/index.js";

const AT = "2026-09-21T16:00:00.000Z";
const HASH = "policy-content-hash-test";

function result(
  decision: PolicyEvaluationResult["decision"],
  extra: Partial<Parameters<typeof createPolicyEvaluationResult>[0]> = {},
): PolicyEvaluationResult {
  return createPolicyEvaluationResult({
    decision,
    policyId: extra.policyId ?? "example-policy",
    policyVersion: extra.policyVersion ?? "v1",
    policyContentHash: extra.policyContentHash ?? HASH,
    evaluatedAt: extra.evaluatedAt ?? AT,
    reasonCodes: extra.reasonCodes ?? [],
    evidenceRefs: extra.evidenceRefs ?? [],
    subject: extra.subject,
    contextRef: extra.contextRef,
    consideredSignalKinds: extra.consideredSignalKinds,
    contributingSources: extra.contributingSources,
  });
}

describe("Core policy evaluation contract", () => {
  it("supports ALLOW, BLOCK, and REVIEW", () => {
    expect(POLICY_DECISIONS).toEqual(["ALLOW", "BLOCK", "REVIEW"]);
    expect(isPolicyDecision("ALLOW")).toBe(true);
    expect(isPolicyDecision("BLOCK")).toBe(true);
    expect(isPolicyDecision("REVIEW")).toBe(true);
    expect(isPolicyDecision("PASS")).toBe(false);
  });

  it("requires policy identity, version, content hash, and evaluation time", () => {
    expect(() =>
      createPolicyEvaluationResult({
        decision: "ALLOW",
        policyId: "",
        policyVersion: "v1",
        policyContentHash: HASH,
        evaluatedAt: AT,
      }),
    ).toThrow(GovernanceError);
    expect(() =>
      createPolicyEvaluationResult({
        decision: "ALLOW",
        policyId: "p",
        policyVersion: "",
        policyContentHash: HASH,
        evaluatedAt: AT,
      }),
    ).toThrow(GovernanceError);
    expect(() =>
      createPolicyEvaluationResult({
        decision: "ALLOW",
        policyId: "p",
        policyVersion: "v1",
        policyContentHash: "",
        evaluatedAt: AT,
      }),
    ).toThrow(GovernanceError);
    expect(() =>
      createPolicyEvaluationResult({
        decision: "ALLOW",
        policyId: "p",
        policyVersion: "v1",
        policyContentHash: HASH,
        evaluatedAt: "not-a-timestamp",
      }),
    ).toThrow(GovernanceError);
  });

  it.each(["ALLOW", "BLOCK", "REVIEW"] as const)(
    "serializes %s deterministically",
    (decision) => {
      const created = result(decision, {
        reasonCodes: ["REASON_A", "REASON_B"],
        evidenceRefs: ["ev-1", "ev-2"],
        subject: { type: "account", id: "acct-1" },
        contextRef: "ctx-1",
        consideredSignalKinds: ["ALPHA"],
        contributingSources: [
          {
            sourceKind: "POLICY",
            sourceId: "example-policy",
            sourceVersion: "v1",
            sourceContentHash: HASH,
            decision,
            reasonCodes: ["REASON_A"],
          },
        ],
      });
      const first = serializePolicyEvaluationResult(created);
      const second = serializePolicyEvaluationResult(created);
      expect(first).toBe(second);
      expect(first).toContain(`"decision":"${decision}"`);
      expect(created.contractVersion).toBe(POLICY_EVALUATION_CONTRACT_VERSION);
      expect(created.policyVersion).toBe("v1");
      expect(created.evaluatedAt).toBe(AT);

      const parsed = parsePolicyEvaluationResult(first);
      expect(parsed.decision).toBe(decision);
      expect(parsed.reasonCodes).toEqual(["REASON_A", "REASON_B"]);
      expect(parsed.evidenceRefs).toEqual(["ev-1", "ev-2"]);
      expect(parsed.subject).toEqual({ type: "account", id: "acct-1" });
      expect(serializePolicyEvaluationResult(parsed)).toBe(first);
      expect(hashPolicyEvaluationResult(parsed)).toBe(
        hashPolicyEvaluationResult(created),
      );
    },
  );

  it("preserves reason codes and evidence refs through serialization", () => {
    const created = result("BLOCK", {
      reasonCodes: ["JURISDICTION_RESTRICTED"],
      evidenceRefs: ["evidence-country-residence"],
    });
    const parsed = parsePolicyEvaluationResult(
      serializePolicyEvaluationResult(created),
    );
    expect(parsed.reasonCodes).toEqual(["JURISDICTION_RESTRICTED"]);
    expect(parsed.evidenceRefs).toEqual(["evidence-country-residence"]);
  });

  it("does not let a later in-memory rewrite change a serialized historical result", () => {
    const historical = result("ALLOW", { policyVersion: "v1" });
    const serialized = serializePolicyEvaluationResult(historical);
    const mutated = result("BLOCK", {
      policyVersion: "v2",
      reasonCodes: ["NEW_RESTRICTION"],
    });
    expect(serializePolicyEvaluationResult(mutated)).not.toBe(serialized);
    expect(parsePolicyEvaluationResult(serialized).decision).toBe("ALLOW");
    expect(parsePolicyEvaluationResult(serialized).policyVersion).toBe("v1");
  });

  it("evaluatePolicy returns REVIEW as a successful governed result", () => {
    const policy: PolicyRule<{ flag: string }> = {
      policyId: "example-policy",
      policyVersion: "v1",
      contentHash: HASH,
      evaluate: ({ evaluatedAt }) =>
        result("REVIEW", {
          evaluatedAt,
          reasonCodes: ["POLICY_REVIEW_REQUIRED"],
        }),
    };
    const outcome = evaluatePolicy({
      policy,
      context: { flag: "x" },
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.decision).toBe("REVIEW");
    }
    expect(isEntitlementPermitted(outcome)).toBe(false);
  });

  it("evaluatePolicy maps thrown errors to operational failure, not ALLOW or REVIEW", () => {
    const policy: PolicyRule<unknown> = {
      policyId: "example-policy",
      policyVersion: "v1",
      contentHash: HASH,
      evaluate: () => {
        throw new Error("timeout talking to store");
      },
    };
    const outcome = evaluatePolicy({
      policy,
      context: {},
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe(GovernanceErrorCode.POLICY_EVALUATION_FAILED);
      expect(outcome.message).toContain("timeout");
    }
    expect(isPolicyAllow(outcome)).toBe(false);
    expect(isEntitlementPermitted(outcome)).toBe(false);
  });

  it("evaluatePolicy rejects a result that reports a different policy identity", () => {
    const policy: PolicyRule<unknown> = {
      policyId: "example-policy",
      policyVersion: "v1",
      contentHash: HASH,
      evaluate: () => result("ALLOW", { policyId: "other-policy" }),
    };
    const outcome = evaluatePolicy({
      policy,
      context: {},
      evaluatedAt: AT,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe(GovernanceErrorCode.INVALID_VALUE);
    }
  });

  it("overlays cannot relax a base BLOCK or REVIEW to ALLOW", () => {
    expect(moreRestrictivePolicyDecision("BLOCK", "ALLOW")).toBe("BLOCK");
    expect(moreRestrictivePolicyDecision("REVIEW", "ALLOW")).toBe("REVIEW");
    expect(moreRestrictivePolicyDecision("ALLOW", "BLOCK")).toBe("BLOCK");

    const blocked = composePolicyDecisions({
      base: result("BLOCK", { reasonCodes: ["BASE_BLOCK"] }),
      overlays: [result("ALLOW", { policyId: "overlay", reasonCodes: [] })],
    });
    expect(blocked.decision).toBe("BLOCK");
    expect(blocked.reasonCodes).toEqual(["BASE_BLOCK"]);
    expect(blocked.contributingSources.map((s) => s.sourceKind)).toEqual([
      "POLICY",
      "OVERLAY",
    ]);

    const reviewed = composePolicyDecisions({
      base: result("REVIEW", { reasonCodes: ["BASE_REVIEW"] }),
      overlays: [result("ALLOW", { policyId: "overlay" })],
    });
    expect(reviewed.decision).toBe("REVIEW");
  });

  it("overlays may further restrict ALLOW to BLOCK and preserve provenance", () => {
    const composed = composePolicyDecisions({
      base: result("ALLOW"),
      overlays: [
        result("BLOCK", {
          policyId: "provider-overlay",
          policyVersion: "v1",
          reasonCodes: ["PROVIDER_RESTRICTION"],
        }),
      ],
    });
    expect(composed.decision).toBe("BLOCK");
    expect(composed.policyId).toBe("example-policy");
    expect(composed.reasonCodes).toContain("PROVIDER_RESTRICTION");
    expect(composed.contributingSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: "OVERLAY",
          sourceId: "provider-overlay",
          decision: "BLOCK",
        }),
      ]),
    );
  });

  it("fail-closed: missing, failed, BLOCK, and REVIEW are not entitlement", () => {
    expect(isEntitlementPermitted(undefined)).toBe(false);
    expect(isEntitlementPermitted(null)).toBe(false);
    expect(isEntitlementPermitted(result("BLOCK"))).toBe(false);
    expect(isEntitlementPermitted(result("REVIEW"))).toBe(false);
    expect(isEntitlementPermitted(result("ALLOW"))).toBe(true);

    const failed: PolicyEvaluationOutcome = {
      ok: false,
      code: "TIMEOUT",
      message: "timeout",
      evaluatedAt: AT,
    };
    expect(isEntitlementPermitted(failed)).toBe(false);
    expect(() => assertEntitlementPermitted(failed)).toThrowError(
      expect.objectContaining({
        code: GovernanceErrorCode.ENTITLEMENT_NOT_PERMITTED,
      }),
    );
    expect(() => assertEntitlementPermitted(result("ALLOW"))).not.toThrow();
  });
});

describe("Core domain-agnostic dependency and country-list boundary", () => {
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (full.endsWith(".ts")) out.push(full);
    }
    return out;
  }

  it("does not import commerce-policy, Account, or product packages", () => {
    const forbidden = [
      "@jiplabs/commerce-policy",
      "jiplabs-account",
      "quinte-lab",
      "jipcomply",
      "jipoffice",
      "jipcontract",
    ];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const needle of forbidden) {
        expect(text, file).not.toContain(needle);
      }
    }
  });

  it("does not embed commercial country restriction lists", () => {
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\b(Russia|Cuba|Iran)\b/);
      expect(text, file).not.toContain("restrictedCountries");
    }
  });
});
