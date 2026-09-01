import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  Ref,
  ResourceRef,
  SubjectRef,
} from "../schema.js";

/** What dimension of governed history an audit examines. */
export type AuditScopeKind =
  | "SUBJECT"
  | "TIME_RANGE"
  | "GOVERNANCE_RUN"
  | "DECISION"
  | "CUSTOM";

export type AuditTimeRange = {
  readonly from: IsoTimestamp;
  readonly to?: IsoTimestamp;
};

/**
 * Declares the boundaries of an audit — subject, time window, or governance artifact.
 * Products supply domain meaning via `subject`, `targetRef`, and metadata.
 */
export type AuditScope = EntityEnvelope & {
  readonly kind: AuditScopeKind;
  readonly subject?: SubjectRef;
  readonly targetRef?: Ref;
  readonly timeRange?: AuditTimeRange;
  readonly description?: string;
  readonly metadata?: JsonSafeMetadata;
};

/**
 * The entity or resource under audit within a scope.
 */
export type AuditTarget = EntityEnvelope & {
  readonly subject: SubjectRef;
  readonly resourceRef?: ResourceRef;
  readonly description?: string;
  readonly metadata?: JsonSafeMetadata;
};

export type AuditEngagementStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

/**
 * A governed audit session binding scope, target, and auditor identity.
 */
export type AuditEngagement = EntityEnvelope & {
  readonly scopeId: string;
  readonly targetId: string;
  readonly auditorActorId: string;
  readonly status: AuditEngagementStatus;
  readonly initiatedAt: IsoTimestamp;
  readonly completedAt?: IsoTimestamp;
};

export type AuditFindingSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFORMATIONAL";

export type AuditFindingStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RESOLVED"
  | "DISMISSED"
  | "ESCALATED"
  | "SUPERSEDED";

export type AuditFindingClassification =
  | "INTEGRITY_VIOLATION"
  | "AUTHORITY_VIOLATION"
  | "POLICY_VIOLATION"
  | "EVIDENCE_GAP"
  | "PROVENANCE_GAP"
  | "EXECUTION_VIOLATION"
  | "EVALUATION_GAP"
  | "TEMPORAL_VIOLATION"
  | "RECONSTRUCTION_FAILURE"
  | "ADVISORY"
  | "OTHER";

export type AuditGovernanceRefType =
  | "EVIDENCE"
  | "POLICY"
  | "POLICY_RULE"
  | "AUTHORITY"
  | "AUTHORITY_GRANT"
  | "DECISION"
  | "ACTION_REQUEST"
  | "ACTION_AUTHORIZATION"
  | "ACTION_RESULT"
  | "OUTCOME"
  | "EVALUATION"
  | "OVERRIDE"
  | "ROLLBACK"
  | "GOVERNANCE_RUN"
  | "TRACE"
  | "OTHER";

/** Typed reference to a governance artifact implicated in a finding. */
export type AuditGovernanceRef = {
  readonly refType: AuditGovernanceRefType;
  readonly id: string;
  readonly label?: string;
};

export type AuditRemediation = {
  readonly action?: string;
  readonly deadline?: IsoTimestamp;
  readonly responsibleActorId?: string;
  readonly metadata?: JsonSafeMetadata;
};

export type AuditAdvisory = {
  readonly recommendation?: string;
  readonly rationale?: string;
  readonly metadata?: JsonSafeMetadata;
};

/**
 * A single audit observation linking governed history to severity and status.
 *
 * Evidence, policy, authority, decision, execution, outcome, and evaluation
 * references are explicit so findings remain reconstructable without domain logic.
 */
export type AuditFinding = EntityEnvelope & {
  readonly engagementId: string;
  readonly targetId: string;
  readonly scopeId: string;
  readonly ruleId: string;
  readonly evaluatorVersion?: string;
  readonly code: string;
  readonly classification: AuditFindingClassification;
  readonly title: string;
  readonly description: string;
  readonly severity: AuditFindingSeverity;
  readonly status: AuditFindingStatus;
  readonly justification: string;
  readonly evaluatedAt: IsoTimestamp;
  readonly fingerprint: string;
  readonly evidenceRefs: readonly string[];
  readonly policyRefs: readonly AuditGovernanceRef[];
  readonly authorityRefs: readonly AuditGovernanceRef[];
  readonly decisionRefs: readonly string[];
  readonly executionRefs: readonly string[];
  readonly outcomeRefs: readonly string[];
  readonly evaluationRefs: readonly string[];
  readonly supersedesFindingId?: string;
  readonly remediation?: AuditRemediation;
  readonly advisory?: AuditAdvisory;
};

/**
 * Append-only resolution event. Original findings remain immutable.
 * Effective status is derived from the latest resolution in a chain.
 */
export type AuditFindingResolution = EntityEnvelope & {
  readonly findingId: string;
  readonly engagementId: string;
  readonly fromStatus: AuditFindingStatus;
  readonly toStatus: AuditFindingStatus;
  readonly resolvedByActorId: string;
  readonly resolvedAt: IsoTimestamp;
  readonly rationale: string;
  readonly replacementFindingId?: string;
};

export type AuditSeveritySummary = {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly informational: number;
  readonly total: number;
  readonly unresolved: number;
};

export type AuditReportStatus = "DRAFT" | "FINAL" | "SUPERSEDED";

/**
 * Aggregated audit output — findings plus summary under a completed engagement.
 */
export type AuditReport = EntityEnvelope & {
  readonly engagementId: string;
  readonly scopeId: string;
  readonly targetId: string;
  readonly auditorActorId: string;
  readonly status: AuditReportStatus;
  readonly findingIds: readonly string[];
  readonly evaluatorRuleIds: readonly string[];
  readonly evaluatorVersions: readonly { readonly ruleId: string; readonly version?: string }[];
  readonly stateFingerprint?: string;
  readonly severitySummary: AuditSeveritySummary;
  readonly summary?: string;
  readonly conclusion?: string;
  readonly completedAt?: IsoTimestamp;
};
