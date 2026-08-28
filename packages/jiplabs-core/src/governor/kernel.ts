import { createGovernedActionAuthorization } from "../authorization/index.js";
import { createActionRequest } from "../actions/index.js";
import { evaluateAuthorityGrant } from "../authority/index.js";
import { createActor, type Actor } from "../actors/index.js";
import type { Authority, AuthorityGrant } from "../authority/index.js";
import {
  InMemoryExecutionClaimStore,
  type ExecutionClaimStore,
} from "../concurrency/index.js";
import { resolveDisposition, type Disposition } from "../disposition/index.js";
import {
  evaluateDecisionProposal,
  createDecision,
  type Decision,
  type DecisionProposal,
} from "../decisions/index.js";
import type { DomainAdapterBundle } from "../domain/index.js";
import {
  createCoreEvaluation,
  mapDomainVerdict,
} from "../evaluation/index.js";
import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { executeGovernedAction } from "../execution/index.js";
import { freezeDeep } from "../envelope.js";
import type { Evidence } from "../evidence/index.js";
import type { GovernanceLedger } from "../ledger/index.js";
import {
  createOutcomeRecord,
  outcomeKindFromExecutionStatus,
} from "../outcomes/index.js";
import { authorizeOverride } from "../override/index.js";
import type { PolicyVersion } from "../policies/index.js";
import {
  createRollbackExecution,
  evaluateRollbackReadiness,
  verifyRollbackOutcome,
  type RollbackPlan,
} from "../rollback/index.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance, ResourceRef } from "../schema.js";
import {
  assertTransition,
  checkpointForState,
  type KernelState,
} from "./states.js";
import {
  createInitialRun,
  transitionRun,
  type DurableExecutionAttempt,
  type GovernanceRun,
  type GovernanceRunStore,
  InMemoryGovernanceRunStore,
} from "./runtime-state.js";
import type { ExecutionAttemptStore } from "../persistence/interfaces.js";
import type { GovernanceUnitOfWork } from "../persistence/interfaces.js";
import {
  emitActionAuthorized,
  emitActionExecuted,
  emitAuthorityChecked,
  emitDecisionMade,
  emitEvaluationCompleted,
  emitHumanApprovalRequested,
  emitHumanApproved,
  emitHumanRejected,
  emitOutcomeRecorded,
  emitProposalCreated,
  emitRollbackTriggered,
} from "./ledger-events.js";
import {
  assertActionIdempotencyKey,
  assertRollbackIdempotencyKey,
  computeGovernanceRequestFingerprint,
  computeRollbackRequestFingerprint,
} from "./fingerprint.js";

export type GovernorIds = {
  readonly runId: string;
  readonly decisionId: string;
  readonly explanationId: string;
  readonly actionRequestId: string;
  readonly authorizationId: string;
  readonly actionResultId: string;
  readonly outcomeId: string;
  readonly evaluationId: string;
};

export type GovernorRunInput = {
  readonly idempotencyKey: string;
  readonly ids: GovernorIds;
  readonly actor: Actor;
  readonly executorActorId: string;
  readonly authority: Authority;
  readonly grant: AuthorityGrant | null | undefined;
  readonly proposal: DecisionProposal;
  readonly policyVersion: PolicyVersion;
  readonly evidence: readonly Evidence[];
  readonly rollbackPlan?: RollbackPlan | null;
  readonly resource: ResourceRef;
  readonly adapter: DomainAdapterBundle;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
  readonly canaryConstraints?: JsonSafeMetadata;
};

export type GovernorRunResult = {
  readonly ok: boolean;
  readonly run: GovernanceRun;
  readonly state: KernelState;
  readonly disposition?: Disposition;
  readonly code?: string;
  readonly message?: string;
};

export type HumanApprovalInput = {
  readonly runId: string;
  readonly humanActorId: string;
  readonly authority: Authority;
  readonly grant: AuthorityGrant | null | undefined;
  readonly resource: ResourceRef;
  readonly adapter: DomainAdapterBundle;
  readonly policyVersion: PolicyVersion;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
  readonly authorizationId: string;
  readonly executorActorId: string;
};

export type HumanRejectionInput = {
  readonly runId: string;
  readonly humanActorId: string;
  readonly reason: string;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
};

export type RollbackExecutionOutcome = {
  readonly status: "COMPLETED" | "FAILED" | "UNKNOWN";
  readonly verificationResult?: {
    readonly kind: string;
    readonly actual: string;
  };
};

export type RollbackExecutionInput = {
  readonly runId: string;
  readonly actorId: string;
  readonly authority: Authority;
  readonly grant: AuthorityGrant | null | undefined;
  readonly resource: ResourceRef;
  readonly rollbackPlan: RollbackPlan;
  readonly rollbackExecutionId: string;
  readonly idempotencyKey?: string;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
  readonly executeRollback: (
    plan: RollbackPlan,
    decision: Decision,
  ) =>
    | Promise<RollbackExecutionOutcome>
    | RollbackExecutionOutcome;
};

export type GovernorKernelDeps = {
  readonly runStore?: GovernanceRunStore;
  readonly ledger: GovernanceLedger;
  readonly claimStore?: ExecutionClaimStore;
  readonly attemptStore?: ExecutionAttemptStore;
  readonly unitOfWork?: GovernanceUnitOfWork;
  readonly replayMode?: boolean;
};

