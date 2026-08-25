import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import type { IsoTimestamp } from "../schema.js";

export type ExecutionClaim = {
  readonly resourceKey: string;
  readonly runId: string;
  readonly holderActorId: string;
  readonly acquiredAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
};

export interface ExecutionClaimStore {
  get(resourceKey: string): ExecutionClaim | undefined;
  tryAcquire(input: ExecutionClaim): boolean;
  release(resourceKey: string, runId: string): void;
}

export class InMemoryExecutionClaimStore implements ExecutionClaimStore {
  readonly #claims = new Map<string, ExecutionClaim>();

  get(resourceKey: string): ExecutionClaim | undefined {
    const claim = this.#claims.get(resourceKey);
    if (!claim) return undefined;
    if (Date.parse(claim.expiresAt) <= Date.now()) {
      this.#claims.delete(resourceKey);
      return undefined;
    }
    return claim;
  }

  tryAcquire(input: ExecutionClaim): boolean {
    const existing = this.get(input.resourceKey);
    if (existing && existing.runId !== input.runId) {
      return false;
    }
    this.#claims.set(input.resourceKey, Object.freeze({ ...input }));
    return true;
  }

  release(resourceKey: string, runId: string): void {
    const existing = this.#claims.get(resourceKey);
    if (existing?.runId === runId) {
      this.#claims.delete(resourceKey);
    }
  }
}

export function assertClaimAvailable(
  store: ExecutionClaimStore,
  resourceKey: string,
  runId: string,
): void {
  const claim = store.get(resourceKey);
  if (claim && claim.runId !== runId) {
    throw new GovernanceError(
      GovernanceErrorCode.EXECUTION_CLAIM_HELD,
      `resource ${resourceKey} is held by run ${claim.runId}`,
    );
  }
}
