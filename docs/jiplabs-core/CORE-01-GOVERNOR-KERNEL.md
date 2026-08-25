# CORE-01 Governor Kernel

## Mission

CORE-01 implements the first operational governance runtime for JipLabs Core. It consumes CORE-00 contracts and executes the governed lifecycle:

```
Proposal → Authority → Policy → Decision → ActionAuthorization → Execution
  → Outcome → Evaluation → Disposition → (Rollback / Override)
```

## Architecture

```
GovernorKernel
├── deterministic governance (evaluateDecisionProposal, state machine)
├── GovernanceLedger (append-only, temporal refs)
├── GovernanceRunStore (runtime state + idempotency)
├── ExecutionClaimStore (resource serialization)
├── GovernedActionAuthorization (explicit execution gate)
├── executeGovernedAction (DomainActionExecutor boundary)
└── DomainOutcomeEvaluator (post-outcome evaluation)
```

Core governs. Domain executes semantics.

## Entry point

```typescript
import { GovernorKernel, InMemoryGovernanceLedger } from "@jiplabs/core";

const kernel = new GovernorKernel({ ledger: new InMemoryGovernanceLedger() });
const result = await kernel.run(input);
```

## Autonomy modes

| Mode | Behavior |
|------|----------|
| `AUTONOMOUS` | Execute when authority and policy pass |
| `AUTONOMOUS_WITH_ROLLBACK` | Require rollback readiness before execution |
| `AUTONOMOUS_CANARY` | Execute only when canary constraints satisfied |
| `HUMAN_APPROVAL_REQUIRED` | Decision created; execution waits for approval |
| `BLOCKED` | No execution path |

Human approval is **policy-driven**, not global.

## Non-goals

- No JipComply or Quinté production integration
- No LLM runtime
- No external API calls
- No distributed orchestration

See also: [Governed Runtime Lifecycle](GOVERNED-RUNTIME-LIFECYCLE.md), [Action Authorization](ACTION-AUTHORIZATION.md), [Failure Recovery](FAILURE-RECOVERY.md).
