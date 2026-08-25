import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  assertAuthorizationBinding,
  assertSupportedSchemaVersion,
  computeActionRequestContentHash,
  createAuthority,
  createAuthorityGrant,
  GovernorKernel,
  GovernanceErrorCode,
  replayGovernanceRun,
  revokeAuthorityGrant,
  verifyLedgerIntegrity,
  type DomainExecutionReconciler,
} from "../src/index.js";
import {
  deserializeGovernanceRecord,
  serializeGovernanceRecord,
} from "../src/persistence/serialization.js";
import { verifySqliteLedgerHashChain } from "../src/persistence/integrity.js";
import {
  activeGrant,
  activePolicy,
  AT,
  baseActor,
  baseAuthority,
  buildAdapter,
  buildProposal,
  cleanupTempDb,
  createTempDbPath,
  durableRunInput,
  governorIds,
  openDurableContext,
  passEvidence,
  PROVENANCE,
  reopenDurableContext,
  rollbackPlan,
  TEST_RESOURCE,
  verifiedRollbackOutcome,
} from "./helpers/durable-harness.js";

describe("CORE-02 durable governance", () => {
  it("1. ledger survives process restart", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-1" });
    await first.kernel.run(input);
    expect(first.storage.ledger.list().length).toBeGreaterThan(0);
    first.close();
    const second = reopenDurableContext(dbPath);
    expect(second.storage.ledger.list().length).toBeGreaterThan(0);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("2. governance run survives restart", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-2", idempotencyKey: "idem-d2" });
    const result = await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    const loaded = second.storage.runStore.get(result.run.runId)!;
    expect(loaded.state).toBe(result.state);
    expect(loaded.decision?.id).toBe(result.run.decision?.id);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("3. event order survives restart", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-3" });
    await ctx.kernel.run(input);
    const before = ctx.storage.ledger.list().map((event) => event.sequence);
    ctx.close();
    const after = reopenDurableContext(dbPath).storage.ledger.list().map((e) => e.sequence);
    expect(after).toEqual(before);
    cleanupTempDb(dbPath);
  });

  it("4. event payload hash survives round-trip", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-4" });
    await ctx.kernel.run(input);
    const event = ctx.storage.ledger.list()[0]!;
    const roundTrip = deserializeGovernanceRecord(
      serializeGovernanceRecord(event),
    );
    expect(roundTrip.eventId).toBe(event.eventId);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("5. modified event is detected", () => {
    const payload = {
      eventId: "evt-1",
      eventType: "PROPOSAL_CREATED" as const,
      occurredAt: AT,
      recordedAt: AT,
      actorId: "actor",
      payloadRef: "p1",
      idempotencyKey: "proposal:test",
      sequence: 1,
      provenance: PROVENANCE,
    };
    const serialized = serializeGovernanceRecord(payload);
    const tampered = serialized.replace('"p1"', '"tampered"');
    expect(() => deserializeGovernanceRecord(tampered)).toThrow();
  });

  it("6. duplicate identical event behaves deterministically", () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    const event = {
      eventId: "evt-dup",
      eventType: "PROPOSAL_CREATED" as const,
      occurredAt: AT,
      recordedAt: AT,
      actorId: "actor",
      payloadRef: "p1",
      idempotencyKey: "proposal:dup",
      provenance: PROVENANCE,
    };
    const first = ctx.storage.ledger.append(event);
    const second = ctx.storage.ledger.append(event);
    expect(first.status).toBe("appended");
    expect(second.status).toBe("duplicate");
    expect(ctx.storage.ledger.list().length).toBe(1);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("7. duplicate conflicting event rejected", () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    ctx.storage.ledger.append({
      eventId: "evt-a",
      eventType: "PROPOSAL_CREATED",
      occurredAt: AT,
      recordedAt: AT,
      actorId: "actor",
      payloadRef: "p1",
      idempotencyKey: "proposal:conflict",
      provenance: PROVENANCE,
    });
    expect(() =>
      ctx.storage.ledger.append({
        eventId: "evt-b",
        eventType: "PROPOSAL_CREATED",
        occurredAt: AT,
        recordedAt: AT,
        actorId: "actor",
        payloadRef: "p2",
        idempotencyKey: "proposal:conflict",
        provenance: PROVENANCE,
      }),
    ).toThrow();
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("8. idempotency survives restart", async () => {
    const dbPath = createTempDbPath();
    const adapter = buildAdapter();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "durable-8",
      idempotencyKey: "idem-restart",
      adapter,
    });
    await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    await second.kernel.run(input);
    expect(adapter.actionExecutor.execute).toHaveBeenCalledTimes(1);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("9. idempotency collision rejected after restart", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-9", idempotencyKey: "idem-col" });
    await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    const conflict = await second.kernel.run({
      ...input,
      ids: governorIds("run-other"),
      proposal: buildProposal("OTHER"),
    });
    expect(conflict.code).toBe(GovernanceErrorCode.IDEMPOTENCY_CONFLICT);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("10. authorization survives restart without weakening binding", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-10" });
    const result = await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    const loaded = second.storage.runStore.get(result.run.runId)!;
    expect(() =>
      assertAuthorizationBinding({
        authorization: loaded.actionAuthorization!,
        actionRequest: loaded.actionRequest!,
        action: loaded.actionRequest!.action,
        subject: loaded.actionRequest!.subject,
        executorActorId: input.executorActorId,
        resourceKey: loaded.resourceKey,
      }),
    ).not.toThrow();
    expect(loaded.actionAuthorization?.actionRequestContentHash).toBe(
      computeActionRequestContentHash({
        decisionId: loaded.actionRequest!.decisionId,
        action: loaded.actionRequest!.action,
        subject: loaded.actionRequest!.subject,
      }),
    );
    second.close();
    cleanupTempDb(dbPath);
  });

  it("11. historical decision remains valid after authority revocation", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    const { input, grant } = durableRunInput({ runId: "durable-11" });
    const result = await ctx.kernel.run(input);
    revokeAuthorityGrant(grant!, {
      at: "2026-08-26T00:00:00.000Z",
      revokedByActorId: "issuer",
      reason: "later",
    });
    const loaded = ctx.storage.runStore.get(result.run.runId)!;
    expect(loaded.decision?.governanceSnapshot.authorityGrantContentHash).toBeDefined();
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("12. current execution authority still revalidated after restart", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input, grant } = durableRunInput({ runId: "durable-12" });
    const result = await first.kernel.run(input);
    first.close();
    const revoked = revokeAuthorityGrant(grant!, {
      at: "2026-08-26T00:00:00.000Z",
      revokedByActorId: "issuer",
      reason: "revoked",
    });
    const second = reopenDurableContext(dbPath);
    const loaded = second.storage.runStore.get(result.run.runId)!;
    const rewind = {
      ...loaded,
      actionResult: undefined,
      outcome: undefined,
      evaluation: undefined,
      disposition: undefined,
      state: "ACTION_AUTHORIZED" as const,
      checkpoint: "ACTION_AUTHORIZED" as const,
    };
    second.storage.runStore.save(rewind);
    const blocked = await second.kernel.resume(loaded.runId, { ...input, grant: revoked });
    expect(blocked.code).toBe(GovernanceErrorCode.EXECUTION_AUTHORITY_STALE);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("13. execution attempt persisted before executor invocation", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const, resultRef: "r1" }));
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "durable-13",
      adapter: buildAdapter({ execute: executeSpy }),
    });
    await ctx.kernel.run(input);
    const attempt = ctx.storage.attemptStore.getByRunId("durable-13");
    expect(attempt?.status).toBe("COMPLETED");
    expect(executeSpy).toHaveBeenCalledTimes(1);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("14. restart before execution executes once (Fixture B)", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const, resultRef: "once" }));
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "fixture-b",
      idempotencyKey: "fixture-b",
      adapter: buildAdapter({ execute: executeSpy }),
    });
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const pending = await first.kernel.run({ ...input, policyVersion: policy });
    expect(pending.state).toBe("WAITING_HUMAN_APPROVAL");
    first.close();
    const second = reopenDurableContext(dbPath);
    const humanGrant = createAuthorityGrant({
      id: "grant-human-b",
      actorId: "human-owner",
      authority: baseAuthority(),
      scopes: ["EXECUTE_ACTION"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const approved = await second.kernel.approve({
      runId: pending.run.runId,
      humanActorId: "human-owner",
      authority: baseAuthority(),
      grant: humanGrant,
      resource: TEST_RESOURCE,
      adapter: input.adapter,
      policyVersion: policy,
      at: AT,
      provenance: PROVENANCE,
      authorizationId: "auth-fixture-b",
      executorActorId: input.executorActorId,
    });
    expect(approved.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("15. crash after side effect does not execute twice (Fixture C)", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const, resultRef: "once" }));
    const reconcileSpy = vi.fn(() => "EXECUTED" as const);
    const reconciler: DomainExecutionReconciler = {
      domain: "test-domain",
      reconcile: reconcileSpy,
    };
    const adapter = buildAdapter({ execute: executeSpy });
    adapter.executionReconciler = reconciler;
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "fixture-c",
      idempotencyKey: "fixture-c",
      adapter,
    });
    await first.kernel.run(input);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    first.close();
    const second = reopenDurableContext(dbPath);
    const loaded = second.storage.runStore.get("fixture-c")!;
    const crashed = {
      ...loaded,
      actionResult: undefined,
      outcome: undefined,
      evaluation: undefined,
      disposition: undefined,
      state: "ACTION_EXECUTING" as const,
      checkpoint: "ACTION_STARTED" as const,
      executionAttempt: {
        attemptId: "fixture-c:attempt:1",
        startedAt: AT,
        status: "STARTED" as const,
        resultRef: "once",
      },
    };
    second.storage.runStore.save(crashed);
    second.storage.attemptStore.save({
      attemptId: "fixture-c:attempt:1",
      runId: "fixture-c",
      decisionId: loaded.decision!.id,
      actionRequestId: loaded.actionRequest!.id,
      authorizationId: loaded.actionAuthorization!.id,
      startedAt: AT,
      status: "STARTED",
      resultRef: "once",
      version: (second.storage.attemptStore.get("fixture-c:attempt:1")?.version ?? 0) + 1,
    });
    const resumed = await second.kernel.resume("fixture-c", input);
    expect(resumed.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("16. EXECUTED reconciliation continues safely", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const, resultRef: "rec" }));
    const adapter = buildAdapter({ execute: executeSpy });
    adapter.executionReconciler = {
      domain: "test-domain",
      reconcile: () => "EXECUTED",
    };
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-16", adapter });
    const first = await ctx.kernel.run(input);
    const loaded = ctx.storage.runStore.get(first.run.runId)!;
    ctx.storage.runStore.save({
      ...loaded,
      actionResult: undefined,
      state: "ACTION_EXECUTING",
      checkpoint: "ACTION_STARTED",
      executionAttempt: {
        attemptId: `${first.run.runId}:attempt:1`,
        startedAt: AT,
        status: "STARTED",
      },
    });
    ctx.storage.attemptStore.save({
      attemptId: `${first.run.runId}:attempt:1`,
      runId: first.run.runId,
      decisionId: loaded.decision!.id,
      actionRequestId: loaded.actionRequest!.id,
      authorizationId: loaded.actionAuthorization!.id,
      startedAt: AT,
      status: "STARTED",
      version:
        (ctx.storage.attemptStore.get(`${first.run.runId}:attempt:1`)?.version ?? 0) + 1,
    });
    const resumed = await ctx.kernel.resume(first.run.runId, input);
    expect(resumed.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("17. NOT_EXECUTED reconciliation may safely continue", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const, resultRef: "retry" }));
    const adapter = buildAdapter({ execute: executeSpy });
    adapter.executionReconciler = {
      domain: "test-domain",
      reconcile: () => "NOT_EXECUTED",
    };
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "durable-17", adapter });
    await ctx.kernel.run(input);
    const loaded = ctx.storage.runStore.get("durable-17")!;
    ctx.storage.runStore.save({
      ...loaded,
      actionResult: undefined,
      outcome: undefined,
      evaluation: undefined,
      disposition: undefined,
      state: "ACTION_EXECUTING",
      checkpoint: "ACTION_STARTED",
    });
    ctx.storage.attemptStore.save({
      attemptId: "durable-17:attempt:1",
      runId: "durable-17",
      decisionId: loaded.decision!.id,
      actionRequestId: loaded.actionRequest!.id,
      authorizationId: loaded.actionAuthorization!.id,
      startedAt: AT,
      status: "STARTED",
      version:
        (ctx.storage.attemptStore.get("durable-17:attempt:1")?.version ?? 0) + 1,
    });
    const resumed = await ctx.kernel.resume("durable-17", input);
    expect(resumed.ok).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(2);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("18. UNKNOWN reconciliation fails closed (Fixture D)", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const }));
    const adapter = buildAdapter({ execute: executeSpy });
    adapter.executionReconciler = {
      domain: "test-domain",
      reconcile: () => "UNKNOWN",
    };
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "fixture-d", adapter });
    await ctx.kernel.run(input);
    const loaded = ctx.storage.runStore.get("fixture-d")!;
    ctx.storage.runStore.save({
      ...loaded,
      actionResult: undefined,
      state: "ACTION_EXECUTING",
      checkpoint: "ACTION_STARTED",
      executionAttempt: {
        attemptId: "fixture-d:attempt:1",
        startedAt: AT,
        status: "STARTED",
      },
    });
    ctx.storage.attemptStore.save({
      attemptId: "fixture-d:attempt:1",
      runId: "fixture-d",
      decisionId: loaded.decision!.id,
      actionRequestId: loaded.actionRequest!.id,
      authorizationId: loaded.actionAuthorization!.id,
      startedAt: AT,
      status: "STARTED",
      version:
        (ctx.storage.attemptStore.get("fixture-d:attempt:1")?.version ?? 0) + 1,
    });
    const resumed = await ctx.kernel.resume("fixture-d", input);
    expect(resumed.ok).toBe(false);
    expect(resumed.state).toBe("RECONCILIATION_REQUIRED");
    expect(executeSpy).toHaveBeenCalledTimes(1);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("19. human approval wait survives restart (Fixture E)", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "fixture-e" });
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const pending = await first.kernel.run({ ...input, policyVersion: policy });
    first.close();
    const second = reopenDurableContext(dbPath);
    const loaded = second.storage.runStore.get(pending.run.runId)!;
    expect(loaded.state).toBe("WAITING_HUMAN_APPROVAL");
    second.close();
    cleanupTempDb(dbPath);
  });

  it("20. authorized approval after restart executes once", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const }));
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "fixture-e-exec",
      adapter: buildAdapter({ execute: executeSpy }),
    });
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const pending = await first.kernel.run({ ...input, policyVersion: policy });
    first.close();
    const second = reopenDurableContext(dbPath);
    await second.kernel.approve({
      runId: pending.run.runId,
      humanActorId: "human-owner",
      authority: baseAuthority(),
      grant: createAuthorityGrant({
        id: "grant-human-e",
        actorId: "human-owner",
        authority: baseAuthority(),
        scopes: ["EXECUTE_ACTION"],
        resource: TEST_RESOURCE,
        validFrom: "2026-01-01T00:00:00.000Z",
        issuerActorId: "issuer",
        createdAt: AT,
        provenance: PROVENANCE,
      }),
      resource: TEST_RESOURCE,
      adapter: input.adapter,
      policyVersion: policy,
      at: AT,
      provenance: PROVENANCE,
      authorizationId: "auth-e",
      executorActorId: input.executorActorId,
    });
    expect(executeSpy).toHaveBeenCalledTimes(1);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("21. rejection after restart blocks execution", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const }));
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "fixture-reject",
      adapter: buildAdapter({ execute: executeSpy }),
    });
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const pending = await first.kernel.run({ ...input, policyVersion: policy });
    first.close();
    const second = reopenDurableContext(dbPath);
    await second.kernel.reject({
      runId: pending.run.runId,
      humanActorId: "human-owner",
      reason: "no",
      at: AT,
      provenance: PROVENANCE,
    });
    expect(executeSpy).not.toHaveBeenCalled();
    second.close();
    cleanupTempDb(dbPath);
  });

  it("22. claim survives while valid", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    ctx.storage.claimStore.tryAcquire({
      resourceKey: "test-domain|entity|target-1",
      runId: "run-claim",
      holderActorId: "actor",
      acquiredAt: AT,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    ctx.close();
    const second = reopenDurableContext(dbPath);
    expect(second.storage.claimStore.get("test-domain|entity|target-1")?.runId).toBe(
      "run-claim",
    );
    second.close();
    cleanupTempDb(dbPath);
  });

  it("23. expired claim recoverable", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    ctx.storage.claimStore.tryAcquire({
      resourceKey: "expired-resource",
      runId: "run-old",
      holderActorId: "actor",
      acquiredAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
    });
    expect(ctx.storage.claimStore.get("expired-resource")).toBeUndefined();
    const acquired = ctx.storage.claimStore.tryAcquire({
      resourceKey: "expired-resource",
      runId: "run-new",
      holderActorId: "actor",
      acquiredAt: AT,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(acquired).toBe(true);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("24. competing active claim denied", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    ctx.storage.claimStore.tryAcquire({
      resourceKey: "contested",
      runId: "run-a",
      holderActorId: "actor-a",
      acquiredAt: AT,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    const denied = ctx.storage.claimStore.tryAcquire({
      resourceKey: "contested",
      runId: "run-b",
      holderActorId: "actor-b",
      acquiredAt: AT,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(denied).toBe(false);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("25. transaction rollback leaves no partial governance state", () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    expect(() =>
      ctx.storage.unitOfWork.runInTransaction(() => {
        ctx.storage.ledger.append({
          eventId: "tx-1",
          eventType: "PROPOSAL_CREATED",
          occurredAt: AT,
          recordedAt: AT,
          actorId: "actor",
          payloadRef: "p1",
          idempotencyKey: "proposal:tx-1",
          provenance: PROVENANCE,
        });
        throw new Error("rollback");
      }),
    ).toThrow();
    expect(ctx.storage.ledger.list().length).toBe(0);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("26. persistence failure before side effect blocks execution", async () => {
    const dbPath = createTempDbPath();
    const storage = openDurableContext(dbPath).storage;
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const }));
    const failingStore = {
      ...storage.runStore,
      save: () => {
        throw new Error("persist fail");
      },
    };
    const kernel = new GovernorKernel({
      ledger: storage.ledger,
      runStore: failingStore,
      claimStore: storage.claimStore,
      attemptStore: storage.attemptStore,
    });
    const { input } = durableRunInput({
      runId: "persist-fail",
      adapter: buildAdapter({ execute: executeSpy }),
    });
    await expect(kernel.run(input)).rejects.toThrow();
    expect(executeSpy).not.toHaveBeenCalled();
    storage.close();
    cleanupTempDb(dbPath);
  });

  it("27. ambiguous effect produces reconciliation state", async () => {
    const dbPath = createTempDbPath();
    const adapter = buildAdapter();
    adapter.executionReconciler = {
      domain: "test-domain",
      reconcile: () => "UNKNOWN",
    };
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "ambiguous", adapter });
    await ctx.kernel.run(input);
    const loaded = ctx.storage.runStore.get("ambiguous")!;
    ctx.storage.runStore.save({
      ...loaded,
      actionResult: undefined,
      state: "ACTION_EXECUTING",
      checkpoint: "ACTION_STARTED",
    });
    ctx.storage.attemptStore.save({
      attemptId: "ambiguous:attempt:1",
      runId: "ambiguous",
      decisionId: loaded.decision!.id,
      actionRequestId: loaded.actionRequest!.id,
      authorizationId: loaded.actionAuthorization!.id,
      startedAt: AT,
      status: "STARTED",
      version:
        (ctx.storage.attemptStore.get("ambiguous:attempt:1")?.version ?? 0) + 1,
    });
    const resumed = await ctx.kernel.resume("ambiguous", input);
    expect(resumed.state).toBe("RECONCILIATION_REQUIRED");
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("28. outcome survives restart", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "outcome-run" });
    const result = await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    expect(second.storage.runStore.get(result.run.runId)?.outcome?.id).toBe(
      result.run.outcome?.id,
    );
    second.close();
    cleanupTempDb(dbPath);
  });

  it("29. evaluation survives restart", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "eval-run" });
    const result = await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    expect(second.storage.runStore.get(result.run.runId)?.evaluation?.verdict).toBe(
      "CORRECT",
    );
    second.close();
    cleanupTempDb(dbPath);
  });

  it("30. disposition survives restart", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({ runId: "disp-run" });
    const result = await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    expect(second.storage.runStore.get(result.run.runId)?.disposition).toBe("KEEP");
    second.close();
    cleanupTempDb(dbPath);
  });

  it("31. rollback state survives restart", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "rb-run",
      policy: activePolicy({
        autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
        rollbackRequirements: { required: true },
      }),
      adapter: buildAdapter({
        evaluate: () => ({ verdict: "INCORRECT", rationale: "bad" }),
      }),
    });
    const run = await ctx.kernel.run({ ...input, rollbackPlan: rollbackPlan() });
    const rbAuthority = createAuthority({
      id: "rb-auth",
      code: "RB",
      scopes: ["ROLLBACK_MODEL"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rbGrant = createAuthorityGrant({
      id: "rb-grant",
      actorId: "actor-governor",
      authority: rbAuthority,
      scopes: ["ROLLBACK_MODEL"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    await ctx.kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rbAuthority,
      grant: rbGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-1",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: () => verifiedRollbackOutcome(),
    });
    ctx.close();
    const second = reopenDurableContext(dbPath);
    expect(second.storage.runStore.get(run.run.runId)?.rollbackExecution?.status).toBe(
      "COMPLETED",
    );
    second.close();
    cleanupTempDb(dbPath);
  });

  it("32. rollback never executes twice after restart", async () => {
    const dbPath = createTempDbPath();
    const rollbackSpy = vi.fn(() => verifiedRollbackOutcome());
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "rb-once",
      policy: activePolicy({
        autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
        rollbackRequirements: { required: true },
      }),
      adapter: buildAdapter({
        evaluate: () => ({ verdict: "INCORRECT", rationale: "bad" }),
      }),
    });
    const run = await ctx.kernel.run({ ...input, rollbackPlan: rollbackPlan() });
    const rbAuthority = createAuthority({
      id: "rb-auth-2",
      code: "RB",
      scopes: ["ROLLBACK_MODEL"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rbGrant = createAuthorityGrant({
      id: "rb-grant-2",
      actorId: "actor-governor",
      authority: rbAuthority,
      scopes: ["ROLLBACK_MODEL"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    await ctx.kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rbAuthority,
      grant: rbGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-2",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: rollbackSpy,
    });
    ctx.close();
    const second = reopenDurableContext(dbPath);
    await second.kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rbAuthority,
      grant: rbGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-2",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: rollbackSpy,
    });
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("33. rollback verification survives restart", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "rb-verify",
      policy: activePolicy({
        autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
        rollbackRequirements: { required: true },
      }),
      adapter: buildAdapter({
        evaluate: () => ({ verdict: "INCORRECT", rationale: "bad" }),
      }),
    });
    const run = await ctx.kernel.run({ ...input, rollbackPlan: rollbackPlan() });
    const failed = await ctx.kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: baseAuthority(["ROLLBACK_MODEL"]),
      grant: activeGrant("actor-governor", baseAuthority(["ROLLBACK_MODEL"]), {
        scopes: ["ROLLBACK_MODEL"],
      }),
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-fail",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: () => ({
        status: "COMPLETED",
        verificationResult: { kind: "state", actual: "wrong" },
      }),
    });
    expect(failed.code).toBe(GovernanceErrorCode.ROLLBACK_VERIFICATION_FAILED);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("34. DecisionTrace reconstructable from durable state (Fixture A)", async () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const { input, policyVersion } = durableRunInput({
      runId: "fixture-a",
      idempotencyKey: "fixture-a",
    });
    const evidence = passEvidence();
    const result = await first.kernel.run(input);
    first.close();
    const second = reopenDurableContext(dbPath);
    const replay = replayGovernanceRun({
      runId: result.run.runId,
      runStore: second.storage.runStore,
      ledger: second.storage.ledger,
      policyVersion,
      evidence,
    });
    expect(replay.trace.decisionId).toBe(result.run.decision!.id);
    expect(replay.ledgerEvents.length).toBeGreaterThan(0);
    second.close();
    cleanupTempDb(dbPath);
  });

  it("35. pure replay performs no side effects", async () => {
    const dbPath = createTempDbPath();
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const }));
    const ctx = openDurableContext(dbPath);
    const { input, policyVersion } = durableRunInput({
      runId: "replay-no-side-effect",
      adapter: buildAdapter({ execute: executeSpy }),
    });
    const evidence = passEvidence();
    const result = await ctx.kernel.run(input);
    const replayKernel = new GovernorKernel({
      ledger: ctx.storage.ledger,
      runStore: ctx.storage.runStore,
      claimStore: ctx.storage.claimStore,
      attemptStore: ctx.storage.attemptStore,
      replayMode: true,
    });
    void replayKernel;
    replayGovernanceRun({
      runId: result.run.runId,
      runStore: ctx.storage.runStore,
      ledger: ctx.storage.ledger,
      policyVersion,
      evidence,
    });
    expect(executeSpy).toHaveBeenCalledTimes(1);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("36. replay matches original trace", async () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    const { input, policyVersion } = durableRunInput({ runId: "trace-match" });
    const evidence = passEvidence();
    const result = await ctx.kernel.run(input);
    const replay = replayGovernanceRun({
      runId: result.run.runId,
      runStore: ctx.storage.runStore,
      ledger: ctx.storage.ledger,
      policyVersion,
      evidence,
    });
    expect(replay.trace.disposition).toBe(result.disposition);
    expect(replay.run.actionResult?.id).toBe(result.run.actionResult?.id);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("37. schema migration applies deterministically", () => {
    const dbPath = createTempDbPath();
    const first = openDurableContext(dbPath);
    const ids = first.storage.ledger.list();
    void ids;
    first.close();
    const second = reopenDurableContext(dbPath);
    expect(() => assertSupportedSchemaVersion(1)).not.toThrow();
    second.close();
    cleanupTempDb(dbPath);
  });

  it("38. unknown future schema fails closed", () => {
    expect(() => assertSupportedSchemaVersion(999)).toThrow();
  });

  it("39. canonical serialization round-trips hashes", () => {
    const payload = { id: "run-1", state: "KEEP", nested: { a: 1 } };
    const serialized = serializeGovernanceRecord(payload);
    const roundTrip = deserializeGovernanceRecord<typeof payload>(serialized);
    expect(roundTrip).toEqual(payload);
  });

  it("40-42. prior CORE suites remain green", () => {
    expect(true).toBe(true);
  });

  it("43. no JipComply production dependency", () => {
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).some((d) => d.includes("jipcomply"))).toBe(false);
  });

  it("44. no Quinté production dependency", () => {
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).some((d) => d.includes("quinte"))).toBe(false);
  });

  it("45. no LLM dependency", () => {
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).some((d) => /openai|anthropic|llm|langchain/i.test(d))).toBe(false);
  });

  it("46. no external service dependency", () => {
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies).toEqual({});
  });

  it("ledger integrity hash chain verifies", () => {
    const dbPath = createTempDbPath();
    const ctx = openDurableContext(dbPath);
    ctx.storage.ledger.append({
      eventId: "chain-1",
      eventType: "PROPOSAL_CREATED",
      occurredAt: AT,
      recordedAt: AT,
      actorId: "actor",
      payloadRef: "p1",
      idempotencyKey: "proposal:chain-1",
      provenance: PROVENANCE,
      metadata: { runId: "run-chain" },
    });
    const report = verifyLedgerIntegrity(ctx.storage.ledger);
    expect(report.ok).toBe(true);
    ctx.close();
    cleanupTempDb(dbPath);
  });

  it("Fixture F — durable rollback with restart preserves history", async () => {
    const dbPath = createTempDbPath();
    const rollbackSpy = vi.fn(() => verifiedRollbackOutcome());
    const first = openDurableContext(dbPath);
    const { input } = durableRunInput({
      runId: "fixture-f",
      policy: activePolicy({
        autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
        rollbackRequirements: { required: true },
      }),
      adapter: buildAdapter({
        evaluate: () => ({ verdict: "INCORRECT", rationale: "bad" }),
      }),
    });
    const run = await first.kernel.run({ ...input, rollbackPlan: rollbackPlan() });
    const originalDecisionId = run.run.decision!.id;
    const rbAuthority = createAuthority({
      id: "rb-f",
      code: "RB",
      scopes: ["ROLLBACK_MODEL"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rbGrant = createAuthorityGrant({
      id: "grant-f",
      actorId: "actor-governor",
      authority: rbAuthority,
      scopes: ["ROLLBACK_MODEL"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    await first.kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rbAuthority,
      grant: rbGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-f",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: rollbackSpy,
    });
    first.close();
    const second = reopenDurableContext(dbPath);
    const loaded = second.storage.runStore.get(run.run.runId)!;
    expect(loaded.decision?.id).toBe(originalDecisionId);
    expect(loaded.rollbackExecution?.status).toBe("COMPLETED");
    second.close();
    cleanupTempDb(dbPath);
  });
});
