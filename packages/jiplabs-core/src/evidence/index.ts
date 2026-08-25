import { envelope, freezeDeep, requireNonEmpty } from "../envelope.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  JsonSafeValue,
  Provenance,
  SubjectRef,
} from "../schema.js";

export type ObservationRef = EntityEnvelope & {
  readonly source: string;
  readonly observedAt: IsoTimestamp;
  readonly subject: SubjectRef;
  readonly payloadRef?: string;
  readonly metadata?: JsonSafeMetadata;
};

export type Evidence = EntityEnvelope & {
  readonly kind: string;
  readonly subject: SubjectRef;
  readonly observationRefs: readonly string[];
  readonly value: JsonSafeValue;
  readonly evaluatorActorId: string;
  readonly metadata?: JsonSafeMetadata;
};

export function createObservationRef(input: {
  readonly id: string;
  readonly source: string;
  readonly observedAt: IsoTimestamp;
  readonly subject: SubjectRef;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly payloadRef?: string;
  readonly metadata?: JsonSafeMetadata;
}): ObservationRef {
  return freezeDeep({
    ...envelope(input),
    source: requireNonEmpty(input.source, "source"),
    observedAt: input.observedAt,
    subject: freezeDeep({ ...input.subject }),
    ...(input.payloadRef ? { payloadRef: input.payloadRef } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function createEvidence(input: {
  readonly id: string;
  readonly kind: string;
  readonly subject: SubjectRef;
  readonly observationRefs: readonly string[];
  readonly value: JsonSafeValue;
  readonly evaluatorActorId: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
}): Evidence {
  return freezeDeep({
    ...envelope(input),
    kind: requireNonEmpty(input.kind, "kind"),
    subject: freezeDeep({ ...input.subject }),
    observationRefs: Object.freeze([...input.observationRefs]),
    value: input.value as JsonSafeValue,
    evaluatorActorId: requireNonEmpty(
      input.evaluatorActorId,
      "evaluatorActorId",
    ),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function evidenceByKind(
  evidence: readonly Evidence[],
): Record<string, JsonSafeValue> {
  const out: Record<string, JsonSafeValue> = {};
  for (const item of evidence) {
    out[item.kind] = item.value;
  }
  return out;
}
