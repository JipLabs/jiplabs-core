import { GovernanceError, GovernanceErrorCode } from "./errors.js";
import {
  CORE_SCHEMA_VERSION,
  type CoreSchemaVersion,
  type EntityEnvelope,
  type IsoTimestamp,
  type Provenance,
} from "./schema.js";

export function requireNonEmpty(
  value: string | null | undefined,
  field: string,
): string {
  const v = (value ?? "").trim();
  if (!v) {
    throw new GovernanceError(
      GovernanceErrorCode.MISSING_FIELD,
      `${field} is required`,
    );
  }
  return v;
}

export function requireIsoTimestamp(value: string, field: string): IsoTimestamp {
  const v = requireNonEmpty(value, field);
  if (Number.isNaN(Date.parse(v))) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      `${field} must be an ISO-8601 timestamp`,
    );
  }
  return v;
}

export function compareIso(a: IsoTimestamp, b: IsoTimestamp): number {
  return Date.parse(a) - Date.parse(b);
}

export type EnvelopeInput = {
  readonly id: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
};

export function envelope(input: EnvelopeInput): EntityEnvelope {
  const provenance: Provenance = {
    actorId: requireNonEmpty(input.provenance.actorId, "provenance.actorId"),
    source: requireNonEmpty(input.provenance.source, "provenance.source"),
    ...(input.provenance.codeVersion
      ? { codeVersion: input.provenance.codeVersion }
      : {}),
    ...(input.provenance.policyVersion
      ? { policyVersion: input.provenance.policyVersion }
      : {}),
  };
  return {
    id: requireNonEmpty(input.id, "id"),
    schemaVersion: CORE_SCHEMA_VERSION,
    createdAt: requireIsoTimestamp(input.createdAt, "createdAt"),
    recordedAt: requireIsoTimestamp(
      input.recordedAt ?? input.createdAt,
      "recordedAt",
    ),
    provenance,
  };
}

export function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      freezeDeep(item);
    }
    return value;
  }
  for (const key of Object.keys(value as object)) {
    freezeDeep((value as Record<string, unknown>)[key]);
  }
  return value;
}

export function schemaVersion(): CoreSchemaVersion {
  return CORE_SCHEMA_VERSION;
}
