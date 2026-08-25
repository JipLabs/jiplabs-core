import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { envelope, freezeDeep, requireNonEmpty } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type { IsoTimestamp, Provenance, Ref } from "../schema.js";
import {
  computeCandidateFingerprint,
  computeCaseVersionFingerprint,
  computeSuiteVersionContentHash,
} from "./fingerprints.js";
import type {
  EvaluationCase,
  EvaluationCaseAdmission,
  EvaluationCaseCandidate,
  EvaluationCaseProvenance,
  EvaluationCaseStatus,
  EvaluationCaseVersion,
  EvaluationCriterion,
  EvaluationExpectation,
  EvaluationSuite,
  EvaluationSuiteStatus,
  EvaluationSuiteVersion,
  EvaluationTarget,
  EvaluationTargetType,
} from "./types.js";

export function createEvaluationCaseCandidate(input: {
  readonly id: string;
  readonly candidateId: string;
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly provenance: EvaluationCaseProvenance;
  readonly inputContextRefs: readonly Ref[];
  readonly evidenceRefs: readonly string[];
  readonly tags?: readonly string[];
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenanceEnvelope: Provenance;
}): EvaluationCaseCandidate {
  const fingerprint = computeCandidateFingerprint({
    domain: input.domain,
    title: input.title,
    description: input.description,
    inputContextRefs: input.inputContextRefs,
    evidenceRefs: input.evidenceRefs,
    provenance: input.provenance,
    tags: input.tags,
  });
  const contentHash = sha256Canonical({
    candidateId: input.candidateId,
    fingerprint,
    provenance: input.provenance,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenanceEnvelope,
    }),
    candidateId: input.candidateId,
    domain: requireNonEmpty(input.domain, "domain"),
    title: requireNonEmpty(input.title, "title"),
    ...(input.description ? { description: input.description } : {}),
    sourceProvenance: freezeDeep({ ...input.provenance }),
    inputContextRefs: Object.freeze([...input.inputContextRefs]),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    ...(input.tags ? { tags: Object.freeze([...input.tags]) } : {}),
    status: "PENDING" as const,
    fingerprint,
    contentHash,
  });
}

