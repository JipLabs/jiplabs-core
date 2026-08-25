import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import {
  freezeDeep,
  requireNonEmpty,
  requireIsoTimestamp,
} from "../envelope.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance } from "../schema.js";

export type GovernanceEventType =
  | "OBSERVATION_RECORDED"
  | "PROPOSAL_CREATED"
  | "AUTHORITY_GRANTED"
  | "AUTHORITY_REVOKED"
  | "POLICY_ACTIVATED"
  | "POLICY_SUPERSEDED"
  | "DECISION_MADE"
  | "ACTION_AUTHORIZED"
  | "ACTION_EXECUTED"
  | "OUTCOME_RECORDED"
  | "EVALUATION_COMPLETED"
  | "ROLLBACK_TRIGGERED"
  | "ROLLBACK_COMPLETED"
  | "HUMAN_CHALLENGE"
  | "HUMAN_OVERRIDE";

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
    Object.freeze(this.#events);
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
