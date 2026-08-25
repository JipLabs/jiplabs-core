export type KernelState =
  | "PROPOSAL_RECEIVED"
  | "AUTHORITY_CHECKING"
  | "AUTHORITY_DENIED"
  | "POLICY_EVALUATING"
  | "POLICY_BLOCKED"
  | "DECISION_MADE"
  | "WAITING_HUMAN_APPROVAL"
  | "ACTION_AUTHORIZED"
  | "ACTION_EXECUTING"
  | "ACTION_SUCCEEDED"
  | "ACTION_FAILED"
  | "OUTCOME_RECORDED"
  | "EVALUATING"
  | "EVALUATED"
  | "KEEP"
  | "FOLLOW_UP_REQUIRED"
  | "ROLLBACK_REQUIRED"
  | "ROLLBACK_EXECUTING"
  | "ROLLBACK_COMPLETED"
  | "ROLLBACK_FAILED"
  | "BLOCKED";

const TRANSITIONS: Readonly<Record<KernelState, readonly KernelState[]>> = {
  PROPOSAL_RECEIVED: ["AUTHORITY_CHECKING", "BLOCKED"],
  AUTHORITY_CHECKING: ["AUTHORITY_DENIED", "POLICY_EVALUATING", "BLOCKED"],
  AUTHORITY_DENIED: [],
  POLICY_EVALUATING: ["POLICY_BLOCKED", "DECISION_MADE", "BLOCKED"],
  POLICY_BLOCKED: [],
  DECISION_MADE: [
    "WAITING_HUMAN_APPROVAL",
    "ACTION_AUTHORIZED",
    "BLOCKED",
    "KEEP",
  ],
  WAITING_HUMAN_APPROVAL: [
    "ACTION_AUTHORIZED",
    "BLOCKED",
    "KEEP",
  ],
  ACTION_AUTHORIZED: ["ACTION_EXECUTING", "BLOCKED"],
  ACTION_EXECUTING: ["ACTION_SUCCEEDED", "ACTION_FAILED", "BLOCKED"],
  ACTION_SUCCEEDED: ["OUTCOME_RECORDED"],
  ACTION_FAILED: ["OUTCOME_RECORDED"],
  OUTCOME_RECORDED: ["EVALUATING"],
  EVALUATING: ["EVALUATED"],
  EVALUATED: [
    "KEEP",
    "FOLLOW_UP_REQUIRED",
    "ROLLBACK_REQUIRED",
    "BLOCKED",
  ],
  KEEP: [],
  FOLLOW_UP_REQUIRED: [],
  ROLLBACK_REQUIRED: ["ROLLBACK_EXECUTING", "BLOCKED"],
  ROLLBACK_EXECUTING: ["ROLLBACK_COMPLETED", "ROLLBACK_FAILED"],
  ROLLBACK_COMPLETED: [],
  ROLLBACK_FAILED: [],
  BLOCKED: [],
};

export function canTransition(from: KernelState, to: KernelState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: KernelState, to: KernelState): void {
  if (!canTransition(from, to)) {
    throw new Error(`invalid kernel transition: ${from} -> ${to}`);
  }
}

export type RecoveryCheckpoint =
  | "DECISION_MADE"
  | "ACTION_AUTHORIZED"
  | "ACTION_STARTED"
  | "ACTION_COMPLETED"
  | "OUTCOME_RECORDED"
  | "EVALUATION_COMPLETED"
  | "ROLLBACK_STARTED";

export function checkpointForState(state: KernelState): RecoveryCheckpoint | null {
  switch (state) {
    case "DECISION_MADE":
    case "WAITING_HUMAN_APPROVAL":
      return "DECISION_MADE";
    case "ACTION_AUTHORIZED":
      return "ACTION_AUTHORIZED";
    case "ACTION_EXECUTING":
      return "ACTION_STARTED";
    case "ACTION_SUCCEEDED":
    case "ACTION_FAILED":
      return "ACTION_COMPLETED";
    case "OUTCOME_RECORDED":
      return "OUTCOME_RECORDED";
    case "EVALUATED":
    case "KEEP":
    case "FOLLOW_UP_REQUIRED":
    case "ROLLBACK_REQUIRED":
      return "EVALUATION_COMPLETED";
    case "ROLLBACK_EXECUTING":
      return "ROLLBACK_STARTED";
    default:
      return null;
  }
}
