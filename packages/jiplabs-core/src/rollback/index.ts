import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  Provenance,
  SubjectRef,
} from "../schema.js";

export type RollbackVerification = {
  readonly kind: string;
  readonly expected: string;
};

export type RollbackCompensation = {
  readonly required: boolean;
  readonly action?: string;
  readonly reason?: string;
};

export type RollbackPlan = EntityEnvelope & {
  readonly rollbackTarget: SubjectRef;
  readonly preconditions: readonly string[];
  readonly rollbackAction: string;
  readonly verification: RollbackVerification;
  readonly maximumRollbackWindow: IsoTimestamp;
  readonly compensation?: RollbackCompensation;
};

export type RollbackExecutionStatus =
  | "PLANNED"
  | "TRIGGERED"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type RollbackExecution = EntityEnvelope & {
  readonly planId: string;
  readonly decisionId: string;
  readonly status: RollbackExecutionStatus;
  readonly executedAt?: IsoTimestamp;
};

export type RollbackReadiness =
  | { readonly ready: true; readonly planId: string }
  | { readonly ready: false; readonly reason: string };

export function createRollbackPlan(input: {
  readonly id: string;
  readonly rollbackTarget: SubjectRef;
  readonly preconditions: readonly string[];
  readonly rollbackAction: string;
  readonly verification: RollbackVerification;
  readonly maximumRollbackWindow: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly compensation?: RollbackCompensation;
}): RollbackPlan {
  return freezeDeep({
    ...envelope(input),
    rollbackTarget: freezeDeep({ ...input.rollbackTarget }),
    preconditions: Object.freeze([...input.preconditions]),
    rollbackAction: requireNonEmpty(input.rollbackAction, "rollbackAction"),
    verification: freezeDeep({ ...input.verification }),
    maximumRollbackWindow: requireIsoTimestamp(
      input.maximumRollbackWindow,
      "maximumRollbackWindow",
    ),
    ...(input.compensation
      ? { compensation: freezeDeep({ ...input.compensation }) }
      : {}),
  });
}

export function evaluateRollbackReadiness(input: {
  readonly required: boolean;
  readonly plan: RollbackPlan | null | undefined;
  readonly at: IsoTimestamp;
}): RollbackReadiness {
  if (!input.required) {
    return input.plan
      ? { ready: true, planId: input.plan.id }
      : { ready: true, planId: "not-required" };
  }
  if (!input.plan) {
    return {
      ready: false,
      reason: "rollback is required but no rollback plan was provided",
    };
  }
  if (Date.parse(input.at) > Date.parse(input.plan.maximumRollbackWindow)) {
    return {
      ready: false,
      reason: `rollback plan ${input.plan.id} exceeded its maximum window`,
    };
  }
  if (!input.plan.rollbackAction.trim() || !input.plan.rollbackTarget.id) {
    return {
      ready: false,
      reason: `rollback plan ${input.plan.id} is incomplete`,
    };
  }
  return { ready: true, planId: input.plan.id };
}

export function verifyRollbackOutcome(input: {
  readonly plan: RollbackPlan;
  readonly status: "COMPLETED" | "FAILED" | "UNKNOWN";
  readonly verificationResult?: { readonly kind: string; readonly actual: string };
}): { readonly verified: true } | { readonly verified: false; readonly reason: string } {
  if (input.status !== "COMPLETED") {
    return {
      verified: false,
      reason: `rollback status is ${input.status}, not COMPLETED`,
    };
  }
  if (!input.verificationResult) {
    return {
      verified: false,
      reason: "rollback verification result is required",
    };
  }
  if (input.verificationResult.kind !== input.plan.verification.kind) {
    return {
      verified: false,
      reason: "rollback verification kind mismatch",
    };
  }
  if (input.verificationResult.actual !== input.plan.verification.expected) {
    return {
      verified: false,
      reason: `rollback verification expected ${input.plan.verification.expected}, got ${input.verificationResult.actual}`,
    };
  }
  return { verified: true };
}

export function createRollbackExecution(input: {
  readonly id: string;
  readonly planId: string;
  readonly decisionId: string;
  readonly status: RollbackExecutionStatus;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly executedAt?: IsoTimestamp;
}): RollbackExecution {
  return freezeDeep({
    ...envelope(input),
    planId: requireNonEmpty(input.planId, "planId"),
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    status: input.status,
    ...(input.executedAt ? { executedAt: input.executedAt } : {}),
  });
}
