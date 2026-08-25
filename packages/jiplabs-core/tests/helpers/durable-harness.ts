import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GovernorKernel,
  openNodeSqliteGovernanceStorage,
  type GovernanceRun,
  type GovernanceRunStore,
  type SqliteGovernanceStorage,
} from "../../src/index.js";
import {
  activeGrant,
  activePolicy,
  AT,
  baseActor,
  baseAuthority,
  buildAdapter,
  buildHarness,
  buildProposal,
  governorIds,
  passEvidence,
  PROVENANCE,
  rollbackPlan,
  TEST_RESOURCE,
  verifiedRollbackOutcome,
} from "./governor-harness.js";
import { createAuthority, createAuthorityGrant } from "../../src/index.js";

export function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "jiplabs-core-"));
  return join(dir, `${randomUUID()}.db`);
}

export function cleanupTempDb(path: string): void {
  try {
    rmSync(path, { force: true });
    rmSync(join(path, ".."), { recursive: true, force: true });
  } catch {
    // best effort cleanup for tests
  }
}

export type DurableContext = {
  readonly path: string;
  readonly storage: SqliteGovernanceStorage;
  readonly kernel: GovernorKernel;
  close(): void;
};

export function openDurableContext(dbPath = createTempDbPath()): DurableContext {
  const storage = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
  const kernel = new GovernorKernel({
    ledger: storage.ledger,
    runStore: storage.runStore,
    claimStore: storage.claimStore,
    attemptStore: storage.attemptStore,
    unitOfWork: storage.unitOfWork,
  });
  return {
    path: dbPath,
    storage,
    kernel,
    close: () => storage.close(),
  };
}

export function reopenDurableContext(path: string): DurableContext {
  const storage = openNodeSqliteGovernanceStorage({ path, appliedAt: AT });
  const kernel = new GovernorKernel({
    ledger: storage.ledger,
    runStore: storage.runStore,
    claimStore: storage.claimStore,
    attemptStore: storage.attemptStore,
    unitOfWork: storage.unitOfWork,
  });
  return {
    path,
    storage,
    kernel,
    close: () => storage.close(),
  };
}

export function durableRunInput(options: {
  runId?: string;
  idempotencyKey?: string;
  adapter?: ReturnType<typeof buildAdapter>;
  policy?: ReturnType<typeof activePolicy>;
  rollbackPlan?: ReturnType<typeof rollbackPlan> | null;
} = {}) {
  const harness = buildHarness({
    runId: options.runId,
    idempotencyKey: options.idempotencyKey,
    adapter: options.adapter,
    policy: options.policy,
    rollbackPlan: options.rollbackPlan,
  });
  return harness;
}

export class ThrowingRunStore implements GovernanceRunStore {
  readonly #inner: GovernanceRunStore;
  readonly #throwOnSave: boolean;
  saveCalls = 0;

  constructor(inner: GovernanceRunStore, throwOnSave = true) {
    this.#inner = inner;
    this.#throwOnSave = throwOnSave;
  }

  get(runId: string): GovernanceRun | undefined {
    return this.#inner.get(runId);
  }

  getByIdempotencyKey(key: string): GovernanceRun | undefined {
    return this.#inner.getByIdempotencyKey(key);
  }

  getIdempotencyBinding(key: string) {
    return this.#inner.getIdempotencyBinding(key);
  }

  save(run: GovernanceRun): void {
    this.saveCalls += 1;
    if (this.#throwOnSave && this.saveCalls > 1) {
      throw new Error("simulated persistence failure");
    }
    this.#inner.save(run);
  }
}

export {
  activeGrant,
  activePolicy,
  AT,
  baseActor,
  baseAuthority,
  buildAdapter,
  buildProposal,
  governorIds,
  passEvidence,
  PROVENANCE,
  rollbackPlan,
  TEST_RESOURCE,
  verifiedRollbackOutcome,
};