function resourceKey(resource: ResourceRef, subjectId: string): string {
  return [
    resource.domain,
    resource.resourceType ?? "*",
    resource.resourceId ?? subjectId,
  ].join("|");
}

function executionAttemptId(runId: string): string {
  return `${runId}:attempt:1`;
}

function freshExecutionAuthority(input: {
  readonly grant: AuthorityGrant | null | undefined;
  readonly authority: Authority;
  readonly scope: string;
  readonly resource: ResourceRef;
  readonly at: IsoTimestamp;
}) {
  if (!input.grant) {
    return {
      allowed: false as const,
      grantId: "none",
      message: "execution authority grant is missing",
    };
  }
  return evaluateAuthorityGrant({
    grant: input.grant,
    authority: input.authority,
    actorId: input.grant.actorId,
    scope: input.scope,
    resource: input.resource,
    at: input.at,
  });
}

function requestFingerprintForInput(input: GovernorRunInput, resource: string): string {
  return computeGovernanceRequestFingerprint({
    proposal: input.proposal,
    policyContentHash: input.policyVersion.contentHash,
    resourceKey: resource,
    actorId: input.actor.id,
    executorActorId: input.executorActorId,
    evidenceRefs: input.evidence.map((item) => item.id),
    rollbackPlanId: input.rollbackPlan?.id ?? null,
  });
}

function withDecisionStatus(decision: Decision, status: Decision["status"]): Decision {
  return createDecision({
    id: decision.id,
    proposalId: decision.proposalId,
    actorId: decision.actorId,
    authorityRef: decision.authorityRef,
    authorityCode: decision.authorityCode,
    policyRef: decision.policyRef,
    policyVersion: decision.policyVersion,
    evidenceRefs: decision.evidenceRefs,
    gateResults: decision.gateResults,
    decisionValue: decision.decisionValue,
    status,
    decidedAt: decision.decidedAt,
    createdAt: decision.createdAt,
    recordedAt: decision.recordedAt,
    provenance: decision.provenance,
    humanApprovalRequired: decision.humanApprovalRequired,
    humanOverrideAvailable: decision.humanOverrideAvailable,
    rollbackRequired: decision.rollbackRequired,
    rollbackPlanId: decision.rollbackPlanId,
    explanationRef: decision.explanationRef,
    autonomyMode: decision.autonomyMode,
    governanceSnapshot: decision.governanceSnapshot,
    metadata: decision.metadata,
  });
}

/**
 * Stable 1.0 **full-lifecycle** runtime.
 *
 * Orchestrates proposal → authority → policy → decision → action authorization
 * → execution → outcome → evaluation → disposition / rollback.
 *
 * Product adapters that only need a governed decision (no Core-managed
 * execution) should call {@link evaluateDomainDecisionAuthorization} instead.
 * Using the kernel is valid and supported; it is not required for authorize-only
 * integrations.
 */
export class GovernorKernel {
  readonly #runStore: GovernanceRunStore;
  readonly #ledger: GovernanceLedger;
  readonly #claims: ExecutionClaimStore;
  readonly #attemptStore: ExecutionAttemptStore | null;
  readonly #unitOfWork: GovernanceUnitOfWork | null;
  readonly #replayMode: boolean;

  constructor(deps: GovernorKernelDeps) {
    this.#runStore = deps.runStore ?? new InMemoryGovernanceRunStore();
    this.#ledger = deps.ledger;
    this.#claims = deps.claimStore ?? new InMemoryExecutionClaimStore();
    this.#attemptStore = deps.attemptStore ?? null;
    this.#unitOfWork = deps.unitOfWork ?? null;
    this.#replayMode = deps.replayMode ?? false;
  }

  get runStore(): GovernanceRunStore {
    return this.#runStore;
  }

  get ledger(): GovernanceLedger {
    return this.#ledger;
  }

  get replayMode(): boolean {
    return this.#replayMode;
  }

