import type { CoreEvaluationVerdict } from "../evaluation/index.js";
import type { AutonomyMode } from "../policies/index.js";

export type Disposition =
  | "KEEP"
  | "FOLLOW_UP"
  | "ROLLBACK"
  | "ESCALATE"
  | "NO_ACTION";

export function resolveDisposition(input: {
  readonly evaluationVerdict: CoreEvaluationVerdict;
  readonly autonomyMode: AutonomyMode;
  readonly rollbackRequired: boolean;
  readonly policyAllowsRollback: boolean;
}): Disposition {
  switch (input.evaluationVerdict) {
    case "CORRECT":
      return "KEEP";
    case "PARTIAL":
      return "FOLLOW_UP";
    case "INCORRECT":
      if (input.policyAllowsRollback || input.rollbackRequired) {
        return "ROLLBACK";
      }
      return "ESCALATE";
    case "PENDING":
      return "NO_ACTION";
    case "NOT_EVALUABLE":
    case "INCONCLUSIVE":
    default:
      return input.autonomyMode === "BLOCKED" ? "NO_ACTION" : "FOLLOW_UP";
  }
}
