import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import {
  freezeDeep,
  requireNonEmpty,
  requireIsoTimestamp,
} from "../envelope.js";
import type { Decision } from "../decisions/index.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance } from "../schema.js";

export type GovernanceEventType =
  | "OBSERVATION_RECORDED"
  | "PROPOSAL_CREATED"
  | "AUTHORITY_GRANTED"
  | "AUTHORITY_REVOKED"
  | "AUTHORITY_CHECKED"
  | "POLICY_ACTIVATED"
  | "POLICY_SUPERSEDED"
  | "DECISION_MADE"
  | "ACTION_AUTHORIZED"
  | "ACTION_EXECUTION_STARTED"
  | "ACTION_EXECUTED"
  | "ACTION_FAILED"
  | "OUTCOME_RECORDED"
  | "EVALUATION_COMPLETED"
  | "HUMAN_APPROVAL_REQUESTED"
  | "HUMAN_APPROVED"
  | "HUMAN_REJECTED"
  | "ROLLBACK_TRIGGERED"
  | "ROLLBACK_AUTHORIZED"
  | "ROLLBACK_EXECUTED"
  | "ROLLBACK_COMPLETED"
  | "ROLLBACK_FAILED"
  | "HUMAN_CHALLENGE"
  | "HUMAN_OVERRIDE"
  | "EVALUATION_CASE_CANDIDATE_RECORDED"
  | "EVALUATION_CASE_ADMITTED"
  | "EVALUATION_CASE_REJECTED"
  | "EVALUATION_CASE_QUARANTINED"
  | "EVALUATION_CASE_VERSION_ACTIVATED"
  | "EVALUATION_SUITE_VERSION_ACTIVATED"
  | "EVALUATION_RUN_STARTED"
  | "EVALUATION_RUN_COMPLETED"
  | "BASELINE_ESTABLISHED"
  | "REGRESSION_DETECTED"
  | "LEARNING_SIGNAL_RECORDED"
  | "GOVERNANCE_RECOMMENDATION_CREATED"
  | "COMPONENT_REGISTERED"
  | "COMPONENT_VERSION_REGISTERED"
  | "CAPABILITY_DECLARED"
  | "QUALIFICATION_RECORDED"
  | "QUALIFICATION_EXPIRED"
  | "COMPONENT_SUSPENDED"
  | "COMPONENT_RESTORED"
  | "RESPONSIBILITY_ELIGIBILITY_EVALUATED"
  | "RESPONSIBILITY_ASSIGNED"
  | "RESPONSIBILITY_REVOKED"
  | "COMPONENT_SELECTED"
  | "COMPONENT_PROMOTION_PROPOSED"
  | "COMPONENT_DEMOTION_PROPOSED"
  | "COMPONENT_REPLACEMENT_PROPOSED";

/**
 * Temporal refs captured at event time so historical audit never depends on
 * mutable current authority/policy state.
 */
export type GovernanceTemporalRefs = {
  readonly payloadContentHash?: string;
  readonly authorityGrantId?: string;
  readonly authorityGrantContentHash?: string;
  readonly policyId?: string;
  readonly policyVersion?: string;
  readonly policyContentHash?: string;
  readonly decisionHash?: string;
  readonly proposalId?: string;
};

export type GovernanceEvent = {
  readonly eventId: string;
  readonly eventType: GovernanceEventType;
  readonly occurredAt: IsoTimestamp;
  readonly recordedAt: IsoTimestamp;
  readonly actorId: string;
  readonly subjectRef?: string;
  readonly payloadRef: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
  readonly provenance: Provenance;
  readonly temporalRefs?: GovernanceTemporalRefs;
  readonly metadata?: JsonSafeMetadata;
};

export type AppendResult =
  | { readonly status: "appended"; readonly event: GovernanceEvent }
  | { readonly status: "duplicate"; readonly event: GovernanceEvent };

export interface GovernanceLedger {
  append(event: Omit<GovernanceEvent, "sequence">): AppendResult;
  list(): readonly GovernanceEvent[];
  getByIdempotencyKey(key: string): GovernanceEvent | undefined;
  getByEventId(eventId: string): GovernanceEvent | undefined;
}

