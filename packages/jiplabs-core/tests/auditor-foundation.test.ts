import { describe, expect, it } from "vitest";
import {
  computeAuditFindingFingerprint,
  createAuditEngagement,
  createAuditFinding,
  createAuditReport,
  createAuditScope,
  createAuditTarget,
  type AuditRuleEvaluator,
} from "../src/experimental.js";

const AT = "2026-01-15T12:00:00.000Z";
const PROVENANCE = { actorId: "auditor-actor", source: "auditor-foundation-test" };

describe("Auditor foundation (CORE-IP-01)", () => {
  it("creates scope, target, engagement, finding, and report with governance refs", () => {
    const scope = createAuditScope({
      id: "scope-1",
      kind: "DECISION",
      targetRef: { id: "dec-1", type: "decision" },
      description: "Decision audit scope",
      createdAt: AT,
      provenance: PROVENANCE,
    });

    const target = createAuditTarget({
      id: "target-1",
      subject: { type: "governance-run", id: "run-1", domain: "test-domain" },
      description: "Governed run under audit",
      createdAt: AT,
      provenance: PROVENANCE,
    });

    const engagement = createAuditEngagement({
      id: "eng-1",
      scopeId: scope.id,
      targetId: target.id,
      auditorActorId: "auditor-actor",
      status: "IN_PROGRESS",
      initiatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });

    const finding = createAuditFinding({
      id: "finding-1",
      engagementId: engagement.id,
      targetId: target.id,
      scopeId: scope.id,
      ruleId: "authority-gap-rule",
      code: "AUTHORITY_GAP",
      classification: "AUTHORITY_VIOLATION",
      title: "Authority grant missing at decision time",
      description: "Decision recorded without matching authority grant hash.",
      severity: "HIGH",
      status: "OPEN",
      justification: "governanceSnapshot.authorityGrantContentHash mismatch",
      evaluatedAt: AT,
      evidenceRefs: ["ev-1"],
      policyRefs: [{ refType: "POLICY", id: "pol-1" }],
      authorityRefs: [{ refType: "AUTHORITY_GRANT", id: "grant-1" }],
      decisionRefs: ["dec-1"],
      executionRefs: ["auth-1"],
      outcomeRefs: ["out-1"],
      evaluationRefs: ["eval-1"],
      remediation: { action: "revoke-and-reauthorize", responsibleActorId: "ops-1" },
      advisory: { recommendation: "Replay decision with current evidence" },
      createdAt: AT,
      provenance: PROVENANCE,
    });

    const report = createAuditReport({
      id: "report-1",
      engagementId: engagement.id,
      scopeId: scope.id,
      targetId: target.id,
      auditorActorId: "auditor-actor",
      status: "FINAL",
      findingIds: [finding.id],
      evaluatorRuleIds: ["authority-gap-rule"],
      severitySummary: {
        critical: 0,
        high: 1,
        medium: 0,
        low: 0,
        informational: 0,
        total: 1,
        unresolved: 1,
      },
      summary: "One high-severity authority gap",
      conclusion: "Remediation required before re-execution",
      completedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });

    expect(scope.kind).toBe("DECISION");
    expect(target.subject.domain).toBe("test-domain");
    expect(engagement.status).toBe("IN_PROGRESS");
    expect(finding.severity).toBe("HIGH");
    expect(finding.policyRefs[0]?.refType).toBe("POLICY");
    expect(report.findingIds).toEqual(["finding-1"]);
    expect(computeAuditFindingFingerprint(finding)).toBe(finding.fingerprint);
  });

  it("supports domain audit rule evaluators without encoding domain semantics", () => {
    const scope = createAuditScope({
      id: "scope-2",
      kind: "SUBJECT",
      subject: { type: "resource", id: "res-1" },
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const target = createAuditTarget({
      id: "target-2",
      subject: { type: "resource", id: "res-1" },
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const engagement = createAuditEngagement({
      id: "eng-2",
      scopeId: scope.id,
      targetId: target.id,
      auditorActorId: "auditor-actor",
      status: "PLANNED",
      initiatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });

    const rule: AuditRuleEvaluator = {
      ruleId: "generic-integrity",
      evaluate: () => ({ passed: true, rationale: "no violations" }),
    };

    const result = rule.evaluate({
      engagement,
      scope,
      target,
      stateView: {
        decisionIds: [],
        policyIds: [],
        policyVersions: [],
        evidenceIds: [],
        authorityRefs: [],
        executionRefs: [],
        outcomeIds: [],
        evaluationIds: [],
        rollbackRefs: [],
        overrideIds: [],
        ledgerEventIds: [],
        traces: [],
        evaluatedAt: AT,
        stateFingerprint: "abc",
      },
    });
    expect(result.passed).toBe(true);
  });

  it("is exported from the stable root barrel (1.1.0)", async () => {
    const stable = await import("../src/index.js");
    expect("createAuditFinding" in stable).toBe(true);
    expect("createAuditScope" in stable).toBe(true);
    expect("runAuditEngagement" in stable).toBe(true);
  });
});
