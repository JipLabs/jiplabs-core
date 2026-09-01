import type { AuditRuleEvaluator, AuditRuleEvaluationInput } from "../../src/auditor/contracts.js";

/** Test-only proprietary evaluator — simulates external JipLabs intelligence package. */
export function createProprietaryAnomalyEvaluator(): AuditRuleEvaluator {
  return {
    ruleId: "proprietary-cross-product-heuristic",
    version: "0.1.0-mock",
    deterministic: false,
    evaluate(input: AuditRuleEvaluationInput) {
      const score = Number(input.context?.anomalyScore ?? 0);
      if (score < 0.8) {
        return { passed: true };
      }
      return {
        passed: false,
        findings: [
          {
            code: "PROPRIETARY_ANOMALY",
            classification: "OTHER",
            title: "Cross-product heuristic anomaly",
            description: "Mock proprietary detector flagged unusual pattern.",
            severity: "MEDIUM",
            justification: `anomalyScore=${score}`,
            decisionRefs: [...input.stateView.decisionIds],
          },
        ],
      };
    },
  };
}
