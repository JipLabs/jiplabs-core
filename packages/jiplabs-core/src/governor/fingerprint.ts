import { sha256Canonical } from "../hash.js";
import type { DecisionProposal } from "../decisions/index.js";

export function computeGovernanceRequestFingerprint(input: {
  readonly proposal: DecisionProposal;
  readonly policyContentHash: string;
  readonly resourceKey: string;
  readonly actorId: string;
  readonly executorActorId: string;
  readonly evidenceRefs: readonly string[];
  readonly rollbackPlanId?: string | null;
}): string {
  return sha256Canonical({
    proposalId: input.proposal.id,
    action: input.proposal.action,
    subject: input.proposal.subject,
    domain: input.proposal.domain,
    policyId: input.proposal.policyId,
    policyVersion: input.proposal.policyVersion,
    decisionType: input.proposal.decisionType,
    policyContentHash: input.policyContentHash,
    resourceKey: input.resourceKey,
    actorId: input.actorId,
    executorActorId: input.executorActorId,
    evidenceRefs: [...input.evidenceRefs].sort(),
    rollbackPlanId: input.rollbackPlanId ?? null,
  });
}

export function computeRollbackRequestFingerprint(input: {
  readonly runId: string;
  readonly decisionId: string;
  readonly planId: string;
  readonly rollbackAction: string;
  readonly rollbackTargetId: string;
}): string {
  return sha256Canonical(input);
}

export const ROLLBACK_IDEMPOTENCY_PREFIX = "rollback:" as const;

export function assertActionIdempotencyKey(key: string): void {
  if (key.startsWith(ROLLBACK_IDEMPOTENCY_PREFIX)) {
    throw new Error(
      `action idempotency key must not use rollback prefix: ${key}`,
    );
  }
}

export function assertRollbackIdempotencyKey(key: string): void {
  if (!key.startsWith(ROLLBACK_IDEMPOTENCY_PREFIX)) {
    throw new Error(
      `rollback idempotency key must start with ${ROLLBACK_IDEMPOTENCY_PREFIX}`,
    );
  }
}
