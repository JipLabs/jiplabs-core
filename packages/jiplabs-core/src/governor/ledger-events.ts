import { createDecisionMadeEvent, type GovernanceLedger } from "../ledger/index.js";
import type { GovernedActionAuthorization } from "../authorization/index.js";
import type { ActionResult } from "../actions/index.js";
import type { Decision } from "../decisions/index.js";
import type { CoreEvaluation } from "../evaluation/index.js";
import type { OutcomeRecord } from "../outcomes/index.js";
import type { Disposition } from "../disposition/index.js";
import type { IsoTimestamp, Provenance } from "../schema.js";
import { createGovernanceEvent } from "../ledger/index.js";

export function emitProposalCreated(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    proposalId: string;
    idempotencyKey: string;
    provenance: Provenance;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "PROPOSAL_CREATED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.proposalId,
      idempotencyKey: `proposal:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
    }),
  );
}

export function emitAuthorityChecked(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    grantId: string;
    allowed: boolean;
    idempotencyKey: string;
    provenance: Provenance;
    authorityGrantContentHash?: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "AUTHORITY_CHECKED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.grantId,
      idempotencyKey: `authority:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
      temporalRefs: input.authorityGrantContentHash
        ? { authorityGrantContentHash: input.authorityGrantContentHash }
        : undefined,
    }),
  );
}

export function emitDecisionMade(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    decision: Decision;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createDecisionMadeEvent({
      eventId: input.eventId,
      occurredAt: input.at,
      actorId: input.actorId,
      decision: input.decision,
      provenance: input.provenance,
      idempotencyKey: `decision:${input.idempotencyKey}`,
    }),
  );
}

export function emitActionAuthorized(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    authorization: GovernedActionAuthorization;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "ACTION_AUTHORIZED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.authorization.id,
      idempotencyKey: `action-auth:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
      temporalRefs: {
        decisionHash: input.authorization.authorizationHash,
        policyContentHash: input.authorization.policyContentHash,
        authorityGrantContentHash: input.authorization.authorityRef,
      },
    }),
  );
}

export function emitActionExecuted(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    actionResult: ActionResult;
    provenance: Provenance;
    idempotencyKey: string;
    failed?: boolean;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: input.failed ? "ACTION_FAILED" : "ACTION_EXECUTED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.actionResult.id,
      idempotencyKey: `action-exec:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
    }),
  );
}

export function emitOutcomeRecorded(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    outcome: OutcomeRecord;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "OUTCOME_RECORDED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.outcome.id,
      idempotencyKey: `outcome:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
    }),
  );
}

export function emitEvaluationCompleted(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    evaluation: CoreEvaluation;
    disposition: Disposition;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "EVALUATION_COMPLETED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.evaluation.id,
      idempotencyKey: `evaluation:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
      metadata: { disposition: input.disposition },
    }),
  );
}

export function emitHumanApprovalRequested(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    decisionId: string;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "HUMAN_APPROVAL_REQUESTED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.decisionId,
      idempotencyKey: `human-approval-request:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
    }),
  );
}

export function emitHumanApproved(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    decisionId: string;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "HUMAN_APPROVED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.decisionId,
      idempotencyKey: `human-approved:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
    }),
  );
}

export function emitHumanRejected(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    decisionId: string;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "HUMAN_REJECTED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.decisionId,
      idempotencyKey: `human-rejected:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
    }),
  );
}

export function emitRollbackTriggered(
  ledger: GovernanceLedger,
  input: {
    eventId: string;
    at: IsoTimestamp;
    actorId: string;
    decisionId: string;
    provenance: Provenance;
    idempotencyKey: string;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: "ROLLBACK_TRIGGERED",
      occurredAt: input.at,
      actorId: input.actorId,
      payloadRef: input.decisionId,
      idempotencyKey: `rollback-trigger:${input.idempotencyKey}`,
      sequence: 0,
      provenance: input.provenance,
    }),
  );
}
