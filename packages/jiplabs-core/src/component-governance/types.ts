import type { EntityEnvelope, IsoTimestamp, JsonSafeMetadata, Provenance, ResourceRef } from "../schema.js";

export type GovernedComponentType =
  | "AGENT"
  | "MODEL"
  | "RULE_ENGINE"
  | "DETERMINISTIC_EXECUTOR"
  | "HYBRID_SYSTEM"
  | "EXTERNAL_INTELLIGENCE_SERVICE"
  | "OTHER";

export type GovernedComponentStatus =
  | "REGISTERED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DISQUALIFIED"
  | "RETIRED";

export type GovernedComponent = EntityEnvelope & {
  readonly componentId: string;
  readonly componentType: GovernedComponentType;
  readonly version: string;
  readonly artifactIdentity?: string;
  readonly runtimeIdentity?: string;
  readonly providerMetadata?: JsonSafeMetadata;
  readonly ownerSource?: string;
  readonly status: GovernedComponentStatus;
  readonly contentHash: string;
};

/** Agent specialization — identity is distinct from authority. */
export type AgentIdentity = GovernedComponent & {
  readonly componentType: "AGENT";
  readonly permittedInterfaces?: readonly string[];
  readonly toolMetadata?: JsonSafeMetadata;
};

/** Model specialization — provider-neutral; provider data lives in metadata. */
export type ModelIdentity = GovernedComponent & {
  readonly componentType: "MODEL";
  readonly modelFamily?: string;
  readonly artifactHash?: string;
  readonly contextMetadata?: JsonSafeMetadata;
};

/** Declared capability — a claim, not authority or qualification. */
export type CapabilityDeclaration = EntityEnvelope & {
  readonly declarationId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly capabilityId: string;
  readonly description?: string;
  readonly metadata?: JsonSafeMetadata;
  readonly contentHash: string;
};

export type QualificationRequirementKind =
  | "EVALUATION_SUITE"
  | "BASELINE_COMPARISON"
  | "PASS_RATE"
  | "NO_CRITICAL_FAIL"
  | "NO_REGRESSION"
  | "EXTERNAL_CERTIFICATION"
  | "HUMAN_QUALIFICATION"
  | "DETERMINISTIC_TEST"
  | "DOMAIN_EVIDENCE"
  | "CANARY_PERIOD"
  | "CUSTOM";

export type QualificationRequirement = {
  readonly requirementId: string;
  readonly kind: QualificationRequirementKind;
  readonly evaluationSuiteId?: string;
  readonly evaluationSuiteVersion?: string;
  readonly minimumPassRate?: number;
  readonly maxRegressionThreshold?: number;
  readonly maxAgeDays?: number;
  readonly evidenceKind?: string;
  readonly metadata?: JsonSafeMetadata;
};

/** Work Core may assign to an eligible governed component. */
export type Responsibility = EntityEnvelope & {
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
  readonly contentHash: string;
};

export type QualificationStatus =
  | "UNASSESSED"
  | "QUALIFIED"
  | "QUALIFIED_WITH_RESTRICTIONS"
  | "PROBATION"
  | "SUSPENDED"
  | "DISQUALIFIED"
  | "EXPIRED";

export type QualificationRecord = EntityEnvelope & {
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
  readonly immutable: boolean;
  readonly contentHash: string;
};

export type EligibilityOutcome =
  | "ELIGIBLE"
  | "ELIGIBLE_WITH_RESTRICTIONS"
  | "INELIGIBLE"
  | "HUMAN_APPROVAL_REQUIRED"
  | "EVALUATION_REQUIRED"
  | "SUSPENDED";

export type ResponsibilityEligibility = EntityEnvelope & {
  readonly eligibilityId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly outcome: EligibilityOutcome;
  readonly reasons: readonly string[];
  readonly qualificationRecordId?: string;
  readonly restrictions?: readonly string[];
  readonly evaluatedAt: IsoTimestamp;
  readonly contentHash: string;
};

export type AssignmentMode =
  | "FULL"
  | "CANARY"
  | "SHADOW"
  | "PROBATION"
  | "READ_ONLY"
  | "VALIDATOR_ONLY";

export type ComponentRole =
  | "PRIMARY"
  | "VALIDATOR"
  | "FALLBACK"
  | "CANARY"
  | "SHADOW";

