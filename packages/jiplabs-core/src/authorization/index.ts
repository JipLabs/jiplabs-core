import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import {
  computeActionRequestContentHash,
  type ActionRequest,
} from "../actions/index.js";
import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type { Decision } from "../decisions/index.js";
import type { AutonomyMode } from "../policies/index.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  Provenance,
  SubjectRef,
} from "../schema.js";

export type GovernedActionAuthorization = EntityEnvelope & {
  readonly decisionId: string;
  readonly actionRequestId: string;
  readonly actionRequestContentHash: string;
  readonly resourceKey: string;
  readonly actorId: string;
  readonly executorActorId: string;
  readonly authorityRef: string;
  readonly authorityCode: string;
  readonly authorityGrantContentHash: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly autonomyMode: AutonomyMode;
  readonly rollbackReady: boolean;
  readonly authorizedAt: IsoTimestamp;
  readonly authorizationHash: string;
  readonly status: "AUTHORIZED" | "DENIED";
  readonly reason: string;
};

function authorizationPayload(input: {
  readonly decisionId: string;
  readonly actionRequestId: string;
  readonly actionRequestContentHash: string;
  readonly resourceKey: string;
  readonly actorId: string;
  readonly executorActorId: string;
  readonly authorityRef: string;
  readonly authorityCode: string;
  readonly authorityGrantContentHash: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly autonomyMode: AutonomyMode;
  readonly rollbackReady: boolean;
  readonly authorizedAt: IsoTimestamp;
}): unknown {
  return input;
}

export function createGovernedActionAuthorization(input: {
  readonly id: string;
  readonly decision: Decision;
  readonly actionRequest: ActionRequest;
  readonly actionRequestId: string;
  readonly resourceKey: string;
  readonly actorId: string;
  readonly executorActorId: string;
  readonly authorityGrantContentHash: string;
  readonly policyContentHash: string;
  readonly rollbackReady: boolean;
  readonly authorizedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly reason?: string;
}): GovernedActionAuthorization {
  if (input.decision.status === "BLOCKED") {
    throw new GovernanceError(
      GovernanceErrorCode.ACTION_NOT_AUTHORIZED,
      "blocked decisions cannot produce action authorization",
    );
  }
  if (
    input.decision.humanApprovalRequired &&
    input.decision.status !== "AUTHORIZED"
  ) {
    throw new GovernanceError(
      GovernanceErrorCode.HUMAN_APPROVAL_REQUIRED,
      "human approval required before action authorization",
    );
  }
  if (input.decision.rollbackRequired && !input.rollbackReady) {
    throw new GovernanceError(
      GovernanceErrorCode.ROLLBACK_PLAN_REQUIRED,
      "rollback readiness required for authorization",
    );
  }
  const actionRequestContentHash = computeActionRequestContentHash({
    decisionId: input.actionRequest.decisionId,
    action: input.actionRequest.action,
    subject: input.actionRequest.subject,
    metadata: input.actionRequest.metadata,
  });
  const body = {
    decisionId: input.decision.id,
    actionRequestId: requireNonEmpty(input.actionRequestId, "actionRequestId"),
    actionRequestContentHash,
    resourceKey: requireNonEmpty(input.resourceKey, "resourceKey"),
    actorId: requireNonEmpty(input.actorId, "actorId"),
    executorActorId: requireNonEmpty(
      input.executorActorId,
      "executorActorId",
    ),
    authorityRef: input.decision.authorityRef,
    authorityCode: input.decision.authorityCode,
    authorityGrantContentHash: requireNonEmpty(
      input.authorityGrantContentHash,
      "authorityGrantContentHash",
    ),
    policyId: input.decision.policyRef,
    policyVersion: input.decision.policyVersion,
    policyContentHash: requireNonEmpty(
      input.policyContentHash,
      "policyContentHash",
    ),
    autonomyMode: input.decision.autonomyMode,
    rollbackReady: input.rollbackReady,
    authorizedAt: requireIsoTimestamp(input.authorizedAt, "authorizedAt"),
    status: "AUTHORIZED" as const,
    reason: input.reason ?? "governed action authorized",
  };
  return freezeDeep({
    ...envelope(input),
    ...body,
    authorizationHash: sha256Canonical(authorizationPayload(body)),
  });
}

export function assertValidForExecution(
  authorization: GovernedActionAuthorization | null | undefined,
  decisionId: string,
): asserts authorization is GovernedActionAuthorization {
  if (!authorization || authorization.status !== "AUTHORIZED") {
    throw new GovernanceError(
      GovernanceErrorCode.ACTION_NOT_AUTHORIZED,
      "valid governed action authorization is required for execution",
    );
  }
  if (authorization.decisionId !== decisionId) {
    throw new GovernanceError(
      GovernanceErrorCode.ACTION_NOT_AUTHORIZED,
      "authorization decision reference mismatch",
    );
  }
}

export function assertAuthorizationBinding(input: {
  readonly authorization: GovernedActionAuthorization;
  readonly actionRequest: ActionRequest;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly executorActorId: string;
  readonly resourceKey: string;
}): void {
  assertValidForExecution(input.authorization, input.actionRequest.decisionId);
  const expectedHash = computeActionRequestContentHash({
    decisionId: input.actionRequest.decisionId,
    action: input.actionRequest.action,
    subject: input.actionRequest.subject,
    metadata: input.actionRequest.metadata,
  });
  if (input.authorization.actionRequestContentHash !== expectedHash) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORIZATION_BINDING_MISMATCH,
      "authorization action request content hash mismatch",
    );
  }
  if (input.authorization.actionRequestId !== input.actionRequest.id) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORIZATION_BINDING_MISMATCH,
      "authorization action request id mismatch",
    );
  }
  if (input.authorization.resourceKey !== input.resourceKey) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORIZATION_BINDING_MISMATCH,
      "authorization resource binding mismatch",
    );
  }
  if (input.authorization.executorActorId !== input.executorActorId) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORIZATION_BINDING_MISMATCH,
      "authorization executor binding mismatch",
    );
  }
  if (input.actionRequest.action !== input.action) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORIZATION_BINDING_MISMATCH,
      "action request action mismatch",
    );
  }
  if (
    input.actionRequest.subject.id !== input.subject.id ||
    input.actionRequest.subject.domain !== input.subject.domain
  ) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORIZATION_BINDING_MISMATCH,
      "action request subject mismatch",
    );
  }
}
