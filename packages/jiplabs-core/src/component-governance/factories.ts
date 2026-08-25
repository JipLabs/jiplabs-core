import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { envelope, freezeDeep, requireNonEmpty } from "../envelope.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance, ResourceRef } from "../schema.js";
import {
  computeAssignmentContentHash,
  computeAssignmentHash,
  computeCapabilityContentHash,
  computeComponentContentHash,
  computeEligibilityContentHash,
  computeQualificationContentHash,
  computeResponsibilityContentHash,
  computeSelectionContentHash,
} from "./fingerprints.js";
import type {
  AgentIdentity,
  AssignmentMode,
  AssignmentStatus,
  CapabilityDeclaration,
  ComponentRole,
  ComponentSelectionResult,
  ComponentStatusTransition,
  FallbackRelationship,
  GovernedComponent,
  GovernedComponentStatus,
  GovernedComponentType,
  ModelIdentity,
  QualificationRecord,
  QualificationRequirement,
  QualificationStatus,
  ReplacementProposal,
  Responsibility,
  ResponsibilityAssignment,
  ResponsibilityEligibility,
  ResponsibilityTransitionKind,
} from "./types.js";

export function createGovernedComponent(input: {
  readonly id: string;
  readonly componentId: string;
  readonly componentType: GovernedComponentType;
  readonly version: string;
  readonly artifactIdentity?: string;
  readonly runtimeIdentity?: string;
  readonly providerMetadata?: JsonSafeMetadata;
  readonly ownerSource?: string;
  readonly status?: GovernedComponentStatus;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): GovernedComponent {
  const contentHash = computeComponentContentHash({
    componentId: input.componentId,
    componentType: input.componentType,
    version: input.version,
    artifactIdentity: input.artifactIdentity,
    runtimeIdentity: input.runtimeIdentity,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    componentId: requireNonEmpty(input.componentId, "componentId"),
    componentType: input.componentType,
    version: requireNonEmpty(input.version, "version"),
    ...(input.artifactIdentity ? { artifactIdentity: input.artifactIdentity } : {}),
    ...(input.runtimeIdentity ? { runtimeIdentity: input.runtimeIdentity } : {}),
    ...(input.providerMetadata ? { providerMetadata: freezeDeep({ ...input.providerMetadata }) } : {}),
    ...(input.ownerSource ? { ownerSource: input.ownerSource } : {}),
    status: input.status ?? "REGISTERED",
    contentHash,
  });
}

export function createAgentIdentity(input: {
  readonly id: string;
  readonly componentId: string;
  readonly version: string;
  readonly artifactIdentity?: string;
  readonly runtimeIdentity?: string;
  readonly providerMetadata?: JsonSafeMetadata;
  readonly ownerSource?: string;
  readonly permittedInterfaces?: readonly string[];
  readonly toolMetadata?: JsonSafeMetadata;
  readonly status?: GovernedComponentStatus;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): AgentIdentity {
  const base = createGovernedComponent({ ...input, componentType: "AGENT" });
  return freezeDeep({
    ...base,
    componentType: "AGENT" as const,
    ...(input.permittedInterfaces
      ? { permittedInterfaces: Object.freeze([...input.permittedInterfaces]) }
      : {}),
    ...(input.toolMetadata ? { toolMetadata: freezeDeep({ ...input.toolMetadata }) } : {}),
  });
}

export function createModelIdentity(input: {
  readonly id: string;
  readonly componentId: string;
  readonly version: string;
  readonly artifactIdentity?: string;
  readonly modelFamily?: string;
  readonly artifactHash?: string;
  readonly providerMetadata?: JsonSafeMetadata;
  readonly contextMetadata?: JsonSafeMetadata;
  readonly ownerSource?: string;
  readonly status?: GovernedComponentStatus;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): ModelIdentity {
  const base = createGovernedComponent({ ...input, componentType: "MODEL" });
  return freezeDeep({
    ...base,
    componentType: "MODEL" as const,
    ...(input.modelFamily ? { modelFamily: input.modelFamily } : {}),
    ...(input.artifactHash ? { artifactHash: input.artifactHash } : {}),
    ...(input.contextMetadata ? { contextMetadata: freezeDeep({ ...input.contextMetadata }) } : {}),
  });
}

export function createCapabilityDeclaration(input: {
  readonly id: string;
  readonly declarationId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly capabilityId: string;
  readonly description?: string;
  readonly metadata?: JsonSafeMetadata;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): CapabilityDeclaration {
  const contentHash = computeCapabilityContentHash({
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    capabilityId: input.capabilityId,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    declarationId: input.declarationId,
    componentId: requireNonEmpty(input.componentId, "componentId"),
    componentVersion: requireNonEmpty(input.componentVersion, "componentVersion"),
    capabilityId: requireNonEmpty(input.capabilityId, "capabilityId"),
    ...(input.description ? { description: input.description } : {}),
    ...(input.metadata ? { metadata: freezeDeep({ ...input.metadata }) } : {}),
    contentHash,
  });
}

export function createResponsibility(input: {
  readonly id: string;
  readonly responsibilityId: string;
  readonly requiredCapabilities: readonly string[];
  readonly requiredQualifications?: readonly QualificationRequirement[];
  readonly requiredAuthority?: readonly string[];
  readonly riskClass?: string;
  readonly policyRef?: string;
  readonly resourceScope?: ResourceRef;
  readonly domainScope?: string;
  readonly constraints?: JsonSafeMetadata;
  readonly effectiveFrom: IsoTimestamp;
  readonly effectiveUntil?: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): Responsibility {
  const contentHash = computeResponsibilityContentHash({
    responsibilityId: input.responsibilityId,
    requiredCapabilities: input.requiredCapabilities,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    responsibilityId: requireNonEmpty(input.responsibilityId, "responsibilityId"),
    requiredCapabilities: Object.freeze([...input.requiredCapabilities]),
    ...(input.requiredQualifications
      ? { requiredQualifications: Object.freeze([...input.requiredQualifications]) }
      : {}),
    ...(input.requiredAuthority ? { requiredAuthority: Object.freeze([...input.requiredAuthority]) } : {}),
    ...(input.riskClass ? { riskClass: input.riskClass } : {}),
    ...(input.policyRef ? { policyRef: input.policyRef } : {}),
    ...(input.resourceScope ? { resourceScope: freezeDeep({ ...input.resourceScope }) } : {}),
    ...(input.domainScope ? { domainScope: input.domainScope } : {}),
    ...(input.constraints ? { constraints: freezeDeep({ ...input.constraints }) } : {}),
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil ?? null,
    contentHash,
  });
}

export function createQualificationRecord(input: {
  readonly id: string;
  readonly qualificationId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId?: string;
  readonly capabilityId?: string;
  readonly status: QualificationStatus;
  readonly evidenceRefs: readonly string[];
  readonly evaluationRunId?: string;
  readonly evaluationSuiteId?: string;
  readonly evaluationSuiteVersion?: string;
  readonly baselineId?: string;
  readonly policyVersionId?: string;
  readonly validFrom: IsoTimestamp;
  readonly validUntil?: IsoTimestamp | null;
  readonly limitations?: readonly string[];
  readonly supersededBy?: string;
  readonly immutable?: boolean;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): QualificationRecord {
  const contentHash = computeQualificationContentHash({
    qualificationId: input.qualificationId,
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    status: input.status,
    evidenceRefs: input.evidenceRefs,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    qualificationId: input.qualificationId,
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    ...(input.responsibilityId ? { responsibilityId: input.responsibilityId } : {}),
    ...(input.capabilityId ? { capabilityId: input.capabilityId } : {}),
    status: input.status,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    ...(input.evaluationRunId ? { evaluationRunId: input.evaluationRunId } : {}),
    ...(input.evaluationSuiteId ? { evaluationSuiteId: input.evaluationSuiteId } : {}),
    ...(input.evaluationSuiteVersion ? { evaluationSuiteVersion: input.evaluationSuiteVersion } : {}),
    ...(input.baselineId ? { baselineId: input.baselineId } : {}),
    ...(input.policyVersionId ? { policyVersionId: input.policyVersionId } : {}),
    validFrom: input.validFrom,
    validUntil: input.validUntil ?? null,
    ...(input.limitations ? { limitations: Object.freeze([...input.limitations]) } : {}),
    ...(input.supersededBy ? { supersededBy: input.supersededBy } : {}),
    immutable: input.immutable ?? true,
    contentHash,
  });
}

export function createResponsibilityEligibility(input: {
  readonly id: string;
  readonly eligibilityId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly outcome: ResponsibilityEligibility["outcome"];
  readonly reasons: readonly string[];
  readonly qualificationRecordId?: string;
  readonly restrictions?: readonly string[];
  readonly evaluatedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): ResponsibilityEligibility {
  const contentHash = computeEligibilityContentHash({
    eligibilityId: input.eligibilityId,
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    responsibilityId: input.responsibilityId,
    outcome: input.outcome,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    eligibilityId: input.eligibilityId,
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    responsibilityId: input.responsibilityId,
    outcome: input.outcome,
    reasons: Object.freeze([...input.reasons]),
    ...(input.qualificationRecordId ? { qualificationRecordId: input.qualificationRecordId } : {}),
    ...(input.restrictions ? { restrictions: Object.freeze([...input.restrictions]) } : {}),
    evaluatedAt: input.evaluatedAt,
    contentHash,
  });
}

export function createResponsibilityAssignment(input: {
  readonly id: string;
  readonly assignmentId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly eligibilityId: string;
  readonly mode: AssignmentMode;
  readonly role?: ComponentRole;
  readonly authorityGrantId?: string;
  readonly policyVersionId?: string;
  readonly evidenceRefs: readonly string[];
  readonly assignedAt: IsoTimestamp;
  readonly validFrom: IsoTimestamp;
  readonly validUntil?: IsoTimestamp | null;
  readonly restrictions?: readonly string[];
  readonly validatorComponentId?: string;
  readonly fallbackComponentId?: string;
  readonly assignedByActorId: string;
  readonly humanApproved?: boolean;
  readonly status: AssignmentStatus;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): ResponsibilityAssignment {
  const assignmentHash = computeAssignmentHash({
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    responsibilityId: input.responsibilityId,
    eligibilityId: input.eligibilityId,
    mode: input.mode,
    validFrom: input.validFrom,
  });
  const contentHash = computeAssignmentContentHash({
    assignmentId: input.assignmentId,
    assignmentHash,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    assignmentId: input.assignmentId,
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    responsibilityId: input.responsibilityId,
    eligibilityId: input.eligibilityId,
    mode: input.mode,
    role: input.role ?? "PRIMARY",
    ...(input.authorityGrantId ? { authorityGrantId: input.authorityGrantId } : {}),
    ...(input.policyVersionId ? { policyVersionId: input.policyVersionId } : {}),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    assignedAt: input.assignedAt,
    validFrom: input.validFrom,
    validUntil: input.validUntil ?? null,
    ...(input.restrictions ? { restrictions: Object.freeze([...input.restrictions]) } : {}),
    ...(input.validatorComponentId ? { validatorComponentId: input.validatorComponentId } : {}),
    ...(input.fallbackComponentId ? { fallbackComponentId: input.fallbackComponentId } : {}),
    assignedByActorId: input.assignedByActorId,
    ...(input.humanApproved !== undefined ? { humanApproved: input.humanApproved } : {}),
    status: input.status,
    assignmentHash,
    contentHash,
  });
}

export function createComponentSelectionResult(input: {
  readonly id: string;
  readonly selectionId: string;
  readonly responsibilityId: string;
  readonly selectedComponentId: string;
  readonly selectedComponentVersion: string;
  readonly selectionPolicyId?: string;
  readonly rationale: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): ComponentSelectionResult {
  const contentHash = computeSelectionContentHash({
    selectionId: input.selectionId,
    responsibilityId: input.responsibilityId,
    selectedComponentId: input.selectedComponentId,
    selectedComponentVersion: input.selectedComponentVersion,
  });
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    selectionId: input.selectionId,
    responsibilityId: input.responsibilityId,
    selectedComponentId: input.selectedComponentId,
    selectedComponentVersion: input.selectedComponentVersion,
    ...(input.selectionPolicyId ? { selectionPolicyId: input.selectionPolicyId } : {}),
    rationale: input.rationale,
    contentHash,
  });
}

export function createComponentStatusTransition(input: {
  readonly id: string;
  readonly transitionId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly kind: ResponsibilityTransitionKind;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly decisionId?: string;
  readonly recommendationId?: string;
  readonly learningSignalId?: string;
  readonly rationale: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): ComponentStatusTransition {
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    transitionId: input.transitionId,
    componentId: input.componentId,
    componentVersion: input.componentVersion,
    kind: input.kind,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    ...(input.decisionId ? { decisionId: input.decisionId } : {}),
    ...(input.recommendationId ? { recommendationId: input.recommendationId } : {}),
    ...(input.learningSignalId ? { learningSignalId: input.learningSignalId } : {}),
    rationale: input.rationale,
    contentHash: computeQualificationContentHash({
      qualificationId: input.transitionId,
      componentId: input.componentId,
      componentVersion: input.componentVersion,
      status: input.toStatus,
      evidenceRefs: [input.rationale],
    }),
  });
}

export function createFallbackRelationship(input: {
  readonly id: string;
  readonly relationshipId: string;
  readonly primaryComponentId: string;
  readonly primaryComponentVersion: string;
  readonly fallbackComponentId: string;
  readonly fallbackComponentVersion: string;
  readonly responsibilityId: string;
  readonly policyVersionId?: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): FallbackRelationship {
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    relationshipId: input.relationshipId,
    primaryComponentId: input.primaryComponentId,
    primaryComponentVersion: input.primaryComponentVersion,
    fallbackComponentId: input.fallbackComponentId,
    fallbackComponentVersion: input.fallbackComponentVersion,
    responsibilityId: input.responsibilityId,
    ...(input.policyVersionId ? { policyVersionId: input.policyVersionId } : {}),
    contentHash: computeComponentContentHash({
      componentId: input.primaryComponentId,
      componentType: "fallback",
      version: input.fallbackComponentId,
    }),
  });
}

export function createReplacementProposal(input: {
  readonly id: string;
  readonly proposalId: string;
  readonly incumbentComponentId: string;
  readonly incumbentComponentVersion: string;
  readonly candidateComponentId: string;
  readonly candidateComponentVersion: string;
  readonly responsibilityId: string;
  readonly rationale: string;
  readonly decisionId?: string;
  readonly status?: ReplacementProposal["status"];
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): ReplacementProposal {
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    proposalId: input.proposalId,
    incumbentComponentId: input.incumbentComponentId,
    incumbentComponentVersion: input.incumbentComponentVersion,
    candidateComponentId: input.candidateComponentId,
    candidateComponentVersion: input.candidateComponentVersion,
    responsibilityId: input.responsibilityId,
    rationale: input.rationale,
    ...(input.decisionId ? { decisionId: input.decisionId } : {}),
    status: input.status ?? "PROPOSED",
    contentHash: computeComponentContentHash({
      componentId: input.candidateComponentId,
      componentType: "replacement",
      version: input.candidateComponentVersion,
    }),
  });
}

export function assertQualificationImmutable(record: QualificationRecord): void {
  if (record.immutable) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      `qualification record ${record.qualificationId} is immutable`,
    );
  }
}

export function supersedeQualificationRecord(
  existing: QualificationRecord,
  successor: QualificationRecord,
): QualificationRecord {
  if (existing.qualificationId === successor.qualificationId) {
    throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "cannot supersede self");
  }
  return freezeDeep({
    ...existing,
    supersededBy: successor.qualificationId,
  });
}
