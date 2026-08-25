import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import {
  evaluateAuthorityGrant,
  type Authority,
  type AuthorityGrant,
} from "../authority/index.js";
import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import type { Decision } from "../decisions/index.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  Provenance,
  ResourceRef,
} from "../schema.js";

export type OverrideExecutionStatus =
  | "REQUESTED"
  | "AUTHORIZED"
  | "EXECUTED"
  | "REJECTED";

export type Override = EntityEnvelope & {
  readonly humanActorId: string;
  readonly targetDecisionId: string;
  readonly reason: string;
  readonly authorityRef: string;
  readonly requestedAction: string;
  readonly executionStatus: OverrideExecutionStatus;
  readonly metadata?: JsonSafeMetadata;
};

export type HumanChallenge = EntityEnvelope & {
  readonly humanActorId: string;
  readonly targetDecisionId: string;
  readonly reason: string;
  readonly createdAtChallenge: IsoTimestamp;
};

export type PolicyAmendment = EntityEnvelope & {
  readonly humanActorId: string;
  readonly policyId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly reason: string;
};

export type AuthorityRevocationRecord = EntityEnvelope & {
  readonly humanActorId: string;
  readonly grantId: string;
  readonly reason: string;
  readonly revokedAt: IsoTimestamp;
};

export type RollbackRequest = EntityEnvelope & {
  readonly humanActorId: string;
  readonly targetDecisionId: string;
  readonly planId: string;
  readonly reason: string;
};

export function createOverride(input: {
  readonly id: string;
  readonly humanActorId: string;
  readonly targetDecisionId: string;
  readonly reason: string;
  readonly authorityRef: string;
  readonly requestedAction: string;
  readonly executionStatus: OverrideExecutionStatus;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
}): Override {
  return freezeDeep({
    ...envelope(input),
    humanActorId: requireNonEmpty(input.humanActorId, "humanActorId"),
    targetDecisionId: requireNonEmpty(
      input.targetDecisionId,
      "targetDecisionId",
    ),
    reason: requireNonEmpty(input.reason, "reason"),
    authorityRef: requireNonEmpty(input.authorityRef, "authorityRef"),
    requestedAction: requireNonEmpty(input.requestedAction, "requestedAction"),
    executionStatus: input.executionStatus,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function authorizeOverride(input: {
  readonly id: string;
  readonly humanActorId: string;
  readonly targetDecision: Decision;
  readonly reason: string;
  readonly requestedAction: string;
  readonly authority: Authority;
  readonly grant: AuthorityGrant | null | undefined;
  readonly resource: ResourceRef;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
}):
  | { readonly ok: true; readonly override: Override }
  | { readonly ok: false; readonly code: string; readonly message: string } {
  const check = evaluateAuthorityGrant({
    grant: input.grant,
    authority: input.authority,
    actorId: input.humanActorId,
    scope: "OVERRIDE_DECISION",
    resource: input.resource,
    at: input.at,
  });
  if (!check.allowed) {
    return {
      ok: false,
      code: GovernanceErrorCode.OVERRIDE_AUTHORITY_MISSING,
      message: check.message,
    };
  }
  const override = createOverride({
    id: input.id,
    humanActorId: input.humanActorId,
    targetDecisionId: input.targetDecision.id,
    reason: input.reason,
    authorityRef: check.grantId,
    requestedAction: input.requestedAction,
    executionStatus: "AUTHORIZED",
    createdAt: input.at,
    provenance: input.provenance,
  });
  return { ok: true, override };
}

export function createHumanChallenge(input: {
  readonly id: string;
  readonly humanActorId: string;
  readonly targetDecisionId: string;
  readonly reason: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): HumanChallenge {
  return freezeDeep({
    ...envelope(input),
    humanActorId: requireNonEmpty(input.humanActorId, "humanActorId"),
    targetDecisionId: requireNonEmpty(
      input.targetDecisionId,
      "targetDecisionId",
    ),
    reason: requireNonEmpty(input.reason, "reason"),
    createdAtChallenge: requireIsoTimestamp(input.createdAt, "createdAt"),
  });
}

export function createPolicyAmendment(input: {
  readonly id: string;
  readonly humanActorId: string;
  readonly policyId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly reason: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): PolicyAmendment {
  return freezeDeep({
    ...envelope(input),
    humanActorId: requireNonEmpty(input.humanActorId, "humanActorId"),
    policyId: requireNonEmpty(input.policyId, "policyId"),
    fromVersion: requireNonEmpty(input.fromVersion, "fromVersion"),
    toVersion: requireNonEmpty(input.toVersion, "toVersion"),
    reason: requireNonEmpty(input.reason, "reason"),
  });
}

export function createAuthorityRevocationRecord(input: {
  readonly id: string;
  readonly humanActorId: string;
  readonly grantId: string;
  readonly reason: string;
  readonly revokedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): AuthorityRevocationRecord {
  return freezeDeep({
    ...envelope(input),
    humanActorId: requireNonEmpty(input.humanActorId, "humanActorId"),
    grantId: requireNonEmpty(input.grantId, "grantId"),
    reason: requireNonEmpty(input.reason, "reason"),
    revokedAt: requireIsoTimestamp(input.revokedAt, "revokedAt"),
  });
}

export function createRollbackRequest(input: {
  readonly id: string;
  readonly humanActorId: string;
  readonly targetDecisionId: string;
  readonly planId: string;
  readonly reason: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): RollbackRequest {
  return freezeDeep({
    ...envelope(input),
    humanActorId: requireNonEmpty(input.humanActorId, "humanActorId"),
    targetDecisionId: requireNonEmpty(
      input.targetDecisionId,
      "targetDecisionId",
    ),
    planId: requireNonEmpty(input.planId, "planId"),
    reason: requireNonEmpty(input.reason, "reason"),
  });
}
