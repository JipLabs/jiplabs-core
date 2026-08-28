export { GovernanceError, GovernanceErrorCode } from "./errors.js";
export type { GovernanceErrorCode as CoreGovernanceErrorCode } from "./errors.js";

export {
  CORE_API_CHANNEL,
  CORE_EXPERIMENTAL_EXPORTS,
  CORE_RELEASE_LINE,
  coreApiStability,
  isCoreExperimentalExport,
  type CoreApiStability,
  type CoreExperimentalExport,
} from "./api-stability.js";

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

export { compareIso } from "./envelope.js";

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
  computeActionRequestContentHash,
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
  verifyRollbackOutcome,
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
  type DomainActionExecutionRequest,
  type DomainActionExecutionResult,
  type DomainActionExecutor,
  type DomainAdapterBundle,
  type DomainEvidenceProvider,
  type DomainExecutionReconciliationStatus,
  type DomainExecutionReconciler,
  type DomainGovernanceAdapter,
  type DomainObservation,
  type DomainObservationProvider,
  type DomainOutcomeEvaluation,
  type DomainOutcomeEvaluator,
  type DomainPolicyProvider,
  type EvaluateDomainDecisionAuthorizationInput,
  type EvaluateDomainDecisionAuthorizationResult,
} from "./domain/index.js";

export {
  GovernorKernel,
  canTransition,
  assertTransition,
  checkpointForState,
  InMemoryGovernanceRunStore,
  type GovernorIds,
  type GovernorKernelDeps,
  type GovernorRunInput,
  type GovernorRunResult,
  type HumanApprovalInput,
  type HumanRejectionInput,
  type RollbackExecutionInput,
  type RollbackExecutionOutcome,
  type GovernanceRun,
  type GovernanceRunStore,
  type KernelState,
  type RecoveryCheckpoint,
  type ExecutionAttempt,
  type ExecutionAttemptStatus,
  type DurableExecutionAttempt,
  computeGovernanceRequestFingerprint,
  computeRollbackRequestFingerprint,
  ROLLBACK_IDEMPOTENCY_PREFIX,
} from "./governor/index.js";

export {
  createGovernedActionAuthorization,
  assertValidForExecution,
  assertAuthorizationBinding,
  type GovernedActionAuthorization,
} from "./authorization/index.js";

export {
  executeGovernedAction,
  assertExecutorNotBypassed,
  type GovernedExecutionInput,
  type GovernedExecutionResult,
} from "./execution/index.js";

export {
  createCoreEvaluation,
  mapDomainVerdict,
  type CoreEvaluation,
  type CoreEvaluationVerdict,
} from "./evaluation/index.js";

export {
  resolveDisposition,
  type Disposition,
} from "./disposition/index.js";

export {
  InMemoryExecutionClaimStore,
  assertClaimAvailable,
  type ExecutionClaim,
  type ExecutionClaimStore,
} from "./concurrency/index.js";

export {
  canResumeFromCheckpoint,
} from "./recovery/index.js";

export {
  createOutcomeRecord,
  outcomeKindFromExecutionStatus,
  type OutcomeKind,
  type OutcomeRecord,
} from "./outcomes/index.js";

export {
  openNodeSqliteGovernanceStorage,
  openMemorySqliteGovernanceStorage,
  verifyLedgerIntegrity,
  assertLedgerIntegrity,
  replayGovernanceRun,
  reconstructRunFromStore,
  assertSupportedSchemaVersion,
  PERSISTENCE_SCHEMA_VERSION,
  type GovernanceStorageBundle,
  type GovernanceUnitOfWork,
  type ExecutionAttemptStore,
  type GovernanceReplayResult,
  type LedgerIntegrityReport,
} from "./persistence/index.js";

export {
  EvaluationCorpus,
  InMemoryEvaluationCorpusStore,
  createEvaluationCaseCandidate,
  createEvaluationTarget,
  createCandidateFromGovernanceRun,
  isEvaluationWorthyOutcome,
  computeCandidateFingerprint,
  computeEvaluationRunFingerprint,
  buildEvaluationSummary,
  compareEvaluationToBaseline,
  type EvaluationCaseCandidate,
  type EvaluationCase,
  type EvaluationCaseVersion,
  type EvaluationSuiteVersion,
  type EvaluationTarget,
  type EvaluationRun,
  type EvaluationCaseResult,
  type EvaluationSummary,
  type EvaluationBaseline,
  type RegressionComparison,
  type RegressionAssessment,
  type LearningSignal,
  type GovernanceRecommendation,
  type EvaluationCorpusStore,
  type EvaluationCaseEvaluator,
  type EvaluationTargetRunner,
} from "./evaluation-corpus/index.js";

export {
  GovernedComponentRegistry,
  InMemoryGovernedComponentRegistryStore,
  createGovernedComponent,
  createAgentIdentity,
  createModelIdentity,
  createCapabilityDeclaration,
  createResponsibility,
  createQualificationRecord,
  createResponsibilityEligibility,
  createResponsibilityAssignment,
  createFallbackRelationship,
  createReplacementProposal,
  evaluateResponsibilityEligibility,
  validateValidatorIndependence,
  buildComponentGovernanceTraceRefs,
  selectEligibleComponent,
  isAssignmentEligible,
  type GovernedComponent,
  type AgentIdentity,
  type ModelIdentity,
  type CapabilityDeclaration,
  type Responsibility,
  type QualificationRequirement,
  type QualificationRecord,
  type ResponsibilityEligibility,
  type ResponsibilityAssignment,
  type GovernedComponentRegistryStore,
  type AssignmentPolicy,
  type ComponentSelectionPolicy,
  type ComponentGovernanceTraceRefs,
  type GovernedComponentType,
  type QualificationStatus,
  type EligibilityOutcome,
  type AssignmentMode,
  type ComponentRole,
  type ValidatorIndependencePolicy,
  type FallbackRelationship,
  type ReplacementProposal,
} from "./component-governance/index.js";
