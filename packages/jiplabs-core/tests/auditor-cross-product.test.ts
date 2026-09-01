import { describe, expect, it } from "vitest";
import {
  buildAuditGovernedStateView,
  buildAuditGovernedStateViewFromTraceInput,
  buildAuditReportSummary,
  buildAuditSeveritySummary,
  compareFindingStatuses,
  computeAuditFindingFingerprint,
  computeAuditStateFingerprint,
  createAuditEngagement,
  createAuditFinding,
  createAuditFindingResolution,
  createAuditScope,
  createAuditTarget,
  getEffectiveFindingStatus,
  isEvaluationCandidateFromFinding,
  isFindingUnresolved,
  runAuditEngagement,
  InMemoryAuditArtifactStore,
  type AuditRuleEvaluator,
} from "../src/experimental.js";
import {
  jipComplyAuditRules,
  quinteLabAuditRules,
  researchEngineAuditRules,
  tradingBotAuditRules,
} from "./fixtures/audit-cross-product-rules.js";
import { createProprietaryAnomalyEvaluator } from "./fixtures/proprietary-audit-evaluator.js";
import {
  buildTestDecisionTrace,
  minimalTraceInput,
  sparseEvidence,
} from "./helpers/audit-trace-harness.js";
import { AT, PROVENANCE } from "./helpers/governor-harness.js";

const AUDIT_PROVENANCE = { actorId: "auditor", source: "auditor-cross-product-test" };

function auditSetup(traceOverrides: Parameters<typeof buildTestDecisionTrace>[0] = {}) {
  const traceInput = minimalTraceInput(traceOverrides);
  const trace = buildTestDecisionTrace(traceOverrides);
  const stateView = buildAuditGovernedStateViewFromTraceInput(traceInput);
  const scope = createAuditScope({
    id: "scope-x",
    kind: "DECISION",
    targetRef: { id: trace.decisionId, type: "decision" },
    createdAt: AT,
    provenance: AUDIT_PROVENANCE,
  });
  const target = createAuditTarget({
    id: "target-x",
    subject: { type: "governance-run", id: "run-x", domain: "test-domain" },
    createdAt: AT,
    provenance: AUDIT_PROVENANCE,
  });
  const engagement = createAuditEngagement({
    id: "eng-x",
    scopeId: scope.id,
    targetId: target.id,
    auditorActorId: "auditor",
    status: "IN_PROGRESS",
    initiatedAt: AT,
    createdAt: AT,
    provenance: AUDIT_PROVENANCE,
  });
  return { trace, traceInput, stateView, scope, target, engagement };
}

