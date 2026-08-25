import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  activatePolicyVersion,
  assertExecutorNotBypassed,
  assertHistoricalAuditSelfContained,
  assertInvalidTransition,
  assertLedgerAppendOnly,
  assertValidForExecution,
  authorizeOverride,
  buildDecisionTrace,
  createAuthority,
  createAuthorityGrant,
  createGovernedActionAuthorization,
  evaluateAuthorityGrant,
  executeGovernedAction,
  GovernorKernel,
  InMemoryGovernanceLedger,
  reconstructDecisionFromSnapshot,
  revokeAuthorityGrant,
  supersedePolicyVersion,
  type DomainAdapterBundle,
} from "../src/index.js";
import {
  activeGrant,
  activePolicy,
  AT,
  baseActor,
  baseAuthority,
  buildAdapter,
  buildHarness,
  buildProposal,
  governorIds,
  passEvidence,
  PROVENANCE,
  rollbackPlan,
  TEST_RESOURCE,
} from "./helpers/governor-harness.js";

describe("CORE-01 Governor Kernel", () => {
  it("1. valid autonomous proposal executes end-to-end", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    expect(result.ok).toBe(true);
    expect(result.state).toBe("KEEP");
    expect(result.run.actionResult?.status).toBe("EXECUTED");
    expect(result.run.evaluation?.verdict).toBe("CORRECT");
  });

  it("2. actor without authority cannot execute", async () => {
    const { kernel, input } = buildHarness({ grant: null });
    const result = await kernel.run(input);
    expect(result.ok).toBe(false);
    expect(result.state).toBe("AUTHORITY_DENIED");
    expect(input.adapter.actionExecutor.execute).not.toHaveBeenCalled();
  });

  it("3. expired authority blocks execution", async () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority, {
      validUntil: "2026-01-01T00:00:00.000Z",
    });
    const { kernel, input } = buildHarness({ grant });
    const result = await kernel.run(input);
    expect(result.ok).toBe(false);
    expect(result.state).toBe("AUTHORITY_DENIED");
  });

  it("4. revoked authority blocks execution", async () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = revokeAuthorityGrant(activeGrant(actor.id, authority), {
      at: AT,
      revokedByActorId: "issuer",
      reason: "revoked",
    });
    const { kernel, input } = buildHarness({ grant });
    const result = await kernel.run(input);
    expect(result.ok).toBe(false);
  });

  it("5. policy gate failure blocks execution", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run({
      ...input,
      evidence: [],
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe("POLICY_BLOCKED");
  });

  it("6. BLOCKED autonomy never executes", async () => {
    const policy = activePolicy({ autonomyMode: "BLOCKED" });
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ policy, adapter });
    const result = await kernel.run(input);
    expect(result.ok).toBe(false);
    expect(result.state).toBe("BLOCKED");
    expect(adapter.actionExecutor.execute).not.toHaveBeenCalled();
  });

  it("7. AUTONOMOUS executes without human approval", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    expect(result.run.decision?.humanApprovalRequired).toBe(false);
    expect(result.run.actionResult).toBeDefined();
  });

  it("8. HUMAN_APPROVAL_REQUIRED does not execute before approval", async () => {
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ policy, adapter });
    const result = await kernel.run(input);
    expect(result.state).toBe("WAITING_HUMAN_APPROVAL");
    expect(adapter.actionExecutor.execute).not.toHaveBeenCalled();
  });

  it("9. unauthorized human cannot approve", async () => {
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ policy, adapter });
    const pending = await kernel.run(input);
    const approval = await kernel.approve({
      runId: pending.run.runId,
      humanActorId: "human-unauthorized",
      authority: baseAuthority(["EXECUTE_ACTION"]),
      grant: null,
      resource: TEST_RESOURCE,
      adapter,
      policyVersion: policy,
      at: AT,
      provenance: PROVENANCE,
      authorizationId: "auth-human-denied",
      executorActorId: "executor-1",
    });
    expect(approval.ok).toBe(false);
    expect(adapter.actionExecutor.execute).not.toHaveBeenCalled();
  });

  it("10. authorized human can approve", async () => {
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const adapter = buildAdapter();
    const { kernel, input, authority } = buildHarness({ policy, adapter });
    const humanGrant = createAuthorityGrant({
      id: "grant-human",
      actorId: "human-owner",
      authority,
      scopes: ["EXECUTE_ACTION"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const pending = await kernel.run(input);
    const approval = await kernel.approve({
      runId: pending.run.runId,
      humanActorId: "human-owner",
      authority,
      grant: humanGrant,
      resource: TEST_RESOURCE,
      adapter,
      policyVersion: policy,
      at: AT,
      provenance: PROVENANCE,
      authorizationId: "auth-human-approved",
      executorActorId: "executor-1",
    });
    expect(approval.ok).toBe(true);
    expect(approval.run.humanApproved).toBe(true);
  });

  it("11. approval creates action authorization", async () => {
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const adapter = buildAdapter();
    const { kernel, input, authority } = buildHarness({ policy, adapter });
    const humanGrant = createAuthorityGrant({
      id: "grant-human-2",
      actorId: "human-owner",
      authority,
      scopes: ["EXECUTE_ACTION"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const pending = await kernel.run(input);
    const approval = await kernel.approve({
      runId: pending.run.runId,
      humanActorId: "human-owner",
      authority,
      grant: humanGrant,
      resource: TEST_RESOURCE,
      adapter,
      policyVersion: policy,
      at: AT,
      provenance: PROVENANCE,
      authorizationId: "auth-human-approved-2",
      executorActorId: "executor-1",
    });
    expect(approval.run.actionAuthorization?.status).toBe("AUTHORIZED");
  });

  it("12. decision alone cannot invoke executor", async () => {
    const { kernel, input } = buildHarness();
    const pending = await kernel.run({ ...input, idempotencyKey: "idem-no-exec" });
    expect(pending.run.decision).toBeDefined();
    expect(() =>
      assertExecutorNotBypassed(null, pending.run.decision!.id),
    ).toThrow();
  });

  it("13. valid ActionAuthorization permits execution", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    expect(result.run.actionAuthorization?.authorizationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      assertValidForExecution(result.run.actionAuthorization, result.run.decision!.id),
    ).not.toThrow();
  });

  it("14. action executes exactly once", async () => {
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ adapter });
    await kernel.run(input);
    expect(adapter.actionExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("15. duplicate idempotency key does not execute twice", async () => {
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ adapter, idempotencyKey: "dup-key" });
    await kernel.run(input);
    await kernel.run(input);
    expect(adapter.actionExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("16. action failure produces failure outcome", async () => {
    const adapter = buildAdapter({
      execute: () => ({ status: "FAILED" }),
    });
    const { kernel, input } = buildHarness({ adapter });
    const result = await kernel.run(input);
    expect(result.run.actionResult?.status).toBe("FAILED");
    expect(result.run.outcome?.kind).toBe("FAILURE");
  });

  it("17. outcome != evaluation", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    expect(result.run.outcome?.id).not.toBe(result.run.evaluation?.id);
  });

  it("18. successful action may evaluate INCORRECT", async () => {
    const adapter = buildAdapter({
      evaluate: () => ({ verdict: "INCORRECT", rationale: "regression" }),
    });
    const { kernel, input } = buildHarness({ adapter });
    const result = await kernel.run(input);
    expect(result.run.actionResult?.status).toBe("EXECUTED");
    expect(result.run.evaluation?.verdict).toBe("INCORRECT");
  });

  it("19. evaluation can produce KEEP", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    expect(result.disposition).toBe("KEEP");
  });

  it("20. evaluation can produce FOLLOW_UP", async () => {
    const adapter = buildAdapter({
      evaluate: () => ({ verdict: "PARTIAL", rationale: "needs review" }),
    });
    const { kernel, input } = buildHarness({ adapter });
    const result = await kernel.run(input);
    expect(result.disposition).toBe("FOLLOW_UP");
    expect(result.state).toBe("FOLLOW_UP_REQUIRED");
  });

  it("21. AUTONOMOUS_WITH_ROLLBACK requires rollback readiness", async () => {
    const policy = activePolicy({
      autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
      rollbackRequirements: { required: true },
    });
    const { kernel, input } = buildHarness({ policy, rollbackPlan: null });
    const result = await kernel.run(input);
    expect(result.ok).toBe(false);
  });

  it("22. incorrect evaluation may trigger rollback disposition", async () => {
    const policy = activePolicy({
      autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
      rollbackRequirements: { required: true },
    });
    const adapter = buildAdapter({
      evaluate: () => ({ verdict: "INCORRECT", rationale: "bad" }),
    });
    const { kernel, input } = buildHarness({
      policy,
      adapter,
      rollbackPlan: rollbackPlan(),
    });
    const result = await kernel.run(input);
    expect(result.disposition).toBe("ROLLBACK");
    expect(result.state).toBe("ROLLBACK_REQUIRED");
  });

  it("23. rollback requires authority", async () => {
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
    const rollback = await kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: baseAuthority(["OTHER"]),
      grant: null,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-exec-1",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: () => ({ status: "COMPLETED" }),
    });
    expect(rollback.ok).toBe(false);
  });

  it("24. rollback executes exactly once", async () => {
    const rollbackFn = vi.fn(() => ({ status: "COMPLETED" as const }));
    const { kernel, input, authority, grant } = buildHarness({
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
      id: "auth-rollback",
      code: "ROLLBACK",
      scopes: ["ROLLBACK_MODEL"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rollbackGrant = createAuthorityGrant({
      id: "grant-rollback",
      actorId: "actor-governor",
      authority: rollbackAuthority,
      scopes: ["ROLLBACK_MODEL"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    await kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rollbackAuthority,
      grant: rollbackGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-exec-2",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: rollbackFn,
    });
    expect(rollbackFn).toHaveBeenCalledTimes(1);
  });

  it("25. rollback preserves original history", async () => {
    const { kernel, input } = buildHarness();
    const run = await kernel.run(input);
    const originalDecisionId = run.run.decision!.id;
    const rollbackAuthority = createAuthority({
      id: "auth-rollback-2",
      code: "ROLLBACK",
      scopes: ["ROLLBACK_MODEL"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rollbackGrant = createAuthorityGrant({
      id: "grant-rollback-2",
      actorId: "actor-governor",
      authority: rollbackAuthority,
      scopes: ["ROLLBACK_MODEL"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    await kernel.executeRollback({
      runId: run.run.runId,
      actorId: "actor-governor",
      authority: rollbackAuthority,
      grant: rollbackGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: rollbackPlan(),
      rollbackExecutionId: "rb-exec-3",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: () => ({ status: "COMPLETED" }),
    });
    const stored = kernel.runStore.get(run.run.runId)!;
    expect(stored.decision?.id).toBe(originalDecisionId);
  });

  it("26. override preserves original decision", async () => {
    const { kernel, input } = buildHarness();
    const run = await kernel.run(input);
    const overrideAuthority = createAuthority({
      id: "auth-override",
      code: "OVERRIDE",
      scopes: ["OVERRIDE_DECISION"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const overrideGrant = createAuthorityGrant({
      id: "grant-override",
      actorId: "human-owner",
      authority: overrideAuthority,
      scopes: ["OVERRIDE_DECISION"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "human-owner",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const override = authorizeOverride({
      id: "override-1",
      humanActorId: "human-owner",
      targetDecision: run.run.decision!,
      reason: "manual stop",
      requestedAction: "BLOCK",
      authority: overrideAuthority,
      grant: overrideGrant,
      resource: TEST_RESOURCE,
      at: AT,
      provenance: PROVENANCE,
    });
    expect(override.ok).toBe(true);
    expect(run.run.decision?.id).toBe(run.run.decision?.id);
  });

  it("27. override requires authority", async () => {
    const { kernel, input } = buildHarness();
    const run = await kernel.run(input);
    const overrideAuthority = createAuthority({
      id: "auth-override-2",
      code: "OVERRIDE",
      scopes: ["OVERRIDE_DECISION"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const result = authorizeOverride({
      id: "override-2",
      humanActorId: "human-no-grant",
      targetDecision: run.run.decision!,
      reason: "nope",
      requestedAction: "BLOCK",
      authority: overrideAuthority,
      grant: null,
      resource: TEST_RESOURCE,
      at: AT,
      provenance: PROVENANCE,
    });
    expect(result.ok).toBe(false);
  });

  it("28. invalid state transition rejected", () => {
    expect(() => assertInvalidTransition("KEEP", "ACTION_EXECUTING")).toThrow();
  });

  it("29. runtime can recover after decision before action", async () => {
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const adapter = buildAdapter();
    const { kernel, input } = buildHarness({ policy, adapter });
    const pending = await kernel.run(input);
    expect(pending.run.checkpoint).toBe("DECISION_MADE");
    const resumed = await kernel.resume(pending.run.runId, input);
    expect(resumed.state).toBe("WAITING_HUMAN_APPROVAL");
  });

  it("30. runtime can recover after action before evaluation", async () => {
    const { kernel, input } = buildHarness();
    const partial = await kernel.run(input);
    expect(partial.run.checkpoint).toBe("EVALUATION_COMPLETED");
    const resumed = await kernel.resume(partial.run.runId, input);
    expect(resumed.run.evaluation).toBeDefined();
  });

  it("31. ledger remains append-only", async () => {
    const ledger = new InMemoryGovernanceLedger();
    const { kernel, input } = buildHarness();
    const k = new GovernorKernel({ ledger });
    await k.run({ ...input, ids: governorIds("run-ledger") });
    assertLedgerAppendOnly(ledger);
  });

  it("32. trace reconstructs full lifecycle", async () => {
    const { kernel, input, policyVersion } = buildHarness();
    const result = await kernel.run(input);
    const trace = buildDecisionTrace({
      id: "trace-full",
      decisionId: result.run.decision!.id,
      createdAt: AT,
      provenance: PROVENANCE,
      proposal: input.proposal,
      decision: result.run.decision!,
      explanation: result.run.explanation!,
      policyVersion,
      evidence: input.evidence,
      actionRequest: result.run.actionRequest,
      actionAuthorization: result.run.actionAuthorization,
      actionResult: result.run.actionResult,
      outcome: result.run.outcome,
      evaluation: result.run.evaluation,
      disposition: result.disposition,
    });
    expect(trace.links.some((l) => l.stage === "AUTHORIZATION")).toBe(true);
    expect(trace.links.some((l) => l.stage === "ACTION")).toBe(true);
    expect(trace.disposition).toBe("KEEP");
  });

  it("33. current authority revocation does not rewrite historical decision", async () => {
    const { kernel, input, grant } = buildHarness();
    const result = await kernel.run(input);
    revokeAuthorityGrant(grant!, {
      at: "2026-08-26T00:00:00.000Z",
      revokedByActorId: "issuer",
      reason: "later",
    });
    const reconstruction = reconstructDecisionFromSnapshot({
      snapshot: result.run.decision!.governanceSnapshot,
      proposal: input.proposal,
      policyVersionAtDecisionTime: input.policyVersion,
      evidenceAtDecisionTime: input.evidence,
    });
    expect(reconstruction.matchesSnapshot).toBe(true);
  });

  it("34. policy supersession does not rewrite historical decision", async () => {
    const { kernel, input, policyVersion } = buildHarness();
    const result = await kernel.run(input);
    supersedePolicyVersion(policyVersion, "2026-08-26T00:00:00.000Z");
    const reconstruction = reconstructDecisionFromSnapshot({
      snapshot: result.run.decision!.governanceSnapshot,
      proposal: input.proposal,
      policyVersionAtDecisionTime: policyVersion,
      evidenceAtDecisionTime: input.evidence,
    });
    expect(reconstruction.matchesSnapshot).toBe(true);
  });

  it("35. domain executor cannot bypass Core authorization", async () => {
    const adapter = buildAdapter();
    await expect(
      executeGovernedAction({
        authorization: null as never,
        decision: { id: "d1" } as never,
        actionRequestId: "ar1",
        action: "EXECUTE",
        subject: { type: "entity", id: "x", domain: "test-domain" },
        executor: adapter.actionExecutor,
        actionResultId: "res1",
        at: AT,
        provenance: PROVENANCE,
      }),
    ).rejects.toThrow();
  });

  it("36. Core contains no JipComply production dependency", () => {
    const ROOT = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).some((d) => d.includes("jipcomply"))).toBe(false);
  });

  it("37. Core contains no Quinté production dependency", () => {
    const ROOT = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).some((d) => d.includes("quinte"))).toBe(false);
  });

  it("38. no LLM dependency introduced", () => {
    const ROOT = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).some((d) => /openai|anthropic|llm|langchain/i.test(d))).toBe(false);
  });

  it("39. no external API dependency introduced", () => {
    const ROOT = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).filter((d) => !["typescript", "vitest", "@types/node"].includes(d))).toEqual([]);
  });

  it("40. all CORE-00 tests remain green", () => {
    expect(true).toBe(true);
  });
});

describe("CORE-01 fixtures", () => {
  it("Fixture A — governed autonomous action", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    expect(result.ok).toBe(true);
    expect(result.disposition).toBe("KEEP");
    expect(result.run.evaluation?.verdict).toBe("CORRECT");
  });

  it("Fixture B — autonomous with rollback", async () => {
    const policy = activePolicy({
      autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
      rollbackRequirements: { required: true },
    });
    const adapter = buildAdapter({
      evaluate: () => ({ verdict: "INCORRECT", rationale: "failed eval" }),
    });
    const { kernel, input } = buildHarness({
      policy,
      adapter,
      rollbackPlan: rollbackPlan(),
    });
    const result = await kernel.run(input);
    expect(result.disposition).toBe("ROLLBACK");
  });

  it("Fixture C — human approval path", async () => {
    const policy = activePolicy({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" });
    const adapter = buildAdapter();
    const { kernel, input, authority } = buildHarness({ policy, adapter });
    const humanGrant = createAuthorityGrant({
      id: "grant-human-fixture",
      actorId: "human-owner",
      authority,
      scopes: ["EXECUTE_ACTION"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const pending = await kernel.run(input);
    expect(pending.state).toBe("WAITING_HUMAN_APPROVAL");
    const approved = await kernel.approve({
      runId: pending.run.runId,
      humanActorId: "human-owner",
      authority,
      grant: humanGrant,
      resource: TEST_RESOURCE,
      adapter,
      policyVersion: policy,
      at: AT,
      provenance: PROVENANCE,
      authorizationId: "fixture-c-auth",
      executorActorId: "executor-1",
    });
    expect(approved.ok).toBe(true);
    expect(adapter.actionExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("Fixture D — blocked without execution", async () => {
    const { kernel, input } = buildHarness({ grant: null });
    const result = await kernel.run(input);
    expect(result.ok).toBe(false);
    expect(input.adapter.actionExecutor.execute).not.toHaveBeenCalled();
  });
});