export function createEvaluationCaseAdmission(input: {
  readonly id: string;
  readonly admissionId: string;
  readonly candidateId: string;
  readonly outcome: EvaluationCaseAdmission["outcome"];
  readonly rationale: string;
  readonly admittedByActorId: string;
  readonly policyVersionId?: string;
  readonly humanApprovalRequired: boolean;
  readonly humanApproved?: boolean;
  readonly caseId?: string;
  readonly caseVersion?: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationCaseAdmission {
  return freezeDeep({
    ...envelope(input),
    admissionId: input.admissionId,
    candidateId: input.candidateId,
    outcome: input.outcome,
    rationale: requireNonEmpty(input.rationale, "rationale"),
    admittedByActorId: input.admittedByActorId,
    ...(input.policyVersionId ? { policyVersionId: input.policyVersionId } : {}),
    humanApprovalRequired: input.humanApprovalRequired,
    ...(input.humanApproved !== undefined ? { humanApproved: input.humanApproved } : {}),
    ...(input.caseId ? { caseId: input.caseId } : {}),
    ...(input.caseVersion ? { caseVersion: input.caseVersion } : {}),
  });
}

export function createEvaluationCase(input: {
  readonly id: string;
  readonly caseId: string;
  readonly domain: string;
  readonly activeVersion: string;
  readonly fingerprint: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationCase {
  return freezeDeep({
    ...envelope(input),
    caseId: input.caseId,
    domain: input.domain,
    activeVersion: input.activeVersion,
    fingerprint: input.fingerprint,
  });
}

export function createEvaluationCaseVersion(input: {
  readonly id: string;
  readonly caseId: string;
  readonly version: string;
  readonly status?: EvaluationCaseStatus;
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly inputContextRefs: readonly Ref[];
  readonly evidenceRefs: readonly string[];
  readonly expectation: EvaluationExpectation;
  readonly criteria: readonly EvaluationCriterion[];
  readonly limitations?: readonly string[];
  readonly tags?: readonly string[];
  readonly severity?: string;
  readonly effectiveFrom: IsoTimestamp;
  readonly effectiveUntil?: IsoTimestamp | null;
  readonly supersedes?: { readonly caseId: string; readonly version: string };
  readonly candidateId?: string;
  readonly admissionId?: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly activatedAt?: IsoTimestamp | null;
}): EvaluationCaseVersion {
  const fingerprint = computeCaseVersionFingerprint({
    caseId: input.caseId,
    version: input.version,
    domain: input.domain,
    title: input.title,
    inputContextRefs: input.inputContextRefs,
    evidenceRefs: input.evidenceRefs,
    expectation: input.expectation,
    criteria: input.criteria,
    limitations: input.limitations,
    tags: input.tags,
  });
  const contentHash = sha256Canonical({ caseId: input.caseId, version: input.version, fingerprint });
  const status = input.status ?? "DRAFT";
  return freezeDeep({
    ...envelope(input),
    caseId: input.caseId,
    version: input.version,
    status,
    domain: input.domain,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    inputContextRefs: Object.freeze([...input.inputContextRefs]),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    expectation: freezeDeep({ ...input.expectation }),
    criteria: Object.freeze(input.criteria.map((c) => freezeDeep({ ...c }))),
    ...(input.limitations ? { limitations: Object.freeze([...input.limitations]) } : {}),
    ...(input.tags ? { tags: Object.freeze([...input.tags]) } : {}),
    ...(input.severity ? { severity: input.severity } : {}),
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveUntil !== undefined ? { effectiveUntil: input.effectiveUntil } : {}),
    ...(input.supersedes ? { supersedes: freezeDeep({ ...input.supersedes }) } : {}),
    ...(input.candidateId ? { candidateId: input.candidateId } : {}),
    ...(input.admissionId ? { admissionId: input.admissionId } : {}),
    fingerprint,
    contentHash,
    immutable: status === "ACTIVE",
    activatedAt: input.activatedAt ?? null,
  });
}

export function activateEvaluationCaseVersion(
  caseVersion: EvaluationCaseVersion,
  at: IsoTimestamp,
): EvaluationCaseVersion {
  if (caseVersion.immutable) {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_IMMUTABLE,
      `case version ${caseVersion.caseId}@${caseVersion.version} is already immutable`,
    );
  }
  return freezeDeep({
    ...caseVersion,
    status: "ACTIVE" as const,
    immutable: true,
    activatedAt: at,
  });
}

export function createEvaluationSuite(input: {
  readonly id: string;
  readonly suiteId: string;
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationSuite {
  return freezeDeep({
    ...envelope(input),
    suiteId: input.suiteId,
    domain: input.domain,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
  });
}

export function createEvaluationSuiteVersion(input: {
  readonly id: string;
  readonly suiteId: string;
  readonly version: string;
  readonly status?: EvaluationSuiteStatus;
  readonly domain: string;
  readonly title: string;
  readonly caseVersionRefs: readonly { readonly caseId: string; readonly version: string }[];
  readonly effectiveFrom: IsoTimestamp;
  readonly supersedes?: { readonly suiteId: string; readonly version: string };
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly activatedAt?: IsoTimestamp | null;
}): EvaluationSuiteVersion {
  const contentHash = computeSuiteVersionContentHash({
    suiteId: input.suiteId,
    version: input.version,
    caseVersionRefs: input.caseVersionRefs,
  });
  const status = input.status ?? "DRAFT";
  return freezeDeep({
    ...envelope(input),
    suiteId: input.suiteId,
    version: input.version,
    status,
    domain: input.domain,
    title: input.title,
    caseVersionRefs: Object.freeze([...input.caseVersionRefs]),
    effectiveFrom: input.effectiveFrom,
    ...(input.supersedes ? { supersedes: freezeDeep({ ...input.supersedes }) } : {}),
    contentHash,
    immutable: status === "ACTIVE",
    activatedAt: input.activatedAt ?? null,
  });
}

export function activateEvaluationSuiteVersion(
  suiteVersion: EvaluationSuiteVersion,
  at: IsoTimestamp,
): EvaluationSuiteVersion {
  if (suiteVersion.immutable) {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_IMMUTABLE,
      `suite version ${suiteVersion.suiteId}@${suiteVersion.version} is already immutable`,
    );
  }
  return freezeDeep({
    ...suiteVersion,
    status: "ACTIVE" as const,
    immutable: true,
    activatedAt: at,
  });
}

export function createEvaluationTarget(input: {
  readonly id: string;
  readonly targetId: string;
  readonly targetType: EvaluationTargetType;
  readonly version: string;
  readonly code?: string;
  readonly artifactHash?: string;
  readonly runtimeMetadata?: Record<string, unknown>;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): EvaluationTarget {
  return freezeDeep({
    ...envelope(input),
    targetId: input.targetId,
    targetType: input.targetType,
    version: requireNonEmpty(input.version, "version"),
    ...(input.code ? { code: input.code } : {}),
    ...(input.artifactHash ? { artifactHash: input.artifactHash } : {}),
    ...(input.runtimeMetadata ? { runtimeMetadata: freezeDeep({ ...input.runtimeMetadata }) as import("../schema.js").JsonSafeMetadata } : {}),
  });
}

export function assertCaseVersionImmutable(caseVersion: EvaluationCaseVersion): void {
  if (!caseVersion.immutable) {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_NOT_ACTIVE,
      `case version ${caseVersion.caseId}@${caseVersion.version} is not activated`,
    );
  }
}

export function assertSuiteVersionImmutable(suiteVersion: EvaluationSuiteVersion): void {
  if (!suiteVersion.immutable) {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_NOT_ACTIVE,
      `suite version ${suiteVersion.suiteId}@${suiteVersion.version} is not activated`,
    );
  }
}
