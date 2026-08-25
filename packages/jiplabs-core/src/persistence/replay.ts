import { buildDecisionTrace, type DecisionTrace } from "../trace/index.js";
import type { GovernanceRun, GovernanceRunStore } from "../governor/runtime-state.js";
import type { GovernanceLedger } from "../ledger/index.js";
import type { PolicyVersion } from "../policies/index.js";
import type { Evidence } from "../evidence/index.js";
import type { SqliteGovernanceLedger } from "./sqlite/storage.js";

export type GovernanceReplayInput = {
  readonly runId: string;
  readonly runStore: GovernanceRunStore;
  readonly ledger: GovernanceLedger;
  readonly policyVersion: PolicyVersion;
  readonly evidence: readonly Evidence[];
};

export type GovernanceReplayResult = {
  readonly run: GovernanceRun;
  readonly trace: DecisionTrace;
  readonly ledgerEvents: readonly import("../ledger/index.js").GovernanceEvent[];
  readonly replayMode: true;
};

export function replayGovernanceRun(input: GovernanceReplayInput): GovernanceReplayResult {
  const run = input.runStore.get(input.runId);
  if (!run?.decision || !run.explanation || !run.proposal) {
    throw new Error(`run ${input.runId} is not reconstructable for replay`);
  }
  const ledgerEvents =
    "listForRun" in input.ledger
      ? (input.ledger as SqliteGovernanceLedger).listForRun(input.runId)
      : input.ledger.list().filter((event) => {
          const runId = (event.metadata as { runId?: string } | undefined)?.runId;
          return runId === input.runId;
        });
  const trace = buildDecisionTrace({
    id: `${run.runId}:trace`,
    decisionId: run.decision.id,
    createdAt: run.decision.createdAt,
    provenance: run.provenance,
    proposal: run.proposal,
    decision: run.decision,
    explanation: run.explanation,
    policyVersion: input.policyVersion,
    evidence: input.evidence,
    actionRequest: run.actionRequest,
    actionAuthorization: run.actionAuthorization,
    actionResult: run.actionResult,
    outcome: run.outcome,
    evaluation: run.evaluation,
    disposition: run.disposition,
    rollbackExecution: run.rollbackExecution,
    ledgerEvents,
  });
  return { run, trace, ledgerEvents, replayMode: true as const };
}

export function reconstructRunFromStore(
  runStore: GovernanceRunStore,
  runId: string,
): GovernanceRun | undefined {
  return runStore.get(runId);
}
