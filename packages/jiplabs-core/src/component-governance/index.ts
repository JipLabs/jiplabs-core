export type {
  GovernedComponentType,
  GovernedComponentStatus,
  GovernedComponent,
  AgentIdentity,
  ModelIdentity,
  CapabilityDeclaration,
  QualificationRequirementKind,
  QualificationRequirement,
  Responsibility,
  QualificationStatus,
  QualificationRecord,
  EligibilityOutcome,
  ResponsibilityEligibility,
  AssignmentMode,
  ComponentRole,
  AssignmentStatus,
  ResponsibilityAssignment,
  ComponentSelectionPolicy,
  ComponentSelectionCandidate,
  ComponentSelectionResult,
  ResponsibilityTransitionKind,
  ComponentStatusTransition,
  FallbackRelationship,
  ReplacementProposal,
  ValidatorIndependencePolicy,
  ComponentGovernanceEventType,
  ComponentGovernanceTraceRefs,
} from "./types.js";

export type {
  GovernedComponentRegistryStore,
  GovernedComponentRegistryDeps,
  RegisterComponentInput,
  DeclareCapabilityInput,
  RecordQualificationInput,
  EvaluateEligibilityInput,
  AssignResponsibilityInput,
  ApproveAssignmentInput,
  SuspendComponentInput,
  ProposeDemotionInput,
  ExecuteDemotionInput,
  SelectComponentInput,
  RecordFallbackInput,
  ProposeReplacementInput,
} from "./contracts.js";

export type { AssignmentPolicy, EligibilityEvaluationInput } from "./eligibility.js";
export type { ComponentSelectionInput } from "./selection.js";

export {
  createGovernedComponent,
  createAgentIdentity,
  createModelIdentity,
  createCapabilityDeclaration,
  createResponsibility,
  createQualificationRecord,
  createResponsibilityEligibility,
  createResponsibilityAssignment,
  createComponentSelectionResult,
  createComponentStatusTransition,
  createFallbackRelationship,
  createReplacementProposal,
  assertQualificationImmutable,
  supersedeQualificationRecord,
} from "./factories.js";

export {
  evaluateResponsibilityEligibility,
  validateValidatorIndependence,
  buildComponentGovernanceTraceRefs,
  isAssignmentEligible,
} from "./eligibility.js";

export { selectEligibleComponent } from "./selection.js";
export { GovernedComponentRegistry, activateComponent } from "./registry.js";
export { InMemoryGovernedComponentRegistryStore } from "./in-memory-store.js";
export { emitComponentGovernanceEvent } from "./ledger-events.js";

export {
  computeComponentContentHash,
  computeCapabilityContentHash,
  computeResponsibilityContentHash,
  computeQualificationContentHash,
  computeEligibilityContentHash,
  computeAssignmentHash,
  computeAssignmentContentHash,
  computeSelectionContentHash,
} from "./fingerprints.js";
