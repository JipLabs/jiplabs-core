import type { IsoTimestamp, Provenance } from "../schema.js";
import { computeAuditFindingFingerprint } from "./fingerprints.js";
import type { AuditRuleEvaluator } from "./contracts.js";
import { createAuditFinding, createAuditReport } from "./factories.js";
import { buildAuditReportSummary, buildAuditSeveritySummary } from "./report.js";
import type {
  AuditEngagement,
  AuditFinding,
  AuditReport,
  AuditScope,
  AuditTarget,
} from "./types.js";
import type { AuditGovernedStateView } from "./view.js";

export type AuditorRunnerInput = {
  readonly engagement: AuditEngagement;
  readonly scope: AuditScope;
  readonly target: AuditTarget;
  readonly stateView: AuditGovernedStateView;
  readonly evaluators: readonly AuditRuleEvaluator[];
  readonly provenance: Provenance;
  readonly at: IsoTimestamp;
  readonly context?: import("../schema.js").JsonSafeMetadata;
  readonly deduplicateByFingerprint?: boolean;
  readonly findingIdPrefix?: string;
  readonly reportId?: string;
};

export type AuditorRunnerResult = {
  readonly findings: readonly AuditFinding[];
  readonly skippedEvaluators: readonly { readonly ruleId: string; readonly reason: string }[];
  readonly report: AuditReport;
};

/**
 * Runs audit evaluators against a governed state view.
 *
 * The Auditor observes, reconstructs, and evaluates — it does NOT mutate
 * governed system state, authority, evidence, or ledger records.
 */
export async function runAuditEngagement(
  input: AuditorRunnerInput,
): Promise<AuditorRunnerResult> {
  const findings: AuditFinding[] = [];
  const skippedEvaluators: { ruleId: string; reason: string }[] = [];
  const seenFingerprints = new Set<string>();
  const evaluatorVersions: { ruleId: string; version?: string }[] = [];
  const evaluatorRuleIds: string[] = [];

  const trace = input.stateView.traces[0];

  for (const evaluator of input.evaluators) {
    evaluatorRuleIds.push(evaluator.ruleId);
    evaluatorVersions.push({ ruleId: evaluator.ruleId, version: evaluator.version });

    const evalInput = {
      engagement: input.engagement,
      scope: input.scope,
      target: input.target,
      stateView: input.stateView,
      trace,
      context: {
        ...(input.stateView.metadata ?? {}),
        ...(input.context ?? {}),
      },
    };

    if (evaluator.appliesTo && !evaluator.appliesTo(evalInput)) {
      skippedEvaluators.push({
        ruleId: evaluator.ruleId,
        reason: "evaluator does not apply to this scope/target",
      });
      continue;
    }

    const result = await evaluator.evaluate(evalInput);
    if (result.passed || !result.findings?.length) {
      continue;
    }

    for (const [index, draft] of result.findings.entries()) {
      const fingerprintInput = {
        ruleId: evaluator.ruleId,
        evaluatorVersion: evaluator.version,
        code: draft.code,
        severity: draft.severity,
        classification: draft.classification,
        evidenceRefs: draft.evidenceRefs ?? [],
        policyRefs: draft.policyRefs ?? [],
        authorityRefs: draft.authorityRefs ?? [],
        decisionRefs: draft.decisionRefs ?? [],
        executionRefs: draft.executionRefs ?? [],
        outcomeRefs: draft.outcomeRefs ?? [],
        evaluationRefs: draft.evaluationRefs ?? [],
        stateFingerprint: input.stateView.stateFingerprint,
      };

      const fingerprint = computeAuditFindingFingerprint(fingerprintInput);

      if (input.deduplicateByFingerprint && seenFingerprints.has(fingerprint)) {
        continue;
      }
      seenFingerprints.add(fingerprint);

      const findingId = `${input.findingIdPrefix ?? "finding"}-${evaluator.ruleId}-${index + 1}`;
      findings.push(
        createAuditFinding({
          id: findingId,
          engagementId: input.engagement.id,
          targetId: input.target.id,
          scopeId: input.scope.id,
          ruleId: evaluator.ruleId,
          evaluatorVersion: evaluator.version,
          code: draft.code,
          classification: draft.classification,
          title: draft.title,
          description: draft.description,
          severity: draft.severity,
          status: "OPEN",
          justification: draft.justification,
          evaluatedAt: input.at,
          fingerprint,
          evidenceRefs: draft.evidenceRefs,
          policyRefs: draft.policyRefs,
          authorityRefs: draft.authorityRefs,
          decisionRefs: draft.decisionRefs,
          executionRefs: draft.executionRefs,
          outcomeRefs: draft.outcomeRefs,
          evaluationRefs: draft.evaluationRefs,
          remediation: draft.remediation,
          advisory: draft.advisory,
          stateFingerprint: input.stateView.stateFingerprint,
          createdAt: input.at,
          provenance: input.provenance,
        }),
      );
    }
  }

  const severitySummary = buildAuditSeveritySummary(findings);
  const report = createAuditReport({
    id: input.reportId ?? `report-${input.engagement.id}`,
    engagementId: input.engagement.id,
    scopeId: input.scope.id,
    targetId: input.target.id,
    auditorActorId: input.engagement.auditorActorId,
    status: "FINAL",
    findingIds: findings.map((f) => f.id),
    evaluatorRuleIds,
    evaluatorVersions,
    stateFingerprint: input.stateView.stateFingerprint,
    severitySummary,
    summary: buildAuditReportSummary(findings),
    completedAt: input.at,
    createdAt: input.at,
    provenance: input.provenance,
  });

  return {
    findings,
    skippedEvaluators,
    report,
  };
}

export function assertAuditorIsObservationOnly(): void {
  // Compile-time / documentation anchor: AuditorRunner has no mutation APIs.
}