export function createGovernanceEvent(input: {
  readonly eventId: string;
  readonly eventType: GovernanceEventType;
  readonly occurredAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly actorId: string;
  readonly payloadRef: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
  readonly provenance: Provenance;
  readonly subjectRef?: string;
  readonly temporalRefs?: GovernanceTemporalRefs;
  readonly metadata?: JsonSafeMetadata;
}): GovernanceEvent {
  return freezeDeep({
    eventId: requireNonEmpty(input.eventId, "eventId"),
    eventType: input.eventType,
    occurredAt: requireIsoTimestamp(input.occurredAt, "occurredAt"),
    recordedAt: requireIsoTimestamp(
      input.recordedAt ?? input.occurredAt,
      "recordedAt",
    ),
    actorId: requireNonEmpty(input.actorId, "actorId"),
    payloadRef: requireNonEmpty(input.payloadRef, "payloadRef"),
    idempotencyKey: requireNonEmpty(input.idempotencyKey, "idempotencyKey"),
    sequence: input.sequence,
    provenance: freezeDeep({ ...input.provenance }),
    ...(input.subjectRef ? { subjectRef: input.subjectRef } : {}),
    ...(input.temporalRefs
      ? { temporalRefs: freezeDeep({ ...input.temporalRefs }) }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function createDecisionMadeEvent(input: {
  readonly eventId: string;
  readonly occurredAt: IsoTimestamp;
  readonly actorId: string;
  readonly decision: Decision;
  readonly provenance: Provenance;
  readonly idempotencyKey?: string;
  readonly metadata?: JsonSafeMetadata;
}): Omit<GovernanceEvent, "sequence"> {
  const snapshot = input.decision.governanceSnapshot;
  return createGovernanceEvent({
    eventId: input.eventId,
    eventType: "DECISION_MADE",
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    payloadRef: input.decision.id,
    idempotencyKey:
      input.idempotencyKey ?? `decision:${input.decision.id}`,
    sequence: 0,
    provenance: input.provenance,
    temporalRefs: {
      proposalId: snapshot.proposalId,
      authorityGrantId: snapshot.authorityGrantId,
      authorityGrantContentHash: snapshot.authorityGrantContentHash,
      policyId: snapshot.policyId,
      policyVersion: snapshot.policyVersion,
      policyContentHash: snapshot.policyContentHash,
      decisionHash: input.decision.decisionHash,
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export class InMemoryGovernanceLedger implements GovernanceLedger {
  readonly #events: GovernanceEvent[] = [];
  readonly #byIdempotency = new Map<string, GovernanceEvent>();
  readonly #byEventId = new Map<string, GovernanceEvent>();
  #sequence = 0;

  append(event: Omit<GovernanceEvent, "sequence">): AppendResult {
    const existing = this.#byIdempotency.get(event.idempotencyKey);
    if (existing) {
      if (existing.eventId !== event.eventId) {
        throw new GovernanceError(
          GovernanceErrorCode.LEDGER_IDEMPOTENCY_CONFLICT,
          `idempotency key ${event.idempotencyKey} already used by ${existing.eventId}`,
        );
      }
      return { status: "duplicate", event: existing };
    }
    if (this.#byEventId.has(event.eventId)) {
      const byId = this.#byEventId.get(event.eventId)!;
      return { status: "duplicate", event: byId };
    }
    this.#sequence += 1;
    const stored = createGovernanceEvent({
      ...event,
      sequence: this.#sequence,
    });
    this.#events.push(stored);
    this.#byIdempotency.set(stored.idempotencyKey, stored);
    this.#byEventId.set(stored.eventId, stored);
    return { status: "appended", event: stored };
  }

  list(): readonly GovernanceEvent[] {
    return [...this.#events];
  }

  getByIdempotencyKey(key: string): GovernanceEvent | undefined {
    return this.#byIdempotency.get(key);
  }

  getByEventId(eventId: string): GovernanceEvent | undefined {
    return this.#byEventId.get(eventId);
  }

  assertAppendOnly(): void {
    const copy = [...this.#events];
    if (copy.length !== this.#events.length) {
      throw new GovernanceError(
        GovernanceErrorCode.LEDGER_MUTATION_FORBIDDEN,
        "ledger mutation detected",
      );
    }
  }
}

export function assertLedgerAppendOnly(ledger: GovernanceLedger): void {
  const first = ledger.list();
  const second = ledger.list();
  if (first.length !== second.length) {
    throw new GovernanceError(
      GovernanceErrorCode.LEDGER_MUTATION_FORBIDDEN,
      "ledger length changed between reads",
    );
  }
  for (let i = 0; i < first.length; i += 1) {
    if (first[i]!.eventId !== second[i]!.eventId) {
      throw new GovernanceError(
        GovernanceErrorCode.LEDGER_MUTATION_FORBIDDEN,
        "ledger event order or content changed between reads",
      );
    }
  }
}

export function assertHistoricalAuditSelfContained(
  event: GovernanceEvent,
): void {
  if (event.eventType !== "DECISION_MADE") {
    return;
  }
  const refs = event.temporalRefs;
  if (
    !refs?.decisionHash ||
    !refs.policyContentHash ||
    !refs.authorityGrantContentHash ||
    !refs.proposalId
  ) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "DECISION_MADE event missing temporal refs for historical audit",
    );
  }
}
