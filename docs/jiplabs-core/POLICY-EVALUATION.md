# Policy evaluation contract

Generic, domain-agnostic policy evaluation. Distinct from `PolicyVersion` gates (actor-authority lifecycle) and from `Decision` / `DecisionStatus`.

```ts
evaluatePolicy({ policy, context, evaluatedAt }) ->
  { ok: true, result } | { ok: false, code, message, evaluatedAt }
```

`result.decision` is `ALLOW` | `BLOCK` | `REVIEW`.

`REVIEW` is a governed result (`ok: true`). Thrown evaluator errors and unknown policy versions are operational failures (`ok: false`). Neither is `ALLOW`.

## Result fields

| Field | Role |
|---|---|
| `decision` | `ALLOW` / `BLOCK` / `REVIEW` |
| `policyId` / `policyVersion` / `policyContentHash` | Exact policy identity used |
| `reasonCodes` | Stable machine-readable codes; business logic must not depend on prose |
| `evidenceRefs` | Provenance references, not payloads |
| `evaluatedAt` | Evaluation timestamp |
| `subject` / `contextRef` | Optional identifiers |
| `consideredSignalKinds` | Which signal kinds were inspected |
| `contributingSources` | Base policy and overlays that participated |

Serialization is canonical JSON. A later policy version cannot rewrite a stored historical result.

## Composition

`composePolicyDecisions` combines a base result with overlays. Overlays cannot relax: `BLOCK > REVIEW > ALLOW`.

## Entitlement

`isEntitlementPermitted` / `assertEntitlementPermitted` implement fail-closed authorization:

missing, `ok: false`, `BLOCK`, and `REVIEW` are not `ALLOW`.

Commercial jurisdiction lists do **not** belong in Core. They belong in `@jiplabs/commerce-policy`.
