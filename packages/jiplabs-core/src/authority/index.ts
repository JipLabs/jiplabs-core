import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import {
  compareIso,
  envelope,
  freezeDeep,
  requireNonEmpty,
  requireIsoTimestamp,
} from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeValue,
  Provenance,
  ResourceRef,
} from "../schema.js";

import type { CapabilityId } from "./capabilities.js";
export {
  WellKnownCapability,
  isCapabilityId,
  type AuthorityScope,
  type CapabilityId,
} from "./capabilities.js";

/**
 * Named authority capabilities. Core does not interpret domain semantics;
 * products declare which capabilities their policies require.
 */

export type GrantConditionOperator = "EQ" | "IN" | "EXISTS";

export type GrantCondition = {
  readonly attribute: string;
  readonly operator: GrantConditionOperator;
  readonly value?: JsonSafeValue;
};

export type DelegationRules = {
  readonly delegable: boolean;
  readonly maxDepth: number;
  readonly parentGrantId?: string;
  readonly depth: number;
};

/** Catalog entry for a named authority. */
export type Authority = EntityEnvelope & {
  readonly code: string;
  readonly scopes: readonly CapabilityId[];
  readonly description?: string;
};

export type AuthorityGrant = EntityEnvelope & {
  readonly actorId: string;
  readonly authorityId: string;
  readonly authorityCode: string;
  readonly scopes: readonly CapabilityId[];
  readonly resource: ResourceRef;
  readonly conditions: readonly GrantCondition[];
  readonly validFrom: IsoTimestamp;
  readonly validUntil: IsoTimestamp | null;
  readonly issuerActorId: string;
  readonly revokedAt: IsoTimestamp | null;
  readonly revokedByActorId?: string;
  readonly revocationReason?: string;
  readonly delegation: DelegationRules;
  readonly contentHash: string;
};

export type AuthorityCheckCode =
  | typeof GovernanceErrorCode.AUTHORITY_MISSING
  | typeof GovernanceErrorCode.AUTHORITY_EXPIRED
  | typeof GovernanceErrorCode.AUTHORITY_REVOKED
  | typeof GovernanceErrorCode.AUTHORITY_NOT_YET_VALID
  | typeof GovernanceErrorCode.AUTHORITY_SCOPE_MISMATCH
  | typeof GovernanceErrorCode.AUTHORITY_RESOURCE_MISMATCH
  | typeof GovernanceErrorCode.AUTHORITY_CONDITION_FAILED
  | typeof GovernanceErrorCode.AUTHORITY_DELEGATION_INVALID;

export type AuthorityCheckResult =
  | {
      readonly allowed: true;
      readonly grantId: string;
      readonly authorityId: string;
      readonly authorityCode: string;
      readonly scopes: readonly CapabilityId[];
    }
  | {
      readonly allowed: false;
      readonly code: AuthorityCheckCode;
      readonly message: string;
      readonly grantId?: string;
    };

function grantContent(input: {
  readonly actorId: string;
  readonly authorityId: string;
  readonly authorityCode: string;
  readonly scopes: readonly CapabilityId[];
  readonly resource: ResourceRef;
  readonly conditions: readonly GrantCondition[];
  readonly validFrom: IsoTimestamp;
  readonly validUntil: IsoTimestamp | null;
  readonly issuerActorId: string;
  readonly delegation: DelegationRules;
}): unknown {
  return {
    actorId: input.actorId,
    authorityId: input.authorityId,
    authorityCode: input.authorityCode,
    scopes: [...input.scopes].sort(),
    resource: input.resource,
    conditions: input.conditions,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    issuerActorId: input.issuerActorId,
    delegation: input.delegation,
  };
}

export function createAuthority(input: {
  readonly id: string;
  readonly code: string;
  readonly scopes: readonly CapabilityId[];
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly description?: string;
}): Authority {
  return freezeDeep({
    ...envelope(input),
    code: requireNonEmpty(input.code, "code"),
    scopes: Object.freeze([...input.scopes]),
    ...(input.description ? { description: input.description } : {}),
  });
}

export function createAuthorityGrant(input: {
  readonly id: string;
  readonly actorId: string;
  readonly authority: Authority;
  readonly scopes: readonly CapabilityId[];
  readonly resource: ResourceRef;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly conditions?: readonly GrantCondition[];
  readonly validFrom: IsoTimestamp;
  readonly validUntil?: IsoTimestamp | null;
  readonly issuerActorId: string;
  readonly delegation?: Partial<DelegationRules>;
}): AuthorityGrant {
  const scopes = [...input.scopes];
  for (const scope of scopes) {
    if (!input.authority.scopes.includes(scope)) {
      throw new GovernanceError(
        GovernanceErrorCode.AUTHORITY_SCOPE_MISMATCH,
        `scope ${scope} is not part of authority ${input.authority.code}`,
      );
    }
  }
  const delegation: DelegationRules = {
    delegable: input.delegation?.delegable ?? false,
    maxDepth: input.delegation?.maxDepth ?? 0,
    depth: input.delegation?.depth ?? 0,
    ...(input.delegation?.parentGrantId
      ? { parentGrantId: input.delegation.parentGrantId }
      : {}),
  };
  if (delegation.depth > 0 && !delegation.parentGrantId) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORITY_DELEGATION_INVALID,
      "delegated grants require parentGrantId",
    );
  }
  if (delegation.depth > delegation.maxDepth) {
    throw new GovernanceError(
      GovernanceErrorCode.AUTHORITY_DELEGATION_INVALID,
      "delegation depth exceeds maxDepth",
    );
  }
  const body = {
    actorId: requireNonEmpty(input.actorId, "actorId"),
    authorityId: input.authority.id,
    authorityCode: input.authority.code,
    scopes: Object.freeze(scopes) as readonly CapabilityId[],
    resource: freezeDeep({ ...input.resource }),
    conditions: Object.freeze([...(input.conditions ?? [])]),
    validFrom: requireIsoTimestamp(input.validFrom, "validFrom"),
    validUntil: input.validUntil
      ? requireIsoTimestamp(input.validUntil, "validUntil")
      : null,
    issuerActorId: requireNonEmpty(input.issuerActorId, "issuerActorId"),
    revokedAt: null as IsoTimestamp | null,
    delegation: freezeDeep(delegation),
  };
  return freezeDeep({
    ...envelope(input),
    ...body,
    contentHash: sha256Canonical(grantContent(body)),
  });
}

