export { GovernanceError, GovernanceErrorCode } from "./errors.js";
export type { GovernanceErrorCode as CoreGovernanceErrorCode } from "./errors.js";

export {
  CORE_SCHEMA_VERSION,
  type CoreSchemaVersion,
  type EntityEnvelope,
  type IsoTimestamp,
  type JsonSafeMetadata,
  type JsonSafeValue,
  type Provenance,
  type Ref,
  type ResourceRef,
  type SubjectRef,
} from "./schema.js";

export {
  compareIso,
  envelope,
  freezeDeep,
  requireIsoTimestamp,
  requireNonEmpty,
  schemaVersion,
} from "./envelope.js";

export { canonicalJson, sha256Canonical, sha256Hex } from "./hash.js";

export { createActor, type Actor, type ActorType } from "./actors/index.js";

export {
  WellKnownCapability,
  isCapabilityId,
  type AuthorityScope,
  type CapabilityId,
} from "./authority/capabilities.js";

export {
  createAuthority,
  createAuthorityGrant,
  evaluateAuthorityGrant,
  revokeAuthorityGrant,
  type Authority,
  type AuthorityCheckResult,
  type AuthorityGrant,
  type DelegationRules,
  type GrantCondition,
} from "./authority/index.js";

export {
  activatePolicyVersion,
  assertPolicyVersionImmutable,
  createPolicy,
  createPolicyVersion,
  evaluateGate,
  evaluatePolicyGates,
  mandatoryGatesPassed,
  revisePolicyVersion,
  supersedePolicyVersion,
  type AutonomyMode,
  type FailureBehavior,
  type GateResult,
  type GateVerdict,
  type OverrideRules,
  type Policy,
  type PolicyGate,
  type PolicyStatus,
  type PolicyVersion,
  type RollbackRequirements,
} from "./policies/index.js";

export {
  createEvidence,
  createObservationRef,
  evidenceByKind,
  type Evidence,
  type ObservationRef,
} from "./evidence/index.js";

export {
  computeDecisionHash,
  createDecision,
  createDecisionExplanation,
  createDecisionGovernanceSnapshot,
  createDecisionProposal,
  evaluateDecisionProposal,
  reconstructDecision,
  reconstructDecisionFromSnapshot,
  type Decision,
  type DecisionEvaluationResult,
  type DecisionExplanation,
  type DecisionGovernanceSnapshot,
  type DecisionProposal,
  type DecisionReconstructionResult,
  type DecisionStatus,
  type RejectedAlternative,
} from "./decisions/index.js";

export {
  authorizeAction,
  createActionRequest,
  createActionResult,
  type ActionAuthorization,
  type ActionAuthorizationStatus,
  type ActionExecutionStatus,
  type ActionRequest,
  type ActionResult,
} from "./actions/index.js";

export {
  createEvaluation,
  createOutcome,
  type Evaluation,
  type EvaluationVerdict,
  type Outcome,
} from "./outcomes/index.js";

export {
  createRollbackExecution,
  createRollbackPlan,
  evaluateRollbackReadiness,
  type RollbackCompensation,
  type RollbackExecution,
  type RollbackExecutionStatus,
  type RollbackPlan,
  type RollbackReadiness,
  type RollbackVerification,
} from "./rollback/index.js";

export {
  authorizeOverride,
  createAuthorityRevocationRecord,
  createHumanChallenge,
  createOverride,
  createPolicyAmendment,
  createRollbackRequest,
  type AuthorityRevocationRecord,
  type HumanChallenge,
  type Override,
  type OverrideExecutionStatus,
  type PolicyAmendment,
  type RollbackRequest,
} from "./override/index.js";

export {
  assertHistoricalAuditSelfContained,
  assertLedgerAppendOnly,
  createDecisionMadeEvent,
  createGovernanceEvent,
  InMemoryGovernanceLedger,
  type AppendResult,
  type GovernanceEvent,
  type GovernanceEventType,
  type GovernanceLedger,
  type GovernanceTemporalRefs,
} from "./ledger/index.js";

export {
  answerTraceQuestions,
  assertTraceReconstructable,
  buildDecisionTrace,
  type DecisionTrace,
  type TraceLink,
  type TraceStage,
} from "./trace/index.js";

export {
  assertDomainAdapterCannotBypassCore,
  evaluateDomainDecisionAuthorization,
  governDomainDecision,
  type DomainActionExecutionRequest,
  type DomainActionExecutionResult,
  type DomainActionExecutor,
  type DomainAdapterBundle,
  type DomainEvidenceProvider,
  type DomainGovernanceAdapter,
  type DomainObservation,
  type DomainObservationProvider,
  type DomainOutcomeEvaluation,
  type DomainOutcomeEvaluator,
  type DomainPolicyProvider,
  type EvaluateDomainDecisionAuthorizationInput,
  type EvaluateDomainDecisionAuthorizationResult,
} from "./domain/index.js";
