# Product enforcement — commercial eligibility

Each commercial JipLabs product must enforce eligibility on the **backend**. A UI restriction is not sufficient. Products must not reproduce jurisdiction lists.

```text
Commercial action requested
        ↓
JipLabs Account / evaluateCommercialEligibility
        ↓
ALLOW / BLOCK / REVIEW
        ↓
Local backend enforcement gate
        ↓
Commercial action
```

## Invariant

```text
NO COMMERCIAL ENTITLEMENT WITHOUT COMMERCIAL_ELIGIBILITY = ALLOW
```

Use `assertCommercialActionAllowed` from `@jiplabs/commerce-policy` (fail-closed Core helper underneath).

## Gated events

- initial subscription
- subscription renewal
- upgrade
- downgrade where commercial entitlement changes materially
- new payment method
- billing-country change
- residence-country change
- organisation-country change
- creation of a paying organisation
- one-off purchase
- activation of a paid service
- provider webhook indicating material commercial-context change
- entitlement reactivation

Corresponding codes: `COMMERCIAL_ELIGIBILITY_GATED_EVENTS`.

## Validity

Do not treat a missing, stale, `BLOCK`, or `REVIEW` decision as `ALLOW`. TTL/freshness is product- or Account-specific; this foundation does not invent an arbitrary TTL.
