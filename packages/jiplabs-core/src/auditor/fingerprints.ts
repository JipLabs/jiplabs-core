import { sha256Canonical } from "../hash.js";
import type { AuditFinding, AuditFindingClassification } from "./types.js";
import type { AuditGovernedStateView } from "./view.js";

export type AuditFindingFingerprintInput = {
  readonly ruleId: string;
  readonly evaluatorVersion?: string;
  readonly code: string;
  readonly severity: AuditFinding["severity"];
  readonly classification: AuditFindingClassification;
  readonly evidenceRefs: readonly string[];
  readonly policyRefs: AuditFinding["policyRefs"];
  readonly authorityRefs: AuditFinding["authorityRefs"];
  readonly decisionRefs: readonly string[];
  readonly executionRefs: readonly string[];
  readonly outcomeRefs: readonly string[];
  readonly evaluationRefs: readonly string[];
  readonly stateFingerprint?: string;
};

export function computeAuditFindingFingerprint(
  input: AuditFindingFingerprintInput,
): string {
  return sha256Canonical({
    ruleId: input.ruleId,
    evaluatorVersion: input.evaluatorVersion ?? "",
    code: input.code,
    severity: input.severity,
    classification: input.classification,
    evidenceRefs: input.evidenceRefs,
    policyRefs: input.policyRefs,
    authorityRefs: input.authorityRefs,
    decisionRefs: input.decisionRefs,
    executionRefs: input.executionRefs,
    outcomeRefs: input.outcomeRefs,
    evaluationRefs: input.evaluationRefs,
    stateFingerprint: input.stateFingerprint ?? "",
  });
}

export function computeAuditStateFingerprint(
  view: Pick<
    AuditGovernedStateView,
  | "decisionIds"
  | "policyVersions"
  | "evidenceIds"
  | "authorityRefs"
  | "executionRefs"
  | "outcomeIds"
  | "evaluationIds"
  | "ledgerEventIds"
  | "evaluatedAt"
  >,
): string {
  return sha256Canonical({
    decisionIds: view.decisionIds,
    policyVersions: view.policyVersions,
    evidenceIds: view.evidenceIds,
    authorityRefs: view.authorityRefs,
    executionRefs: view.executionRefs,
    outcomeIds: view.outcomeIds,
    evaluationIds: view.evaluationIds,
    ledgerEventIds: view.ledgerEventIds,
    evaluatedAt: view.evaluatedAt,
  });
}
