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

export type GovernanceRun = {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly state: KernelState;
  readonly checkpoint: RecoveryCheckpoint | null;
  readonly resourceKey: string;
  readonly domain: string;
  readonly proposal?: DecisionProposal;
  readonly decision?: Decision;
  readonly explanation?: DecisionExplanation;
  readonly actionRequest?: ActionRequest;
  readonly actionAuthorization?: GovernedActionAuthorization;
  readonly actionResult?: ActionResult;
  readonly outcome?: OutcomeRecord;
  readonly evaluation?: CoreEvaluation;
  readonly disposition?: Disposition;
  readonly rollbackExecution?: RollbackExecution;
  readonly overrides: readonly Override[];
  readonly humanApproved: boolean;
  readonly humanRejected: boolean;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
};

export interface GovernanceRunStore {
  get(runId: string): GovernanceRun | undefined;
  getByIdempotencyKey(key: string): GovernanceRun | undefined;
  save(run: GovernanceRun): void;
}

export class InMemoryGovernanceRunStore implements GovernanceRunStore {
  readonly #byRunId = new Map<string, GovernanceRun>();
  readonly #byIdempotency = new Map<string, string>();

  get(runId: string): GovernanceRun | undefined {
    return this.#byRunId.get(runId);
  }

  getByIdempotencyKey(key: string): GovernanceRun | undefined {
    const runId = this.#byIdempotency.get(key);
    return runId ? this.#byRunId.get(runId) : undefined;
  }

  save(run: GovernanceRun): void {
    const existingKey = this.#byIdempotency.get(run.idempotencyKey);
    if (existingKey && existingKey !== run.runId) {
      throw new GovernanceError(
        GovernanceErrorCode.LEDGER_IDEMPOTENCY_CONFLICT,
        `idempotency key ${run.idempotencyKey} already bound to run ${existingKey}`,
      );
    }
    this.#byRunId.set(run.runId, Object.freeze(structuredClone(run)));
    this.#byIdempotency.set(run.idempotencyKey, run.runId);
  }
}

export function createInitialRun(input: {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly resourceKey: string;
  readonly domain: string;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
}): GovernanceRun {
  return Object.freeze({
    runId: input.runId,
    idempotencyKey: input.idempotencyKey,
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
