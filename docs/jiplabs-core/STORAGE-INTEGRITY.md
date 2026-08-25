# Storage Integrity

## Record envelope

All durable records use canonical serialization:

```typescript
{
  schemaVersion: 1,
  recordVersion: 1,
  contentHash: sha256(payload),
  payload: T
}
```

Tampering with stored JSON invalidates `contentHash` on read (`STORAGE_INTEGRITY_FAILED`).

## Ledger integrity

`verifyLedgerIntegrity()` detects:

- Sequence gaps
- Duplicate event IDs
- Idempotency key conflicts
- Run correlation mismatches (SQLite adapter)

`verifySqliteLedgerHashChain()` validates `previousEventHash` linkage stored in SQLite.

## Optimistic concurrency

- Governance runs: version incremented on each save
- Execution attempts: monotonic version required (reject `version <= existing`)

## Failure behavior

**Fail closed:**

- `STORAGE_PERSISTENCE_FAILED` — cannot persist required checkpoint
- `STORAGE_INTEGRITY_FAILED` — corrupted or tampered records
- `STORAGE_SCHEMA_UNSUPPORTED` — unknown future schema version
- `STORAGE_TRANSACTION_FAILED` — atomic unit rolled back

If persistence fails before a side effect, execution is blocked.

If persistence fails after a possible external effect, ambiguous state is preserved and reconciliation is required.

## Not claimed

- Cryptographic tamper-proofing beyond deterministic hash detection
- Blockchain-style consensus
