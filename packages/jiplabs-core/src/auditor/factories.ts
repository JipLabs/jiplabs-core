import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import type { Provenance } from "../schema.js";
import type {
  AuditAdvisory,
  AuditEngagement,
  AuditEngagementStatus,
  AuditFinding,
  AuditFindingClassification,
  AuditFindingResolution,
  AuditFindingSeverity,
  AuditFindingStatus,
  AuditGovernanceRef,
  AuditRemediation,
  AuditReport,
  AuditReportStatus,
  AuditScope,
  AuditScopeKind,
  AuditSeveritySummary,
  AuditTarget,
  AuditTimeRange,
} from "./types.js";
import { computeAuditFindingFingerprint } from "./fingerprints.js";

export function createAuditScope(input: {
  readonly id: string;
  readonly kind: AuditScopeKind;
  readonly subject?: AuditScope["subject"];
  readonly targetRef?: AuditScope["targetRef"];
  readonly timeRange?: AuditTimeRange;
  readonly description?: string;
  readonly createdAt: string;
  readonly recordedAt?: string;
  readonly provenance: Provenance;
  readonly metadata?: AuditScope["metadata"];
}): AuditScope {
  return freezeDeep({
    ...envelope(input),
    kind: input.kind,
    ...(input.subject ? { subject: freezeDeep({ ...input.subject }) } : {}),
    ...(input.targetRef ? { targetRef: freezeDeep({ ...input.targetRef }) } : {}),
    ...(input.timeRange
      ? {
          timeRange: freezeDeep({
            from: requireIsoTimestamp(input.timeRange.from, "timeRange.from"),
            ...(input.timeRange.to
              ? { to: requireIsoTimestamp(input.timeRange.to, "timeRange.to") }
              : {}),
          }),
        }
      : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function createAuditTarget(input: {
  readonly id: string;
  readonly subject: AuditTarget["subject"];
  readonly resourceRef?: AuditTarget["resourceRef"];
  readonly description?: string;
  readonly createdAt: string;
  readonly recordedAt?: string;
  readonly provenance: Provenance;
  readonly metadata?: AuditTarget["metadata"];
}): AuditTarget {
  return freezeDeep({
    ...envelope(input),
    subject: freezeDeep({ ...input.subject }),
    ...(input.resourceRef
      ? { resourceRef: freezeDeep({ ...input.resourceRef }) }
      : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function createAuditEngagement(input: {
  readonly id: string;
  readonly scopeId: string;
  readonly targetId: string;
  readonly auditorActorId: string;
  readonly status: AuditEngagementStatus;
  readonly initiatedAt: string;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly recordedAt?: string;
  readonly provenance: Provenance;
}): AuditEngagement {
  return freezeDeep({
    ...envelope(input),
    scopeId: requireNonEmpty(input.scopeId, "scopeId"),
    targetId: requireNonEmpty(input.targetId, "targetId"),
    auditorActorId: requireNonEmpty(input.auditorActorId, "auditorActorId"),
    status: input.status,
    initiatedAt: requireIsoTimestamp(input.initiatedAt, "initiatedAt"),
    ...(input.completedAt
      ? { completedAt: requireIsoTimestamp(input.completedAt, "completedAt") }
      : {}),
  });
}

export function createAuditFinding(input: {
  readonly id: string;
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
  readonly evaluatedAt: string;
  readonly fingerprint?: string;
  readonly evidenceRefs?: readonly string[];
  readonly policyRefs?: readonly AuditGovernanceRef[];
  readonly authorityRefs?: readonly AuditGovernanceRef[];
  readonly decisionRefs?: readonly string[];
  readonly executionRefs?: readonly string[];
  readonly outcomeRefs?: readonly string[];
  readonly evaluationRefs?: readonly string[];
  readonly supersedesFindingId?: string;
  readonly remediation?: AuditRemediation;
  readonly advisory?: AuditAdvisory;
  readonly createdAt: string;
  readonly recordedAt?: string;
  readonly provenance: Provenance;
  readonly stateFingerprint?: string;
}): AuditFinding {
  const evidenceRefs = Object.freeze([...(input.evidenceRefs ?? [])]);
  const policyRefs = Object.freeze(
    (input.policyRefs ?? []).map((ref) => freezeDeep({ ...ref })),
  );
  const authorityRefs = Object.freeze(
    (input.authorityRefs ?? []).map((ref) => freezeDeep({ ...ref })),
  );
  const decisionRefs = Object.freeze([...(input.decisionRefs ?? [])]);
  const executionRefs = Object.freeze([...(input.executionRefs ?? [])]);
  const outcomeRefs = Object.freeze([...(input.outcomeRefs ?? [])]);
  const evaluationRefs = Object.freeze([...(input.evaluationRefs ?? [])]);

  const fingerprint =
    input.fingerprint ??
    computeAuditFindingFingerprint({
      ruleId: input.ruleId,
      evaluatorVersion: input.evaluatorVersion,
      code: input.code,
      severity: input.severity,
      classification: input.classification,
      evidenceRefs,
      policyRefs,
      authorityRefs,
      decisionRefs,
      executionRefs,
      outcomeRefs,
      evaluationRefs,
      stateFingerprint: input.stateFingerprint,
    });

  return freezeDeep({
    ...envelope(input),
    engagementId: requireNonEmpty(input.engagementId, "engagementId"),
    targetId: requireNonEmpty(input.targetId, "targetId"),
    scopeId: requireNonEmpty(input.scopeId, "scopeId"),
    ruleId: requireNonEmpty(input.ruleId, "ruleId"),
    ...(input.evaluatorVersion ? { evaluatorVersion: input.evaluatorVersion } : {}),
    code: requireNonEmpty(input.code, "code"),
    classification: input.classification,
    title: requireNonEmpty(input.title, "title"),
    description: requireNonEmpty(input.description, "description"),
    severity: input.severity,
    status: input.status,
    justification: requireNonEmpty(input.justification, "justification"),
    evaluatedAt: requireIsoTimestamp(input.evaluatedAt, "evaluatedAt"),
    fingerprint,
    evidenceRefs,
    policyRefs,
    authorityRefs,
    decisionRefs,
    executionRefs,
    outcomeRefs,
    evaluationRefs,
    ...(input.supersedesFindingId
      ? { supersedesFindingId: input.supersedesFindingId }
      : {}),
    ...(input.remediation
      ? { remediation: freezeDeep({ ...input.remediation }) }
      : {}),
    ...(input.advisory ? { advisory: freezeDeep({ ...input.advisory }) } : {}),
  });
}

export function createAuditFindingResolution(input: {
  readonly id: string;
  readonly findingId: string;
  readonly engagementId: string;
  readonly fromStatus: AuditFindingStatus;
  readonly toStatus: AuditFindingStatus;
  readonly resolvedByActorId: string;
  readonly resolvedAt: string;
  readonly rationale: string;
  readonly replacementFindingId?: string;
  readonly createdAt: string;
  readonly recordedAt?: string;
  readonly provenance: Provenance;
}): AuditFindingResolution {
  return freezeDeep({
    ...envelope(input),
    findingId: requireNonEmpty(input.findingId, "findingId"),
    engagementId: requireNonEmpty(input.engagementId, "engagementId"),
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    resolvedByActorId: requireNonEmpty(input.resolvedByActorId, "resolvedByActorId"),
    resolvedAt: requireIsoTimestamp(input.resolvedAt, "resolvedAt"),
    rationale: requireNonEmpty(input.rationale, "rationale"),
    ...(input.replacementFindingId
      ? { replacementFindingId: input.replacementFindingId }
      : {}),
  });
}

export function createAuditReport(input: {
  readonly id: string;
  readonly engagementId: string;
  readonly scopeId: string;
  readonly targetId: string;
  readonly auditorActorId: string;
  readonly status: AuditReportStatus;
  readonly findingIds: readonly string[];
  readonly evaluatorRuleIds: readonly string[];
  readonly evaluatorVersions?: readonly { readonly ruleId: string; readonly version?: string }[];
  readonly stateFingerprint?: string;
  readonly severitySummary: AuditSeveritySummary;
  readonly summary?: string;
  readonly conclusion?: string;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly recordedAt?: string;
  readonly provenance: Provenance;
}): AuditReport {
  return freezeDeep({
    ...envelope(input),
    engagementId: requireNonEmpty(input.engagementId, "engagementId"),
    scopeId: requireNonEmpty(input.scopeId, "scopeId"),
    targetId: requireNonEmpty(input.targetId, "targetId"),
    auditorActorId: requireNonEmpty(input.auditorActorId, "auditorActorId"),
    status: input.status,
    findingIds: Object.freeze([...input.findingIds]),
    evaluatorRuleIds: Object.freeze([...input.evaluatorRuleIds]),
    evaluatorVersions: Object.freeze(
      (input.evaluatorVersions ?? []).map((v) => freezeDeep({ ...v })),
    ),
    severitySummary: freezeDeep({ ...input.severitySummary }),
    ...(input.stateFingerprint ? { stateFingerprint: input.stateFingerprint } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.conclusion ? { conclusion: input.conclusion } : {}),
    ...(input.completedAt
      ? { completedAt: requireIsoTimestamp(input.completedAt, "completedAt") }
      : {}),
  });
}