export function revokeAuthorityGrant(
  grant: AuthorityGrant,
  input: {
    readonly at: IsoTimestamp;
    readonly recordedAt?: IsoTimestamp;
    readonly revokedByActorId: string;
    readonly reason: string;
  },
): AuthorityGrant {
  if (grant.revokedAt) {
    return grant;
  }
  return freezeDeep({
    ...grant,
    recordedAt: requireIsoTimestamp(
      input.recordedAt ?? input.at,
      "recordedAt",
    ),
    revokedAt: requireIsoTimestamp(input.at, "at"),
    revokedByActorId: requireNonEmpty(
      input.revokedByActorId,
      "revokedByActorId",
    ),
    revocationReason: requireNonEmpty(input.reason, "reason"),
  });
}

function resourceMatches(grant: ResourceRef, requested: ResourceRef): boolean {
  if (grant.domain !== requested.domain) {
    return false;
  }
  if (grant.resourceType && grant.resourceType !== requested.resourceType) {
    return false;
  }
  if (grant.resourceId && grant.resourceId !== requested.resourceId) {
    return false;
  }
  return true;
}

function conditionHolds(
  condition: GrantCondition,
  context: Readonly<Record<string, JsonSafeValue>> | undefined,
): boolean {
  const actual = context?.[condition.attribute];
  switch (condition.operator) {
    case "EXISTS":
      return actual !== undefined && actual !== null;
    case "EQ":
      return actual === condition.value;
    case "IN":
      return Array.isArray(condition.value)
        ? condition.value.includes(actual as never)
        : false;
    default:
      return false;
  }
}

export function evaluateAuthorityGrant(input: {
  readonly grant: AuthorityGrant | null | undefined;
  readonly authority: Authority;
  readonly actorId: string;
  readonly scope: CapabilityId;
  readonly resource: ResourceRef;
  readonly at: IsoTimestamp;
  readonly conditionContext?: Readonly<Record<string, JsonSafeValue>>;
  readonly parentGrant?: AuthorityGrant | null;
}): AuthorityCheckResult {
  const grant = input.grant;
  if (!grant) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_MISSING,
      message: `actor ${input.actorId} has no authority grant`,
    };
  }
  if (grant.actorId !== input.actorId) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_MISSING,
      message: `grant ${grant.id} is not held by actor ${input.actorId}`,
      grantId: grant.id,
    };
  }
  if (grant.authorityId !== input.authority.id) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_SCOPE_MISMATCH,
      message: `grant ${grant.id} does not bind authority ${input.authority.id}`,
      grantId: grant.id,
    };
  }
  if (grant.revokedAt) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_REVOKED,
      message: `grant ${grant.id} was revoked at ${grant.revokedAt}`,
      grantId: grant.id,
    };
  }
  if (compareIso(input.at, grant.validFrom) < 0) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_NOT_YET_VALID,
      message: `grant ${grant.id} is not valid until ${grant.validFrom}`,
      grantId: grant.id,
    };
  }
  if (grant.validUntil && compareIso(input.at, grant.validUntil) > 0) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_EXPIRED,
      message: `grant ${grant.id} expired at ${grant.validUntil}`,
      grantId: grant.id,
    };
  }
  if (!grant.scopes.includes(input.scope)) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_SCOPE_MISMATCH,
      message: `grant ${grant.id} does not include scope ${input.scope}`,
      grantId: grant.id,
    };
  }
  if (!resourceMatches(grant.resource, input.resource)) {
    return {
      allowed: false,
      code: GovernanceErrorCode.AUTHORITY_RESOURCE_MISMATCH,
      message: `grant ${grant.id} does not cover requested resource`,
      grantId: grant.id,
    };
  }
  for (const condition of grant.conditions) {
    if (!conditionHolds(condition, input.conditionContext)) {
      return {
        allowed: false,
        code: GovernanceErrorCode.AUTHORITY_CONDITION_FAILED,
        message: `grant ${grant.id} condition ${condition.attribute} failed`,
        grantId: grant.id,
      };
    }
  }
  if (grant.delegation.parentGrantId) {
    const parent = input.parentGrant;
    if (!parent || parent.id !== grant.delegation.parentGrantId) {
      return {
        allowed: false,
        code: GovernanceErrorCode.AUTHORITY_DELEGATION_INVALID,
        message: `delegated grant ${grant.id} is missing a valid parent`,
        grantId: grant.id,
      };
    }
    if (!parent.delegation.delegable || parent.revokedAt) {
      return {
        allowed: false,
        code: GovernanceErrorCode.AUTHORITY_DELEGATION_INVALID,
        message: `parent grant ${parent.id} cannot support delegation`,
        grantId: grant.id,
      };
    }
  }
  return {
    allowed: true,
    grantId: grant.id,
    authorityId: grant.authorityId,
    authorityCode: grant.authorityCode,
    scopes: grant.scopes,
  };
}