  #persistRun(run: GovernanceRun): void {
    const save = () => this.#runStore.save(run);
    try {
      if (this.#unitOfWork) {
        this.#unitOfWork.runInTransaction(save);
      } else {
        save();
      }
    } catch (error) {
      if (error instanceof GovernanceError) {
        throw error;
      }
      throw new GovernanceError(
        GovernanceErrorCode.STORAGE_PERSISTENCE_FAILED,
        error instanceof Error ? error.message : "run persistence failed",
      );
    }
  }

  #persistAttempt(attempt: DurableExecutionAttempt): void {
    if (!this.#attemptStore) {
      return;
    }
    const save = () => this.#attemptStore!.save(attempt);
    try {
      if (this.#unitOfWork) {
        this.#unitOfWork.runInTransaction(save);
      } else {
        save();
      }
    } catch (error) {
      if (error instanceof GovernanceError) {
        throw error;
      }
      throw new GovernanceError(
        GovernanceErrorCode.STORAGE_PERSISTENCE_FAILED,
        error instanceof Error ? error.message : "execution attempt persistence failed",
      );
    }
  }

  async run(input: GovernorRunInput): Promise<GovernorRunResult> {
    assertActionIdempotencyKey(input.idempotencyKey);
    const resource = resourceKey(input.resource, input.proposal.subject.id);
    const requestFingerprint = requestFingerprintForInput(input, resource);

    const existing = this.#runStore.getByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      const binding = this.#runStore.getIdempotencyBinding(input.idempotencyKey);
      if (binding && binding.fingerprint !== requestFingerprint) {
        return {
          ok: false,
          run: existing,
          state: existing.state,
          code: GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
          message: `idempotency key ${input.idempotencyKey} is bound to a different request fingerprint`,
        };
      }
      return {
        ok: ![
          "AUTHORITY_DENIED",
          "POLICY_BLOCKED",
          "BLOCKED",
          "ROLLBACK_FAILED",
          "RECONCILIATION_REQUIRED",
        ].includes(existing.state),
        run: existing,
        state: existing.state,
        disposition: existing.disposition,
      };
    }

    const claimOk = this.#claims.tryAcquire({
      resourceKey: resource,
      runId: input.ids.runId,
      holderActorId: input.actor.id,
      acquiredAt: input.at,
      expiresAt: new Date(Date.parse(input.at) + 3600_000).toISOString(),
    });
    if (!claimOk) {
      return this.#fail(
        createInitialRun({
          runId: input.ids.runId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          resourceKey: resource,
          domain: input.proposal.domain,
          at: input.at,
          provenance: input.provenance,
        }),
        "BLOCKED",
        input.at,
        GovernanceErrorCode.EXECUTION_CLAIM_HELD,
        "resource claim held by another run",
      );
    }

    let run = createInitialRun({
      runId: input.ids.runId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      resourceKey: resource,
      domain: input.proposal.domain,
      at: input.at,
      provenance: input.provenance,
    });
    run = transitionRun(run, "AUTHORITY_CHECKING", input.at, {
      proposal: input.proposal,
    });

    emitProposalCreated(this.#ledger, {
      eventId: `${input.ids.runId}:proposal`,
      at: input.at,
      actorId: input.actor.id,
      proposalId: input.proposal.id,
      idempotencyKey: input.idempotencyKey,
      provenance: input.provenance,
      runId: input.ids.runId,
    });

    const evaluation = evaluateDecisionProposal({
      proposal: input.proposal,
      actor: input.actor,
      authority: input.authority,
      grant: input.grant,
      policyVersion: input.policyVersion,
      evidence: input.evidence,
      rollbackPlan: input.rollbackPlan,
      at: input.at,
      resource: input.resource,
      decisionId: input.ids.decisionId,
      explanationId: input.ids.explanationId,
    });

    if (!evaluation.ok) {
      const deniedState: KernelState =
        evaluation.code === GovernanceErrorCode.GATE_FAILED ||
        evaluation.code === GovernanceErrorCode.POLICY_NOT_ACTIVE
          ? "POLICY_BLOCKED"
          : input.policyVersion.autonomyMode === "BLOCKED"
            ? "BLOCKED"
            : "AUTHORITY_DENIED";
      emitAuthorityChecked(this.#ledger, {
        eventId: `${input.ids.runId}:authority`,
        at: input.at,
        actorId: input.actor.id,
        grantId: input.grant?.id ?? "none",
        allowed: false,
        idempotencyKey: input.idempotencyKey,
        provenance: input.provenance,
        runId: input.ids.runId,
      });
      return this.#fail(run, deniedState, input.at, evaluation.code, evaluation.message);
    }

    emitAuthorityChecked(this.#ledger, {
      eventId: `${input.ids.runId}:authority`,
      at: input.at,
      actorId: input.actor.id,
      grantId: evaluation.authorityCheck.grantId,
      allowed: true,
      idempotencyKey: input.idempotencyKey,
      provenance: input.provenance,
      authorityGrantContentHash: input.grant?.contentHash,
      runId: input.ids.runId,
    });

    run = transitionRun(run, "POLICY_EVALUATING", input.at);
    assertTransition("POLICY_EVALUATING", "DECISION_MADE");

    let decision = evaluation.decision;
    run = transitionRun(run, "DECISION_MADE", input.at, {
      decision,
      explanation: evaluation.explanation,
      checkpoint: "DECISION_MADE",
    });

    emitDecisionMade(this.#ledger, {
      eventId: `${input.ids.runId}:decision`,
      at: input.at,
      actorId: input.actor.id,
      decision,
      provenance: input.provenance,
      idempotencyKey: input.idempotencyKey,
      runId: input.ids.runId,
    });

    if (input.policyVersion.autonomyMode === "BLOCKED") {
      return this.#save(run, "BLOCKED", input.at);
    }

    if (decision.humanApprovalRequired) {
      run = transitionRun(run, "WAITING_HUMAN_APPROVAL", input.at, {
        checkpoint: "DECISION_MADE",
      });
      emitHumanApprovalRequested(this.#ledger, {
        eventId: `${input.ids.runId}:human-approval-request`,
        at: input.at,
        actorId: input.actor.id,
        decisionId: decision.id,
        provenance: input.provenance,
        idempotencyKey: input.idempotencyKey,
        runId: input.ids.runId,
      });
      return this.#save(run, run.state, input.at);
    }

    if (input.policyVersion.autonomyMode === "AUTONOMOUS_CANARY") {
      const allowed = input.canaryConstraints?.allowed === true;
      if (!allowed) {
        return this.#fail(
          run,
          "BLOCKED",
          input.at,
          GovernanceErrorCode.CANARY_CONSTRAINT_FAILED,
          "canary constraints not satisfied",
        );
      }
    }

    return this.#continueAfterDecision(input, run, decision);
  }

  async approve(input: HumanApprovalInput): Promise<GovernorRunResult> {
    const run = this.#runStore.get(input.runId);
    if (!run || run.state !== "WAITING_HUMAN_APPROVAL" || !run.decision) {
      return this.#missingRun(input.runId);
    }
    const check = evaluateAuthorityGrant({
      grant: input.grant,
      authority: input.authority,
      actorId: input.humanActorId,
      scope: run.decision.governanceSnapshot.requiredCapability,
      resource: input.resource,
      at: input.at,
    });
    if (!check.allowed) {
      return {
        ok: false,
        run,
        state: run.state,
        code: GovernanceErrorCode.APPROVAL_AUTHORITY_MISSING,
        message: check.message,
      };
    }

    const approvedDecision = withDecisionStatus(run.decision, "AUTHORIZED");
    emitHumanApproved(this.#ledger, {
      eventId: `${run.runId}:human-approved`,
      at: input.at,
      actorId: input.humanActorId,
      decisionId: approvedDecision.id,
      provenance: input.provenance,
      idempotencyKey: run.idempotencyKey,
      runId: run.runId,
    });

    let next = transitionRun(run, run.state, input.at, {
      decision: approvedDecision,
      humanApproved: true,
    });

    const policyContentHash = approvedDecision.governanceSnapshot.policyContentHash;
    const rollbackReady = Boolean(approvedDecision.rollbackPlanId);
    const actionRequest = createActionRequest({
      id: run.actionRequest?.id ?? `${run.runId}:action-request`,
      decisionId: approvedDecision.id,
      action: run.proposal!.action,
      subject: run.proposal!.subject,
      requestedAt: input.at,
      createdAt: input.at,
      provenance: input.provenance,
    });
    const executionAuthority = freshExecutionAuthority({
      grant: input.grant,
      authority: input.authority,
      scope: input.policyVersion.requiredAuthorityScope,
      resource: input.resource,
      at: input.at,
    });
    if (!executionAuthority.allowed) {
      return {
        ok: false,
        run,
        state: run.state,
        code: GovernanceErrorCode.EXECUTION_AUTHORITY_STALE,
        message: executionAuthority.message,
      };
    }
    const authorization = createGovernedActionAuthorization({
      id: input.authorizationId,
      decision: approvedDecision,
      actionRequest,
      actionRequestId: actionRequest.id,
      resourceKey: run.resourceKey,
      actorId: input.humanActorId,
      executorActorId: input.executorActorId,
      authorityGrantContentHash: input.grant?.contentHash ?? "none",
      policyContentHash,
      rollbackReady,
      authorizedAt: input.at,
      createdAt: input.at,
      provenance: input.provenance,
      reason: "human approval granted",
    });

    next = transitionRun(next, "ACTION_AUTHORIZED", input.at, {
      actionRequest,
      actionAuthorization: authorization,
      checkpoint: "ACTION_AUTHORIZED",
    });
    emitActionAuthorized(this.#ledger, {
      eventId: `${run.runId}:action-auth-human`,
      at: input.at,
      actorId: input.humanActorId,
      authorization,
      provenance: input.provenance,
      idempotencyKey: run.idempotencyKey,
      runId: run.runId,
    });

    this.#persistRun(next);
    const resumeInput: GovernorRunInput = {
      idempotencyKey: run.idempotencyKey,
      ids: {
        runId: run.runId,
        decisionId: approvedDecision.id,
        explanationId: run.explanation!.id,
        actionRequestId: actionRequest.id,
        authorizationId: authorization.id,
        actionResultId: `${run.runId}:action-result`,
        outcomeId: `${run.runId}:outcome`,
        evaluationId: `${run.runId}:evaluation`,
      },
      actor: createActor({
        id: input.humanActorId,
        type: "HUMAN",
        code: input.humanActorId,
        scopes: [],
        createdAt: input.at,
        provenance: input.provenance,
      }),
      executorActorId: input.executorActorId,
      authority: input.authority,
      grant: input.grant,
      proposal: run.proposal!,
      policyVersion: input.policyVersion,
      evidence: [],
      resource: input.resource,
      adapter: input.adapter,
      at: input.at,
      provenance: input.provenance,
    };
    return this.#executeFromAuthorization(
      resumeInput,
      next,
      approvedDecision,
      authorization,
      actionRequest,
    );
  }

  async reject(input: HumanRejectionInput): Promise<GovernorRunResult> {
    const run = this.#runStore.get(input.runId);
    if (!run || run.state !== "WAITING_HUMAN_APPROVAL" || !run.decision) {
      return this.#missingRun(input.runId);
    }
    emitHumanRejected(this.#ledger, {
      eventId: `${run.runId}:human-rejected`,
      at: input.at,
      actorId: input.humanActorId,
      decisionId: run.decision.id,
      provenance: input.provenance,
      idempotencyKey: run.idempotencyKey,
      runId: run.runId,
    });
    const next = transitionRun(run, "BLOCKED", input.at, {
      humanRejected: true,
      checkpoint: "DECISION_MADE",
    });
    return this.#save(next, next.state, input.at);
  }

  async resume(runId: string, input: GovernorRunInput): Promise<GovernorRunResult> {
    const run = this.#runStore.get(runId);
    if (!run) return this.#missingRun(runId);
    if (!run.checkpoint) {
      return {
        ok: false,
        run,
        state: run.state,
        code: GovernanceErrorCode.RECOVERY_INVALID,
        message: "run has no recovery checkpoint",
      };
    }
    if (run.checkpoint === "DECISION_MADE" && run.decision?.humanApprovalRequired) {
      return { ok: true, run, state: run.state };
    }
    if (
      run.checkpoint === "ACTION_AUTHORIZED" &&
      run.decision &&
      run.actionAuthorization &&
      run.actionRequest
    ) {
      return this.#executeFromAuthorization(
        input,
        run,
        run.decision,
        run.actionAuthorization,
        run.actionRequest,
      );
    }
    if (
      run.checkpoint === "ACTION_STARTED" &&
      run.decision &&
      run.actionAuthorization &&
      run.actionRequest &&
      !run.actionResult
    ) {
      return this.#executeFromAuthorization(
        input,
        run,
        run.decision,
        run.actionAuthorization,
        run.actionRequest,
      );
    }
    if (run.checkpoint === "ACTION_COMPLETED" && run.actionResult && run.decision) {
      return this.#evaluateAndDispose(input, run, run.decision, run.actionResult);
    }
    return { ok: true, run, state: run.state, disposition: run.disposition };
  }

  async executeRollback(input: RollbackExecutionInput): Promise<GovernorRunResult> {
    const run = this.#runStore.get(input.runId);
    if (!run?.decision) return this.#missingRun(input.runId);

    const rollbackKey =
      input.idempotencyKey ?? `rollback:${input.runId}:${input.rollbackPlan.id}`;
    assertRollbackIdempotencyKey(rollbackKey);
    const rollbackFingerprint = computeRollbackRequestFingerprint({
      runId: input.runId,
      decisionId: run.decision.id,
      planId: input.rollbackPlan.id,
      rollbackAction: input.rollbackPlan.rollbackAction,
      rollbackTargetId: input.rollbackPlan.rollbackTarget.id,
    });
    const existingBinding = this.#runStore.getIdempotencyBinding(rollbackKey);
    if (existingBinding && existingBinding.fingerprint !== rollbackFingerprint) {
      return {
        ok: false,
        run,
        state: run.state,
        code: GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
        message: `rollback idempotency key ${rollbackKey} is bound to a different rollback fingerprint`,
      };
    }
    if (
      run.rollbackExecution?.status === "COMPLETED" &&
      run.rollbackIdempotencyKey === rollbackKey
    ) {
      return {
        ok: true,
        run,
        state: "ROLLBACK_COMPLETED",
        disposition: run.disposition,
      };
    }

    const check = evaluateAuthorityGrant({
      grant: input.grant,
      authority: input.authority,
      actorId: input.actorId,
      scope: "ROLLBACK_MODEL",
      resource: input.resource,
      at: input.at,
    });
    if (!check.allowed) {
      return {
        ok: false,
        run,
        state: run.state,
        code: GovernanceErrorCode.ROLLBACK_AUTHORITY_MISSING,
        message: check.message,
      };
    }
    const readiness = evaluateRollbackReadiness({
      required: true,
      plan: input.rollbackPlan,
      at: input.at,
    });
    if (!readiness.ready) {
      return this.#fail(
        run,
        "ROLLBACK_FAILED",
        input.at,
        GovernanceErrorCode.ROLLBACK_PLAN_REQUIRED,
        readiness.reason,
      );
    }

    emitRollbackTriggered(this.#ledger, {
      eventId: `${run.runId}:rollback-trigger`,
      at: input.at,
      actorId: input.actorId,
      decisionId: run.decision.id,
      provenance: input.provenance,
      idempotencyKey: rollbackKey,
      runId: run.runId,
    });

    let next = transitionRun(run, "ROLLBACK_EXECUTING", input.at, {
      checkpoint: "ROLLBACK_STARTED",
      rollbackIdempotencyKey: rollbackKey,
      rollbackRequestFingerprint: rollbackFingerprint,
    });
    this.#persistRun(next);

    const result = await Promise.resolve(
      input.executeRollback(input.rollbackPlan, run.decision),
    );
    const verification = verifyRollbackOutcome({
      plan: input.rollbackPlan,
      status: result.status,
      verificationResult: result.verificationResult,
    });
    const execution = createRollbackExecution({
      id: input.rollbackExecutionId,
      planId: input.rollbackPlan.id,
      decisionId: run.decision.id,
      status:
        verification.verified && result.status === "COMPLETED"
          ? "COMPLETED"
          : "FAILED",
      createdAt: input.at,
      provenance: input.provenance,
      executedAt: input.at,
    });
    if (!verification.verified) {
      next = transitionRun(next, "ROLLBACK_FAILED", input.at, {
        rollbackExecution: execution,
      });
      this.#persistRun(next);
      return {
        ok: false,
        run: next,
        state: "ROLLBACK_FAILED",
        code:
          result.status === "UNKNOWN"
            ? GovernanceErrorCode.RECONCILIATION_REQUIRED
            : GovernanceErrorCode.ROLLBACK_VERIFICATION_FAILED,
        message: verification.reason,
      };
    }
    next = transitionRun(next, "ROLLBACK_COMPLETED", input.at, {
      rollbackExecution: execution,
    });
    return this.#save(next, next.state, input.at);
  }

  async #continueAfterDecision(
    input: GovernorRunInput,
    run: GovernanceRun,
    decision: Decision,
  ): Promise<GovernorRunResult> {
    const executionAuthority = freshExecutionAuthority({
      grant: input.grant,
      authority: input.authority,
      scope: input.policyVersion.requiredAuthorityScope,
      resource: input.resource,
      at: input.at,
    });
    if (!executionAuthority.allowed) {
      return this.#fail(
        run,
        "BLOCKED",
        input.at,
        GovernanceErrorCode.EXECUTION_AUTHORITY_STALE,
        executionAuthority.message,
      );
    }

    const rollbackReady =
      !decision.rollbackRequired ||
      evaluateRollbackReadiness({
        required: decision.rollbackRequired,
        plan: input.rollbackPlan,
        at: input.at,
      }).ready;

    const actionRequest = createActionRequest({
      id: input.ids.actionRequestId,
      decisionId: decision.id,
      action: input.proposal.action,
      subject: input.proposal.subject,
      requestedAt: input.at,
      createdAt: input.at,
      provenance: input.provenance,
    });

    const authorization = createGovernedActionAuthorization({
      id: input.ids.authorizationId,
      decision,
      actionRequest,
      actionRequestId: actionRequest.id,
      resourceKey: run.resourceKey,
      actorId: input.actor.id,
      executorActorId: input.executorActorId,
      authorityGrantContentHash: input.grant?.contentHash ?? "none",
      policyContentHash: input.policyVersion.contentHash,
      rollbackReady,
      authorizedAt: input.at,
      createdAt: input.at,
      provenance: input.provenance,
    });

    run = transitionRun(run, "ACTION_AUTHORIZED", input.at, {
      actionRequest,
      actionAuthorization: authorization,
      checkpoint: "ACTION_AUTHORIZED",
    });
    emitActionAuthorized(this.#ledger, {
      eventId: `${input.ids.runId}:action-auth`,
      at: input.at,
      actorId: input.actor.id,
      authorization,
      provenance: input.provenance,
      idempotencyKey: input.idempotencyKey,
      runId: input.ids.runId,
    });

    return this.#executeFromAuthorization(
      input,
      run,
      decision,
      authorization,
      actionRequest,
    );
  }

  async #executeFromAuthorization(
    input: GovernorRunInput,
    run: GovernanceRun,
    decision: Decision,
    authorization: ReturnType<typeof createGovernedActionAuthorization>,
    actionRequest: ReturnType<typeof createActionRequest>,
  ): Promise<GovernorRunResult> {
    if (run.actionResult) {
      return this.#evaluateAndDispose(input, run, decision, run.actionResult);
    }

    const executionAuthority = freshExecutionAuthority({
      grant: input.grant,
      authority: input.authority,
      scope: input.policyVersion.requiredAuthorityScope,
      resource: input.resource,
      at: input.at,
    });
    if (!executionAuthority.allowed) {
      return this.#fail(
        run,
        "BLOCKED",
        input.at,
        GovernanceErrorCode.EXECUTION_AUTHORITY_STALE,
        executionAuthority.message,
      );
    }

    const attemptId = run.executionAttempt?.attemptId ?? executionAttemptId(run.runId);
    const storedAttempt = this.#attemptStore?.get(attemptId);
    const priorStatus = storedAttempt?.status ?? run.executionAttempt?.status;
    let reconciledResultRef: string | undefined;
    let attemptVersion = storedAttempt?.version ?? 0;

    if (
      priorStatus === "STARTED" ||
      priorStatus === "IN_DOUBT" ||
      priorStatus === "RECONCILIATION_REQUIRED"
    ) {
      const reconciler = input.adapter.executionReconciler;
      if (!reconciler) {
        if (this.#attemptStore) {
          attemptVersion += 1;
          this.#persistAttempt({
            attemptId,
            runId: run.runId,
            decisionId: decision.id,
            actionRequestId: actionRequest.id,
            authorizationId: authorization.id,
            startedAt: storedAttempt?.startedAt ?? input.at,
            status: "RECONCILIATION_REQUIRED",
            version: attemptVersion,
          });
        }
        return this.#fail(
          run,
          "RECONCILIATION_REQUIRED",
          input.at,
          GovernanceErrorCode.RECONCILIATION_REQUIRED,
          "execution started but completion is unknown; reconciliation required",
        );
      }
      const reconciliation = await Promise.resolve(
        reconciler.reconcile({
          executionAttemptId: attemptId,
          decisionId: decision.id,
          action: input.proposal.action,
          subjectId: input.proposal.subject.id,
        }),
      );
      if (reconciliation === "UNKNOWN") {
        if (this.#attemptStore) {
          attemptVersion += 1;
          this.#persistAttempt({
            attemptId,
            runId: run.runId,
            decisionId: decision.id,
            actionRequestId: actionRequest.id,
            authorizationId: authorization.id,
            startedAt: storedAttempt?.startedAt ?? input.at,
            status: "RECONCILIATION_REQUIRED",
            version: attemptVersion,
          });
        }
        return this.#fail(
          run,
          "RECONCILIATION_REQUIRED",
          input.at,
          GovernanceErrorCode.RECONCILIATION_REQUIRED,
          "external execution effect is unknown; reconciliation required",
        );
      }
      if (reconciliation === "EXECUTED") {
        reconciledResultRef =
          storedAttempt?.resultRef ??
          run.executionAttempt?.resultRef ??
          `${attemptId}:reconciled`;
        if (this.#attemptStore) {
          attemptVersion += 1;
          this.#persistAttempt({
            attemptId,
            runId: run.runId,
            decisionId: decision.id,
            actionRequestId: actionRequest.id,
            authorizationId: authorization.id,
            startedAt: storedAttempt?.startedAt ?? input.at,
            status: "RECONCILED_EXECUTED",
            resultRef: reconciledResultRef,
            version: attemptVersion,
          });
        }
      } else if (this.#attemptStore) {
        attemptVersion += 1;
        this.#persistAttempt({
          attemptId,
          runId: run.runId,
          decisionId: decision.id,
          actionRequestId: actionRequest.id,
          authorizationId: authorization.id,
          startedAt: storedAttempt?.startedAt ?? input.at,
          status: "RECONCILED_NOT_EXECUTED",
          version: attemptVersion,
        });
      }
    }

    if (
      !reconciledResultRef &&
      this.#attemptStore &&
      priorStatus !== "STARTED" &&
      priorStatus !== "PREPARED"
    ) {
      attemptVersion += 1;
      const prepared: DurableExecutionAttempt = {
        attemptId,
        runId: run.runId,
        decisionId: decision.id,
        actionRequestId: actionRequest.id,
        authorizationId: authorization.id,
        startedAt: input.at,
        status: "PREPARED",
        version: attemptVersion,
      };
      this.#persistAttempt(prepared);
      run = transitionRun(run, "ACTION_EXECUTING", input.at, {
        checkpoint: "ACTION_STARTED",
        executionAttempt: prepared,
      });
      this.#persistRun(run);
    }

    if (!reconciledResultRef) {
      attemptVersion += 1;
      const started: DurableExecutionAttempt = {
        attemptId,
        runId: run.runId,
        decisionId: decision.id,
        actionRequestId: actionRequest.id,
        authorizationId: authorization.id,
        startedAt: storedAttempt?.startedAt ?? input.at,
        status: "STARTED",
        version: attemptVersion,
      };
      this.#persistAttempt(started);
      run = transitionRun(run, "ACTION_EXECUTING", input.at, {
        checkpoint: "ACTION_STARTED",
        executionAttempt: started,
      });
      this.#persistRun(run);
    } else {
      run = transitionRun(run, "ACTION_EXECUTING", input.at, {
        checkpoint: "ACTION_STARTED",
        executionAttempt: {
          attemptId,
          startedAt: storedAttempt?.startedAt ?? input.at,
          status: "RECONCILED_EXECUTED",
          resultRef: reconciledResultRef,
        },
      });
    }

    if (this.#replayMode && !reconciledResultRef) {
      return this.#fail(
        run,
        "RECONCILIATION_REQUIRED",
        input.at,
        GovernanceErrorCode.RECONCILIATION_REQUIRED,
        "replay mode cannot invoke external side effects",
      );
    }

    const execution = await executeGovernedAction({
      authorization,
      decision,
      actionRequest,
      actionRequestId: actionRequest.id,
      action: input.proposal.action,
      subject: input.proposal.subject,
      resourceKey: run.resourceKey,
      executorActorId: input.executorActorId,
      executor: input.adapter.actionExecutor,
      actionResultId: input.ids.actionResultId,
      executionAttemptId: attemptId,
      at: input.at,
      provenance: input.provenance,
      alreadyExecuted: Boolean(run.actionResult),
      reconciledResultRef,
    });

    const success = execution.actionResult.status === "EXECUTED";
    if (this.#attemptStore) {
      attemptVersion += 1;
      this.#persistAttempt({
        attemptId,
        runId: run.runId,
        decisionId: decision.id,
        actionRequestId: actionRequest.id,
        authorizationId: authorization.id,
        startedAt: storedAttempt?.startedAt ?? input.at,
        status: success ? "COMPLETED" : "FAILED",
        resultRef: execution.actionResult.resultRef,
        version: attemptVersion,
      });
    }
    run = transitionRun(
      run,
      success ? "ACTION_SUCCEEDED" : "ACTION_FAILED",
      input.at,
      {
        actionResult: execution.actionResult,
        checkpoint: "ACTION_COMPLETED",
        executionAttempt: {
          attemptId,
          startedAt: storedAttempt?.startedAt ?? input.at,
          status: success ? "COMPLETED" : "FAILED",
          resultRef: execution.actionResult.resultRef,
        },
      },
    );
    emitActionExecuted(this.#ledger, {
      eventId: `${input.ids.runId}:action-exec`,
      at: input.at,
      actorId: input.executorActorId,
      actionResult: execution.actionResult,
      provenance: input.provenance,
      idempotencyKey: input.idempotencyKey,
      failed: !success,
      runId: input.ids.runId,
    });

    return this.#evaluateAndDispose(input, run, decision, execution.actionResult);
  }

  async #evaluateAndDispose(
    input: GovernorRunInput,
    run: GovernanceRun,
    decision: Decision,
    actionResult: NonNullable<GovernanceRun["actionResult"]>,
  ): Promise<GovernorRunResult> {
    if (run.outcome && run.evaluation && run.disposition) {
      return this.#save(run, run.state, input.at, run.disposition);
    }

    const outcome = createOutcomeRecord({
      id: input.ids.outcomeId,
      decisionId: decision.id,
      actionResultId: actionResult.id,
      subject: input.proposal.subject,
      kind: outcomeKindFromExecutionStatus(actionResult.status),
      outcomeValue: {
        status: actionResult.status,
        resultRef: actionResult.resultRef ?? null,
      },
      observedAt: input.at,
      createdAt: input.at,
      provenance: input.provenance,
    });
    run = transitionRun(run, "OUTCOME_RECORDED", input.at, {
      outcome,
      checkpoint: "OUTCOME_RECORDED",
    });
    emitOutcomeRecorded(this.#ledger, {
      eventId: `${input.ids.runId}:outcome`,
      at: input.at,
      actorId: input.executorActorId,
      outcome,
      provenance: input.provenance,
      idempotencyKey: input.idempotencyKey,
      runId: input.ids.runId,
    });

    run = transitionRun(run, "EVALUATING", input.at);
    const domainEval = input.adapter.outcomeEvaluator.evaluate({
      decisionId: decision.id,
      outcomeValue: outcome.outcomeValue,
    });
    const verdict = mapDomainVerdict(domainEval.verdict);
    const evaluation = createCoreEvaluation({
      id: input.ids.evaluationId,
      decisionId: decision.id,
      outcomeId: outcome.id,
      evaluatorActorId: input.executorActorId,
      verdict,
      evaluatedAt: input.at,
      rationale: domainEval.rationale,
      createdAt: input.at,
      provenance: input.provenance,
      details: "details" in domainEval ? (domainEval as { details?: JsonSafeMetadata }).details : undefined,
    });

    const disposition = resolveDisposition({
      evaluationVerdict: verdict,
      autonomyMode: input.policyVersion.autonomyMode,
      rollbackRequired: decision.rollbackRequired,
      policyAllowsRollback: input.policyVersion.rollbackRequirements.required,
    });

    run = transitionRun(run, "EVALUATED", input.at, {
      evaluation,
      disposition,
      checkpoint: "EVALUATION_COMPLETED",
    });
    emitEvaluationCompleted(this.#ledger, {
      eventId: `${input.ids.runId}:evaluation`,
      at: input.at,
      actorId: input.executorActorId,
      evaluation,
      disposition,
      provenance: input.provenance,
      idempotencyKey: input.idempotencyKey,
      runId: input.ids.runId,
    });

    const finalState: KernelState =
      disposition === "KEEP"
        ? "KEEP"
        : disposition === "FOLLOW_UP"
          ? "FOLLOW_UP_REQUIRED"
          : disposition === "ROLLBACK"
            ? "ROLLBACK_REQUIRED"
            : "EVALUATED";

    run = transitionRun(run, finalState, input.at, { disposition });
    this.#claims.release(run.resourceKey, run.runId);
    return this.#save(run, finalState, input.at, disposition);
  }

  #save(
    run: GovernanceRun,
    state: KernelState,
    at: IsoTimestamp,
    disposition?: Disposition,
  ): GovernorRunResult {
    const finalRun = transitionRun(run, state, at, {
      disposition,
      checkpoint: checkpointForState(state) ?? run.checkpoint,
    });
    this.#persistRun(finalRun);
    return {
      ok: ![
        "AUTHORITY_DENIED",
        "POLICY_BLOCKED",
        "BLOCKED",
        "ROLLBACK_FAILED",
        "ACTION_FAILED",
        "RECONCILIATION_REQUIRED",
      ].includes(state),
      run: finalRun,
      state,
      disposition,
    };
  }

  #fail(
    run: GovernanceRun,
    state: KernelState,
    at: IsoTimestamp,
    code: string,
    message: string,
  ): GovernorRunResult {
    const finalRun = transitionRun(run, state, at);
    this.#persistRun(finalRun);
    this.#claims.release(finalRun.resourceKey, finalRun.runId);
    return { ok: false, run: finalRun, state, code, message };
  }

  #missingRun(runId: string): GovernorRunResult {
    return {
      ok: false,
      run: freezeDeep({
        runId,
        idempotencyKey: "",
        requestFingerprint: "",
        state: "BLOCKED",
        checkpoint: null,
        resourceKey: "",
        domain: "",
        overrides: [],
        humanApproved: false,
        humanRejected: false,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        provenance: { actorId: "unknown", source: "unknown" },
      }),
      state: "BLOCKED",
      code: GovernanceErrorCode.RECOVERY_INVALID,
      message: `run ${runId} not found`,
    };
  }
}

export function assertInvalidTransition(from: KernelState, to: KernelState): void {
  try {
    assertTransition(from, to);
  } catch {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_STATE_TRANSITION,
      `invalid transition ${from} -> ${to}`,
    );
  }
}
