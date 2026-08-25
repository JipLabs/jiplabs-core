import { describe, expect, it, vi } from "vitest";
import {
  assertAuthorizationBinding,
  computeActionRequestContentHash,
  executeGovernedAction,
  GovernanceErrorCode,
  revokeAuthorityGrant,
  transitionRun,
  type DomainExecutionReconciler,
} from "../src/index.js";
import {
  activePolicy,
  AT,
  baseAuthority,
  buildAdapter,
  buildHarness,
  buildProposal,
  governorIds,
  PROVENANCE,
  rollbackPlan,
  TEST_RESOURCE,
  verifiedRollbackOutcome,
  activeGrant,
} from "./helpers/governor-harness.js";
import { createAuthority, createAuthorityGrant } from "../src/index.js";

describe("CORE-01 execution-safety audit", () => {
  it("1. authorization binds exact action request and rejects tampering", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    const authorization = result.run.actionAuthorization!;
    const actionRequest = result.run.actionRequest!;
    expect(authorization.actionRequestContentHash).toBe(
      computeActionRequestContentHash({
        decisionId: actionRequest.decisionId,
        action: actionRequest.action,
        subject: actionRequest.subject,
      }),
    );
    expect(authorization.resourceKey).toBe(result.run.resourceKey);
    expect(authorization.authorityGrantContentHash).toMatch(/^[a-f0-9]{64}$|^none$/);
    expect(() =>
      assertAuthorizationBinding({
        authorization,
        actionRequest,
        action: "DIFFERENT_ACTION",
        subject: actionRequest.subject,
        executorActorId: input.executorActorId,
        resourceKey: result.run.resourceKey,
      }),
    ).toThrow();
  });

  it("2. execution rejects authorization bound to a different action payload", async () => {
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ adapter });
    const result = await kernel.run(input);
    await expect(
      executeGovernedAction({
        authorization: result.run.actionAuthorization!,
        decision: result.run.decision!,
        actionRequest: result.run.actionRequest!,
        actionRequestId: result.run.actionRequest!.id,
        action: "TAMPERED",
        subject: result.run.actionRequest!.subject,
        resourceKey: result.run.resourceKey,
        executorActorId: input.executorActorId,
        executor: adapter.actionExecutor,
        actionResultId: "tampered-result",
        executionAttemptId: "attempt-tampered",
        at: AT,
        provenance: PROVENANCE,
      }),
    ).rejects.toMatchObject({
      code: GovernanceErrorCode.AUTHORIZATION_BINDING_MISMATCH,
    });
  });

  it("3. same idempotency key with different fingerprint returns IDEMPOTENCY_CONFLICT", async () => {
    const { kernel, input } = buildHarness({ idempotencyKey: "shared-key" });
    await kernel.run(input);
    const conflict = await kernel.run({
      ...input,
      ids: governorIds("run-2"),
      proposal: buildProposal("OTHER"),
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.code).toBe(GovernanceErrorCode.IDEMPOTENCY_CONFLICT);
  });

  it("4. same idempotency key with same fingerprint replays without duplicate execution", async () => {
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ adapter, idempotencyKey: "replay-key" });
    await kernel.run(input);
    await kernel.run(input);
    expect(adapter.actionExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("5. crash gap resume reconciles executed side effect without duplicate execution", async () => {
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const, resultRef: "once" }));
    const reconcileSpy = vi.fn(() => "EXECUTED" as const);
    const reconciler: DomainExecutionReconciler = {
      domain: "test-domain",
      reconcile: reconcileSpy,
    };
    const adapter = buildAdapter({ execute: executeSpy });
    adapter.executionReconciler = reconciler;
    const { kernel, input } = buildHarness({ adapter, runId: "crash-run" });
    const started = await kernel.run(input);
    const crashed = transitionRun(started.run, "ACTION_EXECUTING", AT, {
      checkpoint: "ACTION_STARTED",
      actionResult: undefined,
      executionAttempt: {
        attemptId: `${started.run.runId}:attempt:1`,
        startedAt: AT,
        status: "STARTED",
        resultRef: "once",
      },
    });
    kernel.runStore.save(crashed);
    const resumed = await kernel.resume(crashed.runId, input);
    expect(resumed.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    expect(resumed.run.actionResult?.resultRef).toBe("once");
  });

  it("6. crash gap without reconciler fails closed to RECONCILIATION_REQUIRED", async () => {
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ adapter, runId: "no-reconciler" });
    const started = await kernel.run(input);
    const crashed = transitionRun(started.run, "ACTION_EXECUTING", AT, {
      checkpoint: "ACTION_STARTED",
      actionResult: undefined,
      outcome: undefined,
      evaluation: undefined,
      disposition: undefined,
      executionAttempt: {
        attemptId: `${started.run.runId}:attempt:1`,
        startedAt: AT,
        status: "STARTED",
      },
    });
    kernel.runStore.save(crashed);
    const resumed = await kernel.resume(crashed.runId, input);
    expect(resumed.ok).toBe(false);
    expect(resumed.state).toBe("RECONCILIATION_REQUIRED");
    expect(resumed.code).toBe(GovernanceErrorCode.RECONCILIATION_REQUIRED);
  });

  it("7. revoked authority after valid decision blocks execution while preserving decision", async () => {
    const adapter = buildAdapter();
    const { kernel, input, grant, authority } = buildHarness({ adapter });
    const result = await kernel.run(input);
    const originalDecisionId = result.run.decision!.id;
    const rewind = transitionRun(result.run, "ACTION_AUTHORIZED", AT, {
      checkpoint: "ACTION_AUTHORIZED",
      actionResult: undefined,
      outcome: undefined,
      evaluation: undefined,
      disposition: undefined,
      state: "ACTION_AUTHORIZED",
    });
    kernel.runStore.save(rewind);
    const revokedGrant = revokeAuthorityGrant(grant!, {
      at: "2026-08-26T00:00:00.000Z",
      revokedByActorId: "issuer",
      reason: "revoked before execution",
    });
    const blocked = await kernel.resume(rewind.runId, {
      ...input,
      grant: revokedGrant,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe(GovernanceErrorCode.EXECUTION_AUTHORITY_STALE);
    expect(blocked.run.decision?.id).toBe(originalDecisionId);
    expect(adapter.actionExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("8. rollback emits COMPLETED only after verification succeeds", async () => {
    const { kernel, input } = buildHarness({
      policy: activePolicy({
        autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
        rollbackRequirements: { required: true },
      }),
      rollbackPlan: rollbackPlan(),
    });
    const run = await kernel.run({
      ...input,
      adapter: buildAdapter({
        evaluate: () => ({ verdict: "INCORRECT", rationale: "bad" }),
      }),
    });
    const rollbackAuthority = createAuthority({
      id: "auth-rollback-audit",
      code: "ROLLBACK",
      scopes: ["ROLLBACK_MODEL"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rollbackGrant = createAuthorityGrant({
      id: "grant-rollback-audit",
      actorId: "actor-governor",
      authority: rollbackAuthority,
      scopes: ["ROLLBACK_MODEL"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const unverified = await kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rollbackAuthority,
      grant: rollbackGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-unverified",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: () => ({
        status: "COMPLETED",
        verificationResult: { kind: "state", actual: "wrong" },
      }),
    });
    expect(unverified.ok).toBe(false);
    expect(unverified.state).toBe("ROLLBACK_FAILED");
    expect(unverified.code).toBe(GovernanceErrorCode.ROLLBACK_VERIFICATION_FAILED);
    expect(unverified.run.decision?.id).toBe(run.run.decision!.id);

    const verified = await kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rollbackAuthority,
      grant: rollbackGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-verified",
      idempotencyKey: `rollback:${run.run.runId}:verified`,
      at: AT,
      provenance: PROVENANCE,
      executeRollback: () => verifiedRollbackOutcome(),
    });
    expect(verified.ok).toBe(true);
    expect(verified.state).toBe("ROLLBACK_COMPLETED");
  });

  it("9. rollback idempotency keys cannot reuse action idempotency namespace", async () => {
    const { kernel, input } = buildHarness();
    const run = await kernel.run(input);
    await expect(
      kernel.executeRollback({
        runId: run.run.runId,
        actorId: "actor-governor",
        authority: baseAuthority(["ROLLBACK_MODEL"]),
        grant: activeGrant("actor-governor", baseAuthority(["ROLLBACK_MODEL"]), {
          scopes: ["ROLLBACK_MODEL"],
        }),
        resource: TEST_RESOURCE,
        rollbackPlan: rollbackPlan(),
        rollbackExecutionId: "rb-ns",
        idempotencyKey: input.idempotencyKey,
        at: AT,
        provenance: PROVENANCE,
        executeRollback: () => verifiedRollbackOutcome(),
      }),
    ).rejects.toThrow(/rollback idempotency key must start with rollback:/);
  });

  it("10. GovernorKernel depends on store/ledger/claim abstractions", () => {
    const { kernel } = buildHarness();
    expect(typeof kernel.runStore.get).toBe("function");
    expect(typeof kernel.runStore.save).toBe("function");
    expect(typeof kernel.runStore.getByIdempotencyKey).toBe("function");
    expect(typeof kernel.runStore.getIdempotencyBinding).toBe("function");
  });
});
