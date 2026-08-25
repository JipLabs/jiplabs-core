# Authority Model

## Principle

**No actor receives global implicit authority.** Every decision requires a valid, non-revoked, in-window `AuthorityGrant` covering the requested scope and resource.

## Actor types

| Type | Role |
|------|------|
| `SYSTEM_AGENT` | Platform automation |
| `DOMAIN_GOVERNOR` | Domain-scoped governance (e.g. champion-governor) |
| `EXECUTOR` | Action execution |
| `EVALUATOR` | Evidence and outcome evaluation |
| `HUMAN` | Human on-the-loop interventions |
| `EXTERNAL_SYSTEM` | External integrations |

Actors carry identity scopes (what they *may* be granted), not authority itself.

## Authority scopes (examples)

```
OBSERVE
FORM_HYPOTHESIS
REGISTER_EXPERIMENT
EXECUTE_EXPERIMENT
EVALUATE_EXPERIMENT
PROPOSE_CHALLENGER
PROMOTE_MODEL
DEMOTE_MODEL
ROLLBACK_MODEL
ACQUIRE_DATA
MODIFY_POLICY
OVERRIDE_DECISION
MODEL_GOVERNANCE
```

Products may extend scopes; Core treats them as opaque strings beyond the catalog.

## AuthorityGrant fields

| Field | Purpose |
|-------|---------|
| `scopes` | Granted authority scopes |
| `resource` | Domain / resource binding |
| `conditions` | Attribute conditions (EQ, IN, EXISTS) |
| `validFrom` / `validUntil` | Temporal validity |
| `issuerActorId` | Who issued the grant |
| `revokedAt` | Revocation timestamp |
| `delegation` | Delegation rules (depth, parent) |
| `contentHash` | Tamper-evident grant content |

## Evaluation rules

`evaluateAuthorityGrant()` returns deterministic results:

| Condition | Result |
|-----------|--------|
| No grant | `AUTHORITY_MISSING` |
| Revoked | `AUTHORITY_REVOKED` |
| Before `validFrom` | `AUTHORITY_NOT_YET_VALID` |
| After `validUntil` | `AUTHORITY_EXPIRED` |
| Scope mismatch | `AUTHORITY_SCOPE_MISMATCH` |
| Resource mismatch | `AUTHORITY_RESOURCE_MISMATCH` |
| Condition failure | `AUTHORITY_CONDITION_FAILED` |
| Invalid delegation | `AUTHORITY_DELEGATION_INVALID` |
| All checks pass | `allowed: true` |

## Example

```
Actor:     champion-governor
Authority: MODEL_GOVERNANCE
Scope:     PROMOTE_MODEL
Resource:  domain=research-models, type=model
```

No grant → no decision.
