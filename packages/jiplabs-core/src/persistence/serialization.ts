import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { canonicalJson, sha256Canonical } from "../hash.js";
import { PERSISTENCE_RECORD_VERSION } from "./schema.js";

export type PersistedRecord<T> = {
  readonly schemaVersion: number;
  readonly recordVersion: number;
  readonly contentHash: string;
  readonly payload: T;
};

export function serializeGovernanceRecord<T>(payload: T): string {
  const contentHash = sha256Canonical(payload);
  const envelope: PersistedRecord<T> = {
    schemaVersion: PERSISTENCE_RECORD_VERSION,
    recordVersion: PERSISTENCE_RECORD_VERSION,
    contentHash,
    payload,
  };
  return canonicalJson(envelope);
}

export function deserializeGovernanceRecord<T>(json: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_INTEGRITY_FAILED,
      "stored governance record is not valid JSON",
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("schemaVersion" in parsed) ||
    !("contentHash" in parsed) ||
    !("payload" in parsed)
  ) {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_INTEGRITY_FAILED,
      "stored governance record missing envelope fields",
    );
  }
  const record = parsed as PersistedRecord<T>;
  if (record.schemaVersion > PERSISTENCE_RECORD_VERSION) {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_SCHEMA_UNSUPPORTED,
      `unsupported stored record schema version ${record.schemaVersion}`,
    );
  }
  const expected = sha256Canonical(record.payload);
  if (record.contentHash !== expected) {
    throw new GovernanceError(
      GovernanceErrorCode.STORAGE_INTEGRITY_FAILED,
      "stored governance record content hash mismatch",
    );
  }
  return record.payload;
}

export function hashGovernanceRecord<T>(payload: T): string {
  return sha256Canonical(payload);
}
