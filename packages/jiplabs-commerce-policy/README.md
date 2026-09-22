# @jiplabs/commerce-policy

Shared JipLabs commercial eligibility policy. Domain rules live here. Generic evaluation contracts live in `@jiplabs/core`.

```text
@jiplabs/core
        │
        ▼
@jiplabs/commerce-policy
        │
        ▼
JipLabs Account
        │
        ▼
Product enforcement gates
```

## Invariant

```text
NO COMMERCIAL ENTITLEMENT
WITHOUT
COMMERCIAL_ELIGIBILITY = ALLOW
```

A stale, absent, `BLOCK`, or `REVIEW` decision is not `ALLOW`. Operational evaluation failure is not a business decision and is never translated into `ALLOW`.

## Policy

- Policy ID: `commercial-jurisdiction`
- Current version: `v1`
- Decisions: `ALLOW` | `BLOCK` | `REVIEW`
- Provider overlays (currently Stripe v1) may only further restrict

Products (Quinté Lab, JipComply, JipOffice, JipContract, jiplabs.com, future commercial products) must not copy jurisdiction lists. They consume this package via Account or a direct call, then enforce ALLOW on the backend.

## Account

JipLabs Account is the intended central evaluator:

```text
POST /policy/evaluate/commercial-eligibility
```

Account must call `evaluateCommercialEligibility`. It must not host a second policy engine.

## Product gate

Call `assertCommercialActionAllowed` on the backend before any gated commercial event. UI hiding is not enforcement.
