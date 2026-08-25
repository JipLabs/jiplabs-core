# Schema Migrations

## Versioning

- `PERSISTENCE_SCHEMA_VERSION = 1` (runtime support ceiling)
- `schema_migrations` table tracks applied migrations

Each migration record:

| Field | Purpose |
|-------|---------|
| `migration_id` | Ordered identifier (e.g. `001_initial`) |
| `applied_at` | ISO timestamp |
| `checksum` | Deterministic migration checksum |

## Applying migrations

`applyMigrations()` runs on database open via `initializeSqliteDatabase()`.

Rules:

- Migrations apply in order, once each
- Unknown future migrations in DB → `STORAGE_SCHEMA_UNSUPPORTED` (fail closed)
- Runtime cannot silently mutate incompatible records

## Initial schema (001)

Tables:

- `schema_migrations`
- `governance_ledger_events`
- `governance_runs`
- `idempotency_bindings`
- `execution_attempts`
- `execution_claims`

## Adding migrations

1. Add new `Migration` entry to `ALL_MIGRATIONS` in `src/persistence/migrations.ts`
2. Increment documentation
3. Add test proving deterministic apply on fresh and existing databases
