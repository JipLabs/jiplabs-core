import type { ExecutionClaimStore } from "../concurrency/index.js";
import type { GovernanceLedger } from "../ledger/index.js";
import type { GovernanceRunStore } from "../governor/runtime-state.js";
import type { DurableExecutionAttempt } from "../governor/runtime-state.js";

export interface ExecutionAttemptStore {
  get(attemptId: string): DurableExecutionAttempt | undefined;
  getByRunId(runId: string): DurableExecutionAttempt | undefined;
  save(attempt: DurableExecutionAttempt): void;
}

export interface GovernanceUnitOfWork {
  runInTransaction<T>(work: () => T): T;
}

export interface GovernanceStorageBundle {
  readonly ledger: GovernanceLedger;
  readonly runStore: GovernanceRunStore;
  readonly claimStore: ExecutionClaimStore;
  readonly attemptStore: ExecutionAttemptStore;
  readonly unitOfWork: GovernanceUnitOfWork;
  readonly corpusStore?: import("../evaluation-corpus/contracts.js").EvaluationCorpusStore;
  readonly componentStore?: import("../component-governance/contracts.js").GovernedComponentRegistryStore;
  close(): void;
}

export type GovernanceLedgerStore = GovernanceLedger;
