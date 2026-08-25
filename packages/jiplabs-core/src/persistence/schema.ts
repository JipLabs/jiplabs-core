/** Durable persistence schema version for CORE-02/CORE-03/CORE-04. */
export const PERSISTENCE_SCHEMA_VERSION = 3 as const;

export type PersistenceSchemaVersion = typeof PERSISTENCE_SCHEMA_VERSION;

export const PERSISTENCE_RECORD_VERSION = 1 as const;
