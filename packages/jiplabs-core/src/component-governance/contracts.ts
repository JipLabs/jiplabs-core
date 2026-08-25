import type { EvaluationCorpusStore } from "../evaluation-corpus/contracts.js";
import type { GovernanceLedger } from "../ledger/index.js";
import type { GovernanceRecommendation, LearningSignal } from "../evaluation-corpus/types.js";
import type { IsoTimestamp, Provenance } from "../schema.js";
import type { AssignmentPolicy } from "./eligibility.js";
import type {
  AssignmentMode,
  CapabilityDeclaration,
  ComponentRole,
  ComponentSelectionCandidate,
  ComponentSelectionPolicy,
  ComponentSelectionResult,
  ComponentStatusTransition,
  FallbackRelationship,
  GovernedComponent,
  QualificationRecord,
  ReplacementProposal,
  Responsibility,
  ResponsibilityAssignment,
  ResponsibilityEligibility,
} from "./types.js";

export interface GovernedComponentRegistryStore {
  saveComponent(component: GovernedComponent): void;
  getComponent(componentId: string, version: string): GovernedComponent | undefined;
  listComponents(filter?: { readonly componentId?: string }): readonly GovernedComponent[];
  listComponentVersions(componentId: string): readonly GovernedComponent[];

  saveCapabilityDeclaration(declaration: CapabilityDeclaration): void;
  getCapabilityDeclaration(declarationId: string): CapabilityDeclaration | undefined;
  listCapabilityDeclarations(componentId: string, version?: string): readonly CapabilityDeclaration[];

  saveResponsibility(responsibility: Responsibility): void;
  getResponsibility(responsibilityId: string): Responsibility | undefined;
  listResponsibilities(): readonly Responsibility[];

  saveQualificationRecord(record: QualificationRecord): void;
  getQualificationRecord(qualificationId: string): QualificationRecord | undefined;
  listQualificationRecords(componentId: string, version?: string): readonly QualificationRecord[];
  getCurrentQualification(input: {
    readonly componentId: string;
    readonly componentVersion: string;
    readonly responsibilityId?: string;
    readonly at: IsoTimestamp;
  }): QualificationRecord | undefined;

  saveEligibility(eligibility: ResponsibilityEligibility): void;
  getEligibility(eligibilityId: string): ResponsibilityEligibility | undefined;
  listEligibilities(filter?: { readonly componentId?: string; readonly responsibilityId?: string }): readonly ResponsibilityEligibility[];

  saveAssignment(assignment: ResponsibilityAssignment): void;
  getAssignment(assignmentId: string): ResponsibilityAssignment | undefined;
  getActiveAssignment(input: {
    readonly componentId: string;
    readonly componentVersion: string;
    readonly responsibilityId: string;
    readonly at: IsoTimestamp;
  }): ResponsibilityAssignment | undefined;
  listAssignments(filter?: { readonly componentId?: string; readonly responsibilityId?: string }): readonly ResponsibilityAssignment[];

  saveSelection(selection: ComponentSelectionResult): void;
  getSelection(selectionId: string): ComponentSelectionResult | undefined;

  saveStatusTransition(transition: ComponentStatusTransition): void;
  getStatusTransition(transitionId: string): ComponentStatusTransition | undefined;
  listStatusTransitions(componentId: string): readonly ComponentStatusTransition[];

  saveFallbackRelationship(relationship: FallbackRelationship): void;
  getFallbackRelationship(relationshipId: string): FallbackRelationship | undefined;
  listFallbackRelationships(primaryComponentId: string): readonly FallbackRelationship[];

  saveReplacementProposal(proposal: ReplacementProposal): void;
  getReplacementProposal(proposalId: string): ReplacementProposal | undefined;
}

export type GovernedComponentRegistryDeps = {
  readonly store: GovernedComponentRegistryStore;
  readonly ledger?: GovernanceLedger;
  readonly corpusStore?: EvaluationCorpusStore;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
};

export type RegisterComponentInput = {
  readonly component: GovernedComponent;
};

export type DeclareCapabilityInput = {
  readonly declaration: CapabilityDeclaration;
};

export type RecordQualificationInput = {
  readonly record: QualificationRecord;
};

export type EvaluateEligibilityInput = {
  readonly eligibilityId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly assignmentPolicy?: AssignmentPolicy;
  readonly actorId?: string;
};

export type AssignResponsibilityInput = {
  readonly assignmentId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly eligibilityId: string;
  readonly mode: AssignmentMode;
  readonly role?: ComponentRole;
  readonly assignedByActorId: string;
  readonly assignmentPolicy?: AssignmentPolicy;
  readonly evidenceRefs?: readonly string[];
  readonly validatorComponentId?: string;
  readonly fallbackComponentId?: string;
  readonly validUntil?: IsoTimestamp | null;
  readonly humanApproved?: boolean;
};

export type ApproveAssignmentInput = {
  readonly assignmentId: string;
  readonly approvedByActorId: string;
  readonly assignmentPolicy?: AssignmentPolicy;
};

export type SuspendComponentInput = {
  readonly transitionId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly rationale: string;
  readonly decisionId?: string;
  readonly actorId: string;
};

export type ProposeDemotionInput = {
  readonly transitionId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly recommendation: GovernanceRecommendation;
  readonly learningSignal?: LearningSignal;
  readonly actorId: string;
};

export type ExecuteDemotionInput = {
  readonly transitionId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly rationale: string;
  readonly decisionId: string;
  readonly actorId: string;
  readonly assignmentPolicy?: AssignmentPolicy;
};

export type SelectComponentInput = {
  readonly selectionId: string;
  readonly responsibilityId: string;
  readonly candidates: readonly ComponentSelectionCandidate[];
  readonly selectionPolicy?: ComponentSelectionPolicy;
};

export type RecordFallbackInput = {
  readonly relationship: FallbackRelationship;
};

export type ProposeReplacementInput = {
  readonly proposal: ReplacementProposal;
};
