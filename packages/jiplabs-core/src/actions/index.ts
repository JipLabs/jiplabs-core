import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type { Decision } from "../decisions/index.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  Provenance,
  SubjectRef,
} from "../schema.js";

export type ActionRequest = EntityEnvelope & {
  readonly decisionId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly requestedAt: IsoTimestamp;
  readonly metadata?: JsonSafeMetadata;
};

export type ActionAuthorizationStatus = "AUTHORIZED" | "DENIED" | "PENDING";

export type ActionAuthorization = EntityEnvelope & {
  readonly decisionId: string;
  readonly actionRequestId: string;
  readonly status: ActionAuthorizationStatus;
  readonly authorizedAt: IsoTimestamp;
  readonly reason: string;
};

export type ActionExecutionStatus =
  | "REQUESTED"
  | "AUTHORIZED"
  | "EXECUTED"
  | "FAILED"
  | "BLOCKED";

export type ActionResult = EntityEnvelope & {
  readonly decisionId: string;
  readonly actionRequestId: string;
  readonly authorizationId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly status: ActionExecutionStatus;
  readonly executedAt?: IsoTimestamp;
  readonly resultRef?: string;
  readonly metadata?: JsonSafeMetadata;
};

export function computeActionRequestContentHash(input: {
  readonly decisionId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly metadata?: JsonSafeMetadata;
}): string {
  return sha256Canonical({
    decisionId: input.decisionId,
    action: input.action,
    subject: input.subject,
    metadata: input.metadata ?? null,
  });
}

export function createActionRequest(input: {
  readonly id: string;
  readonly decisionId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly requestedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
}): ActionRequest {
  return freezeDeep({
    ...envelope(input),
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    action: requireNonEmpty(input.action, "action"),
    subject: freezeDeep({ ...input.subject }),
    requestedAt: requireIsoTimestamp(input.requestedAt, "requestedAt"),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function authorizeAction(input: {
  readonly id: string;
  readonly decision: Decision;
  readonly actionRequest: ActionRequest;
  readonly at: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): ActionAuthorization {
  if (input.decision.id !== input.actionRequest.decisionId) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "action request does not reference the decision",
    );
  }
  if (input.decision.status === "BLOCKED") {
    throw new GovernanceError(
      GovernanceErrorCode.ACTION_NOT_AUTHORIZED,
      "blocked decisions cannot authorize actions",
    );
  }
  if (input.decision.humanApprovalRequired && input.decision.status !== "AUTHORIZED") {
    throw new GovernanceError(
      GovernanceErrorCode.HUMAN_APPROVAL_REQUIRED,
      "human approval is required before action authorization",
    );
  }
  if (
    input.decision.rollbackRequired &&
    !input.decision.rollbackPlanId &&
    input.decision.status === "DECIDED"
  ) {
    throw new GovernanceError(
      GovernanceErrorCode.ROLLBACK_PLAN_REQUIRED,
      "rollback-required decisions must reference a rollback plan",
    );
  }
  return freezeDeep({
    ...envelope({
      id: input.id,
      createdAt: input.createdAt,
      recordedAt: input.recordedAt,
      provenance: input.provenance,
    }),
    decisionId: input.decision.id,
    actionRequestId: input.actionRequest.id,
    status: "AUTHORIZED" as const,
    authorizedAt: requireIsoTimestamp(input.at, "at"),
    reason: "decision authorized action execution",
  });
}

export function createActionResult(input: {
  readonly id: string;
  readonly decisionId: string;
  readonly actionRequestId: string;
  readonly authorizationId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly status: ActionExecutionStatus;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly executedAt?: IsoTimestamp;
  readonly resultRef?: string;
  readonly metadata?: JsonSafeMetadata;
}): ActionResult {
  return freezeDeep({
    ...envelope(input),
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    actionRequestId: requireNonEmpty(input.actionRequestId, "actionRequestId"),
    authorizationId: requireNonEmpty(input.authorizationId, "authorizationId"),
    action: requireNonEmpty(input.action, "action"),
    subject: freezeDeep({ ...input.subject }),
    status: input.status,
    ...(input.executedAt ? { executedAt: input.executedAt } : {}),
    ...(input.resultRef ? { resultRef: input.resultRef } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}
