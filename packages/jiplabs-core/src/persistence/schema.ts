/** Durable persistence schema version for CORE-02. */
export const PERSISTENCE_SCHEMA_VERSION = 1 as const;

export type PersistenceSchemaVersion = typeof PERSISTENCE_SCHEMA_VERSION;

export const PERSISTENCE_RECORD_VERSION = 1 as const;
