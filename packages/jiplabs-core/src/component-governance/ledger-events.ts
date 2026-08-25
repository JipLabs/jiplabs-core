import { createGovernanceEvent, type GovernanceEventType, type GovernanceLedger } from "../ledger/index.js";
import type { IsoTimestamp, JsonSafeMetadata, Provenance } from "../schema.js";
import type { ComponentGovernanceEventType } from "./types.js";

export function emitComponentGovernanceEvent(
  ledger: GovernanceLedger,
  input: {
    readonly eventId: string;
    readonly eventType: ComponentGovernanceEventType;
    readonly at: IsoTimestamp;
    readonly actorId: string;
    readonly payloadRef: string;
    readonly idempotencyKey: string;
    readonly provenance: Provenance;
    readonly metadata?: JsonSafeMetadata;
  },
): void {
  ledger.append(
    createGovernanceEvent({
      eventId: input.eventId,
      eventType: input.eventType as GovernanceEventType,
      occurredAt: input.at,
      recordedAt: input.at,
      actorId: input.actorId,
      payloadRef: input.payloadRef,
      idempotencyKey: input.idempotencyKey,
      sequence: 0,
      provenance: input.provenance,
      metadata: input.metadata,
    }),
  );
}
