import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type { Decision } from "../decisions/index.js";
import type { AutonomyMode } from "../policies/index.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  Provenance,
} from "../schema.js";

export type GovernedActionAuthorization = EntityEnvelope & {
  readonly decisionId: string;
  readonly actionRequestId: string;
  readonly actorId: string;
  readonly executorActorId: string;
  readonly authorityRef: string;
  readonly authorityCode: string;
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
  readonly actorId: string;
  readonly executorActorId: string;
  readonly authorityRef: string;
  readonly authorityCode: string;
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
  readonly actionRequestId: string;
  readonly actorId: string;
  readonly executorActorId: string;
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
  const body = {
    decisionId: input.decision.id,
    actionRequestId: requireNonEmpty(input.actionRequestId, "actionRequestId"),
    actorId: requireNonEmpty(input.actorId, "actorId"),
    executorActorId: requireNonEmpty(
      input.executorActorId,
      "executorActorId",
    ),
    authorityRef: input.decision.authorityRef,
    authorityCode: input.decision.authorityCode,
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
