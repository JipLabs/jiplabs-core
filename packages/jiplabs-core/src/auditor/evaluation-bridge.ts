import type { AuditFinding } from "./types.js";

const EVALUATION_WORTHY_SEVERITIES: ReadonlySet<AuditFinding["severity"]> = new Set([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
]);

const EVALUATION_WORTHY_CLASSIFICATIONS: ReadonlySet<AuditFinding["classification"]> = new Set([
  "INTEGRITY_VIOLATION",
  "AUTHORITY_VIOLATION",
  "POLICY_VIOLATION",
  "EVIDENCE_GAP",
  "PROVENANCE_GAP",
  "EXECUTION_VIOLATION",
  "EVALUATION_GAP",
  "TEMPORAL_VIOLATION",
  "RECONSTRUCTION_FAILURE",
]);

/**
 * Indicates whether a finding may warrant a separate governed evaluation-case
 * admission. Does NOT insert into an Evaluation Corpus — that is a distinct
 * governed operation.
 */
export function isEvaluationCandidateFromFinding(finding: AuditFinding): boolean {
  if (!EVALUATION_WORTHY_SEVERITIES.has(finding.severity)) {
    return false;
  }
  return EVALUATION_WORTHY_CLASSIFICATIONS.has(finding.classification);
}

export function evaluationCaseSourceKindFromFinding(
  finding: AuditFinding,
): "DOMAIN_FAILURE_SIGNAL" | "UNEXPECTED_EDGE" | "MANUAL_REFERENCE" {
  switch (finding.classification) {
    case "EXECUTION_VIOLATION":
    case "AUTHORITY_VIOLATION":
    case "POLICY_VIOLATION":
      return "DOMAIN_FAILURE_SIGNAL";
    case "RECONSTRUCTION_FAILURE":
    case "PROVENANCE_GAP":
      return "UNEXPECTED_EDGE";
    default:
      return "MANUAL_REFERENCE";
  }
}
