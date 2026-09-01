/**
 * CORE-AUDITOR-02 — stable Auditor conformance (public contract).
 */
import { describe, expect, it } from "vitest";
import {
  buildAuditGovernedStateView,
  buildAuditSeveritySummary,
  createAuditEngagement,
  createAuditFinding,
  createAuditFindingResolution,
  createAuditScope,
  createAuditTarget,
  getEffectiveFindingStatus,
  isCoreStable1_1AuditorExport,
  runAuditEngagement,
  InMemoryAuditArtifactStore,
  type AuditRuleEvaluator,
} from "../src/index.js";

const AT = "2026-09-01T22:00:00.000Z";
const PROVENANCE = { actorId: "stable-auditor-test", source: "auditor-stable-conformance" };

describe("Auditor stable 1.1 conformance", () => {
  it("stable auditor exports are classified STABLE_1_1", () => {
    expect(isCoreStable1_1AuditorExport("runAuditEngagement")).toBe(true);
    expect(isCoreStable1_1AuditorExport("AuditFinding")).toBe(true);
    expect(isCoreStable1_1AuditorExport("EvaluationCorpus")).toBe(false);
  });

  it("clean engagement produces zero findings", async () => {
    const scope = createAuditScope({
      id: "scope-clean",
      kind: "SUBJECT",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const target = createAuditTarget({
      id: "target-clean",
      subject: { type: "subject", id: "sub-1", domain: "test" },
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const engagement = createAuditEngagement({
      id: "eng-clean",
      scopeId: scope.id,
      targetId: target.id,
      auditorActorId: "auditor",
      status: "IN_PROGRESS",
      initiatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const stateView = buildAuditGovernedStateView({
      evaluatedAt: AT,
      metadata: { clean: true },
    });
    const passEvaluator: AuditRuleEvaluator = {
      ruleId: "always-pass",
      deterministic: true,
      evaluate: () => ({ passed: true }),
    };
    const result = await runAuditEngagement({
      engagement,
      scope,
      target,
      stateView,
      evaluators: [passEvaluator],
      provenance: PROVENANCE,
      at: AT,
    });
    expect(result.findings).toHaveLength(0);
    expect(result.report.severitySummary.total).toBe(0);
  });

  it("deterministic evaluator produces stable fingerprint on repeat", async () => {
    const scope = createAuditScope({
      id: "scope-det",
      kind: "SUBJECT",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const target = createAuditTarget({
      id: "target-det",
      subject: { type: "subject", id: "sub-2", domain: "test" },
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const engagement = createAuditEngagement({
      id: "eng-det",
      scopeId: scope.id,
      targetId: target.id,
      auditorActorId: "auditor",
      status: "IN_PROGRESS",
      initiatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const stateView = buildAuditGovernedStateView({ evaluatedAt: AT });
    const evaluator: AuditRuleEvaluator = {
      ruleId: "det-rule",
      version: "1.0.0",
      deterministic: true,
      evaluate: () => ({
        passed: false,
        findings: [
          {
            code: "TEST_GAP",
            classification: "EVIDENCE_GAP",
            title: "t",
            description: "d",
            severity: "HIGH",
            justification: "j",
          },
        ],
      }),
    };
    const first = await runAuditEngagement({
      engagement,
      scope,
      target,
      stateView,
      evaluators: [evaluator],
      provenance: PROVENANCE,
      at: AT,
      deduplicateByFingerprint: true,
    });
    const second = await runAuditEngagement({
      engagement,
      scope,
      target,
      stateView,
      evaluators: [evaluator],
      provenance: PROVENANCE,
      at: AT,
      deduplicateByFingerprint: true,
    });
    expect(first.findings[0]?.fingerprint).toBe(second.findings[0]?.fingerprint);
  });

  it("resolution preserves finding history", () => {
    const finding = createAuditFinding({
      id: "f-hist",
      engagementId: "eng-hist",
      targetId: "t",
      scopeId: "s",
      ruleId: "r",
      code: "C",
      classification: "EVIDENCE_GAP",
      title: "t",
      description: "d",
      severity: "LOW",
      status: "OPEN",
      justification: "j",
      evaluatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const resolution = createAuditFindingResolution({
      id: "res-hist",
      findingId: finding.id,
      engagementId: "eng-hist",
      fromStatus: "OPEN",
      toStatus: "RESOLVED",
      resolvedByActorId: "human",
      resolvedAt: AT,
      rationale: "ok",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    expect(getEffectiveFindingStatus(finding, [resolution])).toBe("RESOLVED");
    expect(finding.fingerprint).toBeTruthy();
    expect(finding.status).toBe("OPEN");
  });

  it("InMemoryAuditArtifactStore satisfies persistence contract", () => {
    const store = new InMemoryAuditArtifactStore();
    const finding = createAuditFinding({
      id: "f-store",
      engagementId: "eng-store",
      targetId: "t",
      scopeId: "s",
      ruleId: "r",
      code: "C",
      classification: "ADVISORY",
      title: "t",
      description: "d",
      severity: "INFORMATIONAL",
      status: "OPEN",
      justification: "j",
      evaluatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    store.saveFinding(finding);
    expect(store.getFinding(finding.id)?.fingerprint).toBe(finding.fingerprint);
    expect(store.listFindings({ fingerprint: finding.fingerprint }).length).toBe(1);
  });

  it("severity summary counts unresolved findings", () => {
    const open = createAuditFinding({
      id: "f-open",
      engagementId: "e",
      targetId: "t",
      scopeId: "s",
      ruleId: "r",
      code: "C",
      classification: "POLICY_VIOLATION",
      title: "t",
      description: "d",
      severity: "CRITICAL",
      status: "OPEN",
      justification: "j",
      evaluatedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const summary = buildAuditSeveritySummary([open]);
    expect(summary.critical).toBe(1);
    expect(summary.unresolved).toBe(1);
  });
});
