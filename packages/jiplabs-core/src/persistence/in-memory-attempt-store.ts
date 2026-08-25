import type { DurableExecutionAttempt } from "../governor/runtime-state.js";
import type { ExecutionAttemptStore } from "./interfaces.js";
import { deserializeGovernanceRecord, serializeGovernanceRecord } from "./serialization.js";

export class InMemoryExecutionAttemptStore implements ExecutionAttemptStore {
  readonly #byAttemptId = new Map<string, DurableExecutionAttempt>();
  readonly #byRunId = new Map<string, string>();

  get(attemptId: string): DurableExecutionAttempt | undefined {
    return this.#byAttemptId.get(attemptId);
  }

  getByRunId(runId: string): DurableExecutionAttempt | undefined {
    const attemptId = this.#byRunId.get(runId);
    return attemptId ? this.#byAttemptId.get(attemptId) : undefined;
  }

  save(attempt: DurableExecutionAttempt): void {
    const serialized = serializeGovernanceRecord(attempt);
    const stored = Object.freeze(
      deserializeGovernanceRecord<DurableExecutionAttempt>(serialized),
    );
    this.#byAttemptId.set(stored.attemptId, stored);
    this.#byRunId.set(stored.runId, stored.attemptId);
  }
}
