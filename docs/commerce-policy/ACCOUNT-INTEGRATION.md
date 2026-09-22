# Account integration — commercial eligibility

JipLabs Account is the intended central evaluator because it owns customer and organisation identity context.

This workspace does not contain the Account service. The contract below is the implementation requirement.

## Endpoint

```text
POST /policy/evaluate/commercial-eligibility
```

Account MUST call `evaluateCommercialEligibility` from `@jiplabs/commerce-policy`. Account MUST NOT implement a second jurisdiction engine.

## Request

```json
{
  "subject": { "type": "account", "id": "acct_123" },
  "context": {
    "residenceCountry": "FR",
    "organisationCountry": "FR",
    "billingCountry": "FR",
    "paymentContext": { "provider": "stripe", "present": true }
  },
  "policyVersion": "v1",
  "overlays": ["stripe"],
  "trigger": "INITIAL_SUBSCRIPTION"
}
```

Country values are ISO 3166-1 alpha-2. IP geolocation is not authoritative residence.

## Response

Governed evaluation (including `BLOCK` and `REVIEW`):

```json
{
  "ok": true,
  "decision": "ALLOW",
  "policyId": "commercial-jurisdiction",
  "policyVersion": "v1",
  "reasonCodes": [],
  "evaluatedAt": "2026-09-21T16:00:00.000Z"
}
```

Operational failure (timeout, unknown version, evaluator throw):

```json
{
  "ok": false,
  "decision": null,
  "code": "POLICY_VERSION_UNKNOWN",
  "message": "...",
  "evaluatedAt": "2026-09-21T16:00:00.000Z"
}
```

`REVIEW` is not an HTTP error. Failure is not `ALLOW`.

## Follow-up

Implement the route in JipLabs Account by mapping the request onto `evaluateCommercialEligibility` and returning `toAccountCommercialEligibilityResponse`. Persist the serialized Core result for historical replay.
