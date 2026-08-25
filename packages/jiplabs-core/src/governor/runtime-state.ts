import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import type { GovernedActionAuthorization } from "../authorization/index.js";
import type { ActionRequest, ActionResult } from "../actions/index.js";
import type { Decision, DecisionExplanation, DecisionProposal } from "../decisions/index.js";
import type { Disposition } from "../disposition/index.js";
import type { CoreEvaluation } from "../evaluation/index.js";
import type { OutcomeRecord } from "../outcomes/index.js";
import type { Override } from "../override/index.js";
import type { RollbackExecution } from "../rollback/index.js";
import type { KernelState, RecoveryCheckpoint } from "./states.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance } from "../schema.js";

export type ExecutionAttempt = {
  readonly attemptId: string;
  readonly startedAt: IsoTimestamp;
  readonly status: "STARTED" | "COMPLETED" | "IN_DOUBT";
  readonly resultRef?: string;
};

export type GovernanceRun = {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly state: KernelState;
  readonly checkpoint: RecoveryCheckpoint | null;
  readonly resourceKey: string;
  readonly domain: string;
  readonly proposal?: DecisionProposal;
  readonly decision?: Decision;
  readonly explanation?: DecisionExplanation;
  readonly actionRequest?: ActionRequest;
  readonly actionAuthorization?: GovernedActionAuthorization;
  readonly executionAttempt?: ExecutionAttempt;
  readonly actionResult?: ActionResult;
  readonly outcome?: OutcomeRecord;
  readonly evaluation?: CoreEvaluation;
  readonly disposition?: Disposition;
  readonly rollbackExecution?: RollbackExecution;
  readonly rollbackIdempotencyKey?: string;
  readonly rollbackRequestFingerprint?: string;
  readonly overrides: readonly Override[];
  readonly humanApproved: boolean;
  readonly humanRejected: boolean;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
};

export type IdempotencyBinding = {
  readonly runId: string;
  readonly fingerprint: string;
};

export interface GovernanceRunStore {
  get(runId: string): GovernanceRun | undefined;
  getByIdempotencyKey(key: string): GovernanceRun | undefined;
  getIdempotencyBinding(key: string): IdempotencyBinding | undefined;
  save(run: GovernanceRun): void;
}

export class InMemoryGovernanceRunStore implements GovernanceRunStore {
  readonly #byRunId = new Map<string, GovernanceRun>();
  readonly #byIdempotency = new Map<string, IdempotencyBinding>();

  get(runId: string): GovernanceRun | undefined {
    return this.#byRunId.get(runId);
  }

  getByIdempotencyKey(key: string): GovernanceRun | undefined {
    const binding = this.#byIdempotency.get(key);
    return binding ? this.#byRunId.get(binding.runId) : undefined;
  }

  getIdempotencyBinding(key: string): IdempotencyBinding | undefined {
    return this.#byIdempotency.get(key);
  }

  save(run: GovernanceRun): void {
    const existing = this.#byIdempotency.get(run.idempotencyKey);
    if (existing) {
      if (existing.runId !== run.runId) {
        throw new GovernanceError(
          GovernanceErrorCode.LEDGER_IDEMPOTENCY_CONFLICT,
          `idempotency key ${run.idempotencyKey} already bound to run ${existing.runId}`,
        );
      }
      if (
        run.requestFingerprint &&
        existing.fingerprint &&
        existing.fingerprint !== run.requestFingerprint
      ) {
        throw new GovernanceError(
          GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
          `idempotency key ${run.idempotencyKey} bound to a different request fingerprint`,
        );
      }
    }
    if (run.rollbackIdempotencyKey && run.rollbackRequestFingerprint) {
      const rollbackBinding = this.#byIdempotency.get(run.rollbackIdempotencyKey);
      if (rollbackBinding) {
        if (rollbackBinding.runId !== run.runId) {
          throw new GovernanceError(
            GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
            `rollback idempotency key ${run.rollbackIdempotencyKey} already bound to another run`,
          );
        }
        if (rollbackBinding.fingerprint !== run.rollbackRequestFingerprint) {
          throw new GovernanceError(
            GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
            `rollback idempotency key ${run.rollbackIdempotencyKey} bound to a different rollback fingerprint`,
          );
        }
      } else {
        this.#byIdempotency.set(run.rollbackIdempotencyKey, {
          runId: run.runId,
          fingerprint: run.rollbackRequestFingerprint,
        });
      }
    }
    this.#byRunId.set(run.runId, Object.freeze(structuredClone(run)));
    if (run.requestFingerprint) {
      this.#byIdempotency.set(run.idempotencyKey, {
        runId: run.runId,
        fingerprint: run.requestFingerprint,
      });
    }
  }
}

export function createInitialRun(input: {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly resourceKey: string;
  readonly domain: string;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
}): GovernanceRun {
  return Object.freeze({
    runId: input.runId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    state: "PROPOSAL_RECEIVED" as const,
    checkpoint: null,
    resourceKey: input.resourceKey,
    domain: input.domain,
    overrides: Object.freeze([]),
    humanApproved: false,
    humanRejected: false,
    createdAt: input.at,
    updatedAt: input.at,
    provenance: input.provenance,
  });
}

export function transitionRun(
  run: GovernanceRun,
  nextState: KernelState,
  at: IsoTimestamp,
  patch: Partial<Omit<GovernanceRun, "runId" | "idempotencyKey" | "createdAt">> = {},
): GovernanceRun {
  return Object.freeze({
    ...run,
    ...patch,
    state: nextState,
    checkpoint: patch.checkpoint ?? run.checkpoint,
    updatedAt: at,
  });
}