describe("CORE-AUDITOR-01 cross-product auditor primitive", () => {
  describe("generic behavior", () => {
    it("produces zero findings when all rules pass", async () => {
      const { engagement, scope, target, stateView } = auditSetup();
      const passRule: AuditRuleEvaluator = {
        ruleId: "always-pass",
        evaluate: () => ({ passed: true }),
      };
      const result = await runAuditEngagement({
        engagement,
        scope,
        target,
        stateView,
        evaluators: [passRule],
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      expect(result.findings).toHaveLength(0);
      expect(result.report.severitySummary.total).toBe(0);
    });

    it("aggregates multiple findings and severities in report", async () => {
      const { engagement, scope, target, stateView } = auditSetup();
      const rules: AuditRuleEvaluator[] = [
        {
          ruleId: "f1",
          evaluate: () => ({
            passed: false,
            findings: [
              {
                code: "A",
                classification: "OTHER",
                title: "a",
                description: "a",
                severity: "HIGH",
                justification: "a",
              },
              {
                code: "B",
                classification: "OTHER",
                title: "b",
                description: "b",
                severity: "LOW",
                justification: "b",
              },
            ],
          }),
        },
      ];
      const result = await runAuditEngagement({
        engagement,
        scope,
        target,
        stateView,
        evaluators: rules,
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      expect(result.findings).toHaveLength(2);
      expect(result.report.severitySummary.high).toBe(1);
      expect(result.report.severitySummary.low).toBe(1);
      expect(buildAuditReportSummary(result.findings)).toContain("2 finding");
    });

    it("deduplicates findings by fingerprint on repeated runs", async () => {
      const { engagement, scope, target, stateView } = auditSetup();
      const rule: AuditRuleEvaluator = {
        ruleId: "dup",
        version: "1.0.0",
        deterministic: true,
        evaluate: () => ({
          passed: false,
          findings: [
            {
              code: "DUP",
              classification: "OTHER",
              title: "dup",
              description: "dup",
              severity: "MEDIUM",
              justification: "dup",
            },
          ],
        }),
      };
      const first = await runAuditEngagement({
        engagement,
        scope,
        target,
        stateView,
        evaluators: [rule, rule],
        provenance: AUDIT_PROVENANCE,
        at: AT,
        deduplicateByFingerprint: true,
      });
      expect(first.findings).toHaveLength(1);
      const second = await runAuditEngagement({
        engagement,
        scope,
        target,
        stateView,
        evaluators: [rule],
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      expect(second.findings[0]!.fingerprint).toBe(first.findings[0]!.fingerprint);
    });

    it("changes fingerprint when state or evaluator version changes", async () => {
      const base = auditSetup();
      const ruleV1: AuditRuleEvaluator = {
        ruleId: "ver",
        version: "1.0.0",
        evaluate: () => ({
          passed: false,
          findings: [
            {
              code: "V",
              classification: "OTHER",
              title: "v",
              description: "v",
              severity: "LOW",
              justification: "v",
            },
          ],
        }),
      };
      const ruleV2: AuditRuleEvaluator = { ...ruleV1, version: "2.0.0" };
      const r1 = await runAuditEngagement({
        engagement: base.engagement,
        scope: base.scope,
        target: base.target,
        stateView: base.stateView,
        evaluators: [ruleV1],
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      const r2 = await runAuditEngagement({
        engagement: base.engagement,
        scope: base.scope,
        target: base.target,
        stateView: base.stateView,
        evaluators: [ruleV2],
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      expect(r1.findings[0]!.fingerprint).not.toBe(r2.findings[0]!.fingerprint);
    });
  });

  describe("governance integration", () => {
    it("builds state view from trace with governance refs", () => {
      const trace = buildTestDecisionTrace({
        withExecution: true,
        withEvaluation: true,
      });
      const view = buildAuditGovernedStateView({ trace, evaluatedAt: AT });
      expect(view.decisionIds).toContain(trace.decisionId);
      expect(view.evidenceIds.length).toBeGreaterThan(0);
      expect(view.executionRefs.length).toBeGreaterThan(0);
      expect(view.evaluationIds.length).toBe(1);
      expect(view.stateFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(computeAuditStateFingerprint(view)).toBe(view.stateFingerprint);
    });

    it("finding carries explicit governance reference fields", () => {
      const finding = createAuditFinding({
        id: "f-gov",
        engagementId: "eng",
        targetId: "tgt",
        scopeId: "scp",
        ruleId: "rule",
        code: "GOV",
        classification: "AUTHORITY_VIOLATION",
        title: "t",
        description: "d",
        severity: "HIGH",
        status: "OPEN",
        justification: "j",
        evaluatedAt: AT,
        evidenceRefs: ["ev-1"],
        policyRefs: [{ refType: "POLICY", id: "pol-1" }],
        authorityRefs: [{ refType: "AUTHORITY_GRANT", id: "grant-1" }],
        decisionRefs: ["dec-1"],
        executionRefs: ["auth-1"],
        outcomeRefs: ["out-1"],
        evaluationRefs: ["eval-1"],
        createdAt: AT,
        provenance: AUDIT_PROVENANCE,
      });
      expect(finding.policyRefs[0]?.refType).toBe("POLICY");
      expect(finding.authorityRefs[0]?.refType).toBe("AUTHORITY_GRANT");
      expect(computeAuditFindingFingerprint(finding)).toBe(finding.fingerprint);
    });
  });

  describe("history and resolution", () => {
    it("preserves original finding while resolution changes effective status", () => {
      const finding = createAuditFinding({
        id: "f-hist",
        engagementId: "eng",
        targetId: "tgt",
        scopeId: "scp",
        ruleId: "rule",
        code: "H",
        classification: "OTHER",
        title: "t",
        description: "d",
        severity: "LOW",
        status: "OPEN",
        justification: "j",
        evaluatedAt: AT,
        createdAt: AT,
        provenance: AUDIT_PROVENANCE,
      });
      const resolution = createAuditFindingResolution({
        id: "res-1",
        findingId: finding.id,
        engagementId: "eng",
        fromStatus: "OPEN",
        toStatus: "RESOLVED",
        resolvedByActorId: "human-1",
        resolvedAt: AT,
        rationale: "fixed",
        createdAt: AT,
        provenance: AUDIT_PROVENANCE,
      });
      expect(finding.status).toBe("OPEN");
      expect(getEffectiveFindingStatus(finding, [resolution])).toBe("RESOLVED");
      expect(isFindingUnresolved(finding, [resolution])).toBe(false);
      const statuses = compareFindingStatuses([finding], [resolution]);
      expect(statuses[0]?.effective).toBe("RESOLVED");
    });

    it("later policy version does not rewrite historical audit fingerprint", async () => {
      const setup = auditSetup();
      const rule: AuditRuleEvaluator = {
        ruleId: "policy-version-sensitive",
        version: "1.0.0",
        deterministic: true,
        evaluate: (input) => ({
          passed: false,
          findings: [
            {
              code: "PV",
              classification: "TEMPORAL_VIOLATION",
              title: "pv",
              description: "pv",
              severity: "MEDIUM",
              justification: input.stateView.policyVersions.join(","),
            },
          ],
        }),
      };
      const historical = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: setup.stateView,
        evaluators: [rule],
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      const alteredView = buildAuditGovernedStateView({
        trace: {
          ...setup.trace,
          policyVersion: "9.9.9",
        },
        evaluatedAt: AT,
      });
      const later = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: alteredView,
        evaluators: [rule],
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      expect(historical.findings[0]!.fingerprint).not.toBe(
        later.findings[0]!.fingerprint,
      );
      expect(historical.findings[0]!.justification).not.toBe(
        later.findings[0]!.justification,
      );
    });
  });

  describe("cross-product fixtures", () => {
    it("Quinté Lab pattern: evidence gap and market blindness", async () => {
      const setup = auditSetup();
      const evidenceGap = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: setup.stateView,
        evaluators: quinteLabAuditRules,
        provenance: AUDIT_PROVENANCE,
        at: AT,
        context: { requiredEvidenceCount: 5 },
      });
      expect(
        evidenceGap.findings.some((f) => f.code === "DECISION_TIME_EVIDENCE_GAP"),
      ).toBe(true);

      const marketBlind = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: setup.stateView,
        evaluators: quinteLabAuditRules,
        provenance: AUDIT_PROVENANCE,
        at: AT,
        context: { requiresMarketBlindness: true, marketDataPresent: true },
      });
      expect(
        marketBlind.findings.some((f) => f.code === "MARKET_BLINDNESS_VIOLATION"),
      ).toBe(true);
    });

    it("Research Engine pattern: KILL without evidence", async () => {
      const setup = auditSetup({ evidence: [] });
      const result = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: setup.stateView,
        evaluators: researchEngineAuditRules,
        provenance: AUDIT_PROVENANCE,
        at: AT,
        context: { hypothesisDisposition: "KILL" },
      });
      expect(result.findings.some((f) => f.code === "KILL_WITHOUT_EVIDENCE")).toBe(
        true,
      );
    });

    it("Trading Bot pattern: execution without authorization ref in trace", async () => {
      const trace = buildTestDecisionTrace({ withExecution: true });
      const brokenTrace = { ...trace, authorizationId: undefined };
      const stateView = buildAuditGovernedStateView({
        trace: brokenTrace,
        evaluatedAt: AT,
      });
      const setup = auditSetup();
      const result = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView,
        evaluators: tradingBotAuditRules,
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      expect(
        result.findings.some((f) => f.code === "EXECUTION_WITHOUT_AUTHORIZATION"),
      ).toBe(true);
    });

    it("JipComply pattern: wrong temporal rule version", async () => {
      const setup = auditSetup();
      const result = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: setup.stateView,
        evaluators: jipComplyAuditRules,
        provenance: AUDIT_PROVENANCE,
        at: AT,
        context: { expectedPolicyVersion: "2.0.0" },
      });
      expect(result.findings.some((f) => f.code === "WRONG_RULE_VERSION")).toBe(
        true,
      );
    });
  });

  describe("open-core boundary", () => {
    it("MIT runner works without proprietary evaluators", async () => {
      const setup = auditSetup();
      const result = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: setup.stateView,
        evaluators: quinteLabAuditRules,
        provenance: AUDIT_PROVENANCE,
        at: AT,
      });
      expect(result.report.evaluatorRuleIds.length).toBeGreaterThan(0);
    });

    it("external proprietary evaluator consumes Core interfaces only", async () => {
      const setup = auditSetup();
      const proprietary = createProprietaryAnomalyEvaluator();
      const result = await runAuditEngagement({
        engagement: setup.engagement,
        scope: setup.scope,
        target: setup.target,
        stateView: setup.stateView,
        evaluators: [proprietary],
        provenance: AUDIT_PROVENANCE,
        at: AT,
        context: { anomalyScore: 0.95 },
      });
      expect(result.findings[0]?.code).toBe("PROPRIETARY_ANOMALY");
      expect(proprietary.deterministic).toBe(false);
    });

    it("Core package has no import path to proprietary test fixture", async () => {
      const coreAuditor = await import("../src/auditor/index.js");
      expect("createProprietaryAnomalyEvaluator" in coreAuditor).toBe(false);
    });
  });

  describe("evaluation bridge", () => {
    it("flags significant findings as evaluation candidates without auto-inserting", () => {
      const finding = createAuditFinding({
        id: "f-eval",
        engagementId: "eng",
        targetId: "tgt",
        scopeId: "scp",
        ruleId: "rule",
        code: "E",
        classification: "POLICY_VIOLATION",
        title: "t",
        description: "d",
        severity: "HIGH",
        status: "OPEN",
        justification: "j",
        evaluatedAt: AT,
        createdAt: AT,
        provenance: AUDIT_PROVENANCE,
      });
      expect(isEvaluationCandidateFromFinding(finding)).toBe(true);
      const info = createAuditFinding({
        ...finding,
        id: "f-info",
        severity: "INFORMATIONAL",
        classification: "ADVISORY",
      });
      expect(isEvaluationCandidateFromFinding(info)).toBe(false);
    });
  });

  describe("persistence interface", () => {
    it("stores engagements, findings, resolutions, and reports in memory", () => {
      const store = new InMemoryAuditArtifactStore();
      const setup = auditSetup();
      store.saveEngagement(setup.engagement);
      const finding = createAuditFinding({
        id: "f-store",
        engagementId: setup.engagement.id,
        targetId: setup.target.id,
        scopeId: setup.scope.id,
        ruleId: "rule",
        code: "S",
        classification: "OTHER",
        title: "t",
        description: "d",
        severity: "LOW",
        status: "OPEN",
        justification: "j",
        evaluatedAt: AT,
        createdAt: AT,
        provenance: AUDIT_PROVENANCE,
      });
      store.saveFinding(finding);
      expect(store.getEngagement(setup.engagement.id)?.id).toBe(setup.engagement.id);
      expect(store.listFindings({ engagementId: setup.engagement.id })).toHaveLength(1);
    });
  });

  describe("continuous audit compatibility", () => {
    it("supports incremental state views for snapshot vs continuous modes", () => {
      const trace1 = buildTestDecisionTrace({ decisionId: "dec-1" });
      const trace2 = buildTestDecisionTrace({ decisionId: "dec-2" });
      const snapshot = buildAuditGovernedStateView({ trace: trace1, evaluatedAt: AT });
      const continuous = buildAuditGovernedStateView({
        traces: [trace1, trace2],
        evaluatedAt: AT,
      });
      expect(snapshot.decisionIds).toHaveLength(1);
      expect(continuous.decisionIds).toHaveLength(2);
      expect(snapshot.stateFingerprint).not.toBe(continuous.stateFingerprint);
    });
  });
});
