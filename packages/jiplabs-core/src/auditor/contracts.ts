import type { DecisionTrace } from "../trace/index.js";
import type { JsonSafeMetadata } from "../schema.js";
import type {
  AuditEngagement,
  AuditFinding,
  AuditFindingClassification,
  AuditFindingSeverity,
  AuditScope,
  AuditTarget,
} from "./types.js";
import type { AuditGovernedStateView } from "./view.js";

export type AuditRuleEvaluationInput = {
  readonly engagement: AuditEngagement;
  readonly scope: AuditScope;
  readonly target: AuditTarget;
  readonly stateView: AuditGovernedStateView;
  readonly trace?: DecisionTrace;
  readonly context?: JsonSafeMetadata;
};

export type AuditRuleFindingDraft = {
  readonly code: string;
  readonly classification: AuditFindingClassification;
  readonly title: string;
  readonly description: string;
  readonly severity: AuditFindingSeverity;
  readonly justification: string;
  readonly evidenceRefs?: readonly string[];
  readonly policyRefs?: AuditFinding["policyRefs"];
  readonly authorityRefs?: AuditFinding["authorityRefs"];
  readonly decisionRefs?: readonly string[];
  readonly executionRefs?: readonly string[];
  readonly outcomeRefs?: readonly string[];
  readonly evaluationRefs?: readonly string[];
  readonly remediation?: AuditFinding["remediation"];
  readonly advisory?: AuditFinding["advisory"];
};

export type AuditRuleEvaluationResult = {
  readonly passed: boolean;
  readonly findings?: readonly AuditRuleFindingDraft[];
  readonly rationale?: string;
};

/**
 * Domain-supplied audit rule. Core records findings; products encode rule logic.
 *
 * The Auditor observes and evaluates only — evaluators MUST NOT mutate governed state.
 */
export interface AuditRuleEvaluator {
  readonly ruleId: string;
  readonly version?: string;
  /** When false, evaluator is deterministic for identical input + version. */
  readonly deterministic?: boolean;
  appliesTo?(input: AuditRuleEvaluationInput): boolean;
  evaluate(
    input: AuditRuleEvaluationInput,
  ): AuditRuleEvaluationResult | Promise<AuditRuleEvaluationResult>;
}