export type AssignmentStatus = "PENDING" | "ACTIVE" | "REVOKED" | "EXPIRED" | "SUSPENDED";

export type ResponsibilityAssignment = EntityEnvelope & {
  readonly assignmentId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly eligibilityId: string;
  readonly mode: AssignmentMode;
  readonly role: ComponentRole;
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
  readonly assignmentHash: string;
  readonly contentHash: string;
};

export type ComponentSelectionPolicy = {
  readonly policyId: string;
  readonly preferLowerCost?: boolean;
  readonly preferHigherQualification?: boolean;
  readonly preferLowerLatency?: boolean;
  readonly preferHigherReliability?: boolean;
  readonly domainConstraints?: JsonSafeMetadata;
};

export type ComponentSelectionCandidate = {
  readonly componentId: string;
  readonly componentVersion: string;
  readonly costMetadata?: number;
  readonly latencyMetadata?: number;
  readonly reliabilityScore?: number;
  readonly metadata?: JsonSafeMetadata;
};

export type ComponentSelectionResult = EntityEnvelope & {
  readonly selectionId: string;
  readonly responsibilityId: string;
  readonly selectedComponentId: string;
  readonly selectedComponentVersion: string;
  readonly selectionPolicyId?: string;
  readonly rationale: string;
  readonly contentHash: string;
};

export type ResponsibilityTransitionKind =
  | "PROMOTE_RESPONSIBILITY"
  | "REDUCE_RESPONSIBILITY"
  | "SUSPEND"
  | "RESTORE"
  | "DISQUALIFY";

export type ComponentStatusTransition = EntityEnvelope & {
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
  readonly contentHash: string;
};

export type FallbackRelationship = EntityEnvelope & {
  readonly relationshipId: string;
  readonly primaryComponentId: string;
  readonly primaryComponentVersion: string;
  readonly fallbackComponentId: string;
  readonly fallbackComponentVersion: string;
  readonly responsibilityId: string;
  readonly policyVersionId?: string;
  readonly contentHash: string;
};

export type ReplacementProposal = EntityEnvelope & {
  readonly proposalId: string;
  readonly incumbentComponentId: string;
  readonly incumbentComponentVersion: string;
  readonly candidateComponentId: string;
  readonly candidateComponentVersion: string;
  readonly responsibilityId: string;
  readonly rationale: string;
  readonly decisionId?: string;
  readonly status: "PROPOSED" | "APPROVED" | "REJECTED" | "EXECUTED";
  readonly contentHash: string;
};

export type ValidatorIndependencePolicy = {
  readonly requireIndependentValidator: boolean;
  readonly forbidSameComponent?: boolean;
  readonly forbidSameProvider?: boolean;
  readonly forbidSameModelFamily?: boolean;
};

export type ComponentGovernanceEventType =
  | "COMPONENT_REGISTERED"
  | "COMPONENT_VERSION_REGISTERED"
  | "CAPABILITY_DECLARED"
  | "QUALIFICATION_RECORDED"
  | "QUALIFICATION_EXPIRED"
  | "COMPONENT_SUSPENDED"
  | "COMPONENT_RESTORED"
  | "RESPONSIBILITY_ELIGIBILITY_EVALUATED"
  | "RESPONSIBILITY_ASSIGNED"
  | "RESPONSIBILITY_REVOKED"
  | "COMPONENT_SELECTED"
  | "COMPONENT_PROMOTION_PROPOSED"
  | "COMPONENT_DEMOTION_PROPOSED"
  | "COMPONENT_REPLACEMENT_PROPOSED";

export type ComponentGovernanceTraceRefs = {
  readonly componentId?: string;
  readonly componentVersion?: string;
  readonly capabilityDeclarationIds?: readonly string[];
  readonly qualificationRecordId?: string;
  readonly evaluationRunId?: string;
  readonly evaluationSuiteId?: string;
  readonly evaluationSuiteVersion?: string;
  readonly responsibilityId?: string;
  readonly assignmentId?: string;
  readonly assignedByActorId?: string;
  readonly policyVersionId?: string;
  readonly assignmentMode?: AssignmentMode;
  readonly validatorComponentId?: string;
  readonly fallbackUsed?: boolean;
  readonly laterSuspended?: boolean;
};

export type ComponentGovernanceDeps = {
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
};
