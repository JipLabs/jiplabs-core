export const CORE_SCHEMA_VERSION = "core-00.1" as const;
export type CoreSchemaVersion = typeof CORE_SCHEMA_VERSION;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

export type JsonSafeValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonSafeValue[]
  | { readonly [key: string]: JsonSafeValue };

export type JsonSafeMetadata = { readonly [key: string]: JsonSafeValue };

export type Provenance = {
  readonly actorId: string;
  readonly source: string;
  readonly codeVersion?: string;
  readonly policyVersion?: string;
};

/**
 * Common envelope for every CORE-00 entity.
 * `createdAt` is when the fact occurred; `recordedAt` is when Core recorded it.
 */
export type EntityEnvelope = {
  readonly id: string;
  readonly schemaVersion: CoreSchemaVersion;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt: IsoTimestamp;
  readonly provenance: Provenance;
};

export type SubjectRef = {
  readonly type: string;
  readonly id: string;
  readonly domain?: string;
};

export type ResourceRef = {
  readonly domain: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
};

export type Ref = {
  readonly id: string;
  readonly type?: string;
};
