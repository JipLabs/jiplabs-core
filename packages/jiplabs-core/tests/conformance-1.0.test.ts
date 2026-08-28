import { describe, expect, it } from "vitest";
import {
  CORE_EXPERIMENTAL_EXPORTS,
  activatePolicyVersion,
  assertHistoricalAuditSelfContained,
  assertLedgerAppendOnly,
  authorizeOverride,
  buildDecisionTrace,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createCoreEvaluation,
  createDecisionProposal,
  createEvidence,
  createPolicyVersion,
  evaluateDomainDecisionAuthorization,
  reconstructDecisionFromSnapshot,
  revokeAuthorityGrant,
  type DomainAdapterBundle,
  type PolicyGate,
} from "../src/index.js";
import {
  AT,
  PROVENANCE,
  TEST_RESOURCE,
  activeGrant,
  activePolicy,
  baseActor,
  baseAuthority,
  buildAdapter,
  buildHarness,
  buildProposal,
  gate,
  passEvidence,
  rollbackPlan,
  verifiedRollbackOutcome,
} from "./helpers/governor-harness.js";

function authorizeOnlyAdapter(
  policyVersion: ReturnType<typeof activePolicy>,
  evidence = passEvidence(),
): DomainAdapterBundle {
  return {
    domain: "test-domain",
    observationProvider: { domain: "test-domain", fetchObservations: () => [] },
    policyProvider: { domain: "test-domain", resolvePolicyVersion: () => policyVersion },
    evidenceProvider: { domain: "test-domain", collectEvidence: () => evidence },
    actionExecutor: {
      domain: "test-domain",
      execute: () => {
        throw new Error("authorize-only path must not execute");
      },
    },
    outcomeEvaluator: {
      domain: "test-domain",
      evaluate: () => {
        throw new Error("authorize-only path must not evaluate outcomes");
      },
    },
  };
}

describe("CORE-STAB-01 1.0 conformance", () => {
  it("authority: actor cannot proceed outside granted authority", () => {
    const actor = baseActor();
    const authority = baseAuthority(["EXECUTE_ACTION"]);
    const policy = activePolicy();
    const result = evaluateDomainDecisionAuthorization({
      adapter: authorizeOnlyAdapter(policy),
      actor,
      authority,
      grant: null,
      proposal: buildProposal(),
      policyVersion: policy,
      evidence: passEvidence(),
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-unauth",
      explanationId: "exp-unauth",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toMatch(/AUTHORITY/);
    }
  });

  it("policy: decision snapshot binds policy id, version, and content hash", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policy = activePolicy();
    const result = evaluateDomainDecisionAuthorization({
      adapter: authorizeOnlyAdapter(policy),
      actor,
      authority,
      grant,
      proposal: buildProposal(),
      policyVersion: policy,
      evidence: passEvidence(),
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-policy",
      explanationId: "exp-policy",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.policyRef).toBe(policy.policyId);
      expect(result.decision.policyVersion).toBe(policy.version);
      expect(result.decision.governanceSnapshot.policyContentHash).toBe(policy.contentHash);
      expect(result.decision.governanceSnapshot.policyId).toBe(policy.policyId);
    }
  });

  it("proposal is not a decision", () => {
    const proposal = buildProposal();
    expect(proposal).not.toHaveProperty("decisionHash");
    expect(proposal).not.toHaveProperty("decisionValue");
    expect(proposal).not.toHaveProperty("gateResults");
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policy = activePolicy();
    const result = evaluateDomainDecisionAuthorization({
      adapter: authorizeOnlyAdapter(policy),
      actor,
      authority,
      grant,
      proposal,
      policyVersion: policy,
      evidence: passEvidence(),
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-sep",
      explanationId: "exp-sep",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.proposalId).toBe(proposal.id);
      expect(result.decision.id).not.toBe(proposal.id);
    }
  });

  it("decision does not imply execution", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policy = activePolicy();
    let executed = false;
    const adapter = authorizeOnlyAdapter(policy);
    adapter.actionExecutor.execute = () => {
      executed = true;
      return { status: "EXECUTED", resultRef: "nope" };
    };
    const result = evaluateDomainDecisionAuthorization({
      adapter,
      actor,
      authority,
      grant,
      proposal: buildProposal(),
      policyVersion: policy,
      evidence: passEvidence(),
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-noexec",
      explanationId: "exp-noexec",
    });
    expect(result.ok).toBe(true);
    expect(executed).toBe(false);
  });

  it("evidence at decision time remains reconstructable from the snapshot", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policy = activePolicy();
    const evidence = passEvidence();
    const result = evaluateDomainDecisionAuthorization({
      adapter: authorizeOnlyAdapter(policy, evidence),
      actor,
      authority,
      grant,
      proposal: buildProposal(),
      policyVersion: policy,
      evidence,
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-ev",
      explanationId: "exp-ev",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reconstructed = reconstructDecisionFromSnapshot({
      snapshot: result.decision.governanceSnapshot,
      proposal: buildProposal(),
      policyVersionAtDecisionTime: policy,
      evidenceAtDecisionTime: evidence,
    });
    expect(reconstructed.matchesSnapshot).toBe(true);
    expect(reconstructed.decisionValue).toBe(result.decision.decisionValue);
  });

  it("durable execution: successful kernel run reaches KEEP without dropping the ledger chain", async () => {
    const { kernel, input, ledger } = buildHarness();
    const result = await kernel.run(input);
    expect(result.ok).toBe(true);
    expect(result.state).toBe("KEEP");
    assertLedgerAppendOnly(ledger);
    expect(ledger.list().some((e) => e.eventType === "DECISION_MADE")).toBe(true);
    expect(ledger.list().some((e) => e.eventType === "ACTION_EXECUTED")).toBe(true);
  });

  it("idempotency: duplicate kernel run does not execute twice", async () => {
    const { kernel, input, adapter } = buildHarness();
    const first = await kernel.run(input);
    const second = await kernel.run(input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(adapter.actionExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("TOCTOU: revoked grant cannot authorize a later execution-bound decision", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const revoked = revokeAuthorityGrant(grant, {
      at: AT,
      revokedByActorId: "issuer",
      reason: "revoked",
    });
    const policy = activePolicy();
    const result = evaluateDomainDecisionAuthorization({
      adapter: authorizeOnlyAdapter(policy),
      actor,
      authority,
      grant: revoked,
      proposal: buildProposal(),
      policyVersion: policy,
      evidence: passEvidence(),
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-revoked",
      explanationId: "exp-revoked",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AUTHORITY_REVOKED");
    }
  });

  it("historical integrity: override is a new event and does not rewrite the original decision", async () => {
    const { kernel, input, ledger } = buildHarness();
    const run = await kernel.run(input);
    expect(run.ok).toBe(true);
    const originalDecision = run.run.decision!;
    const originalHash = originalDecision.decisionHash;
    const originalEvent = ledger.list().find((e) => e.eventType === "DECISION_MADE");
    expect(originalEvent).toBeDefined();
    assertHistoricalAuditSelfContained(originalEvent!);
    const overrideAuth = createAuthority({
      id: "auth-override",
      code: "OVERRIDE",
      scopes: ["OVERRIDE_DECISION"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const overrideGrant = createAuthorityGrant({
      id: "grant-override",
      actorId: "human-1",
      authority: overrideAuth,
      scopes: ["OVERRIDE_DECISION"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const authorized = authorizeOverride({
      id: "ovr-1",
      humanActorId: "human-1",
      targetDecision: originalDecision,
      reason: "corrective override",
      requestedAction: "KEEP",
      authority: overrideAuth,
      grant: overrideGrant,
      resource: TEST_RESOURCE,
      at: AT,
      provenance: PROVENANCE,
    });
    expect(authorized.ok).toBe(true);
    if (authorized.ok) {
      expect(authorized.override.id).not.toBe(originalDecision.id);
      expect(authorized.override.targetDecisionId).toBe(originalDecision.id);
    }
    expect(run.run.decision?.decisionHash).toBe(originalHash);
    expect(ledger.list().find((e) => e.eventType === "DECISION_MADE")).toEqual(originalEvent);
  });

  it("rollback is a governed, verifiable event", async () => {
    const plan = rollbackPlan();
    const policy = activePolicy({
      autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
      rollbackRequirements: { required: true },
    });
    const { kernel, input } = buildHarness({
      policy,
      rollbackPlan: plan,
      adapter: buildAdapter({
        evaluate: () => ({ verdict: "ROLLBACK", rationale: "out of tolerance" }),
      }),
    });
    const run = await kernel.run(input);
    expect(run.state).toBe("ROLLBACK_REQUIRED");
    const rollbackAuthority = createAuthority({
      id: "auth-rollback",
      code: "ROLLBACK",
      scopes: ["ROLLBACK_MODEL"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rollbackGrant = createAuthorityGrant({
      id: "grant-rollback",
      actorId: input.actor.id,
      authority: rollbackAuthority,
      scopes: ["ROLLBACK_MODEL"],
      resource: TEST_RESOURCE,
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const rolled = await kernel.executeRollback({
      runId: input.ids.runId,
      actorId: input.actor.id,
      authority: rollbackAuthority,
      grant: rollbackGrant,
      resource: TEST_RESOURCE,
      rollbackPlan: plan,
      rollbackExecutionId: "rb-1",
      at: AT,
      provenance: PROVENANCE,
      executeRollback: () => verifiedRollbackOutcome(),
    });
    expect(rolled.ok).toBe(true);
    expect(rolled.state).toBe("ROLLBACK_COMPLETED");
  });

  it("outcome completion is not decision correctness", async () => {
    const { kernel, input } = buildHarness({
      adapter: buildAdapter({
        evaluate: () => ({ verdict: "INCORRECT", rationale: "domain mismatch" }),
      }),
    });
    const result = await kernel.run(input);
    expect(result.run.actionResult?.status).toBe("EXECUTED");
    expect(result.run.evaluation?.verdict).not.toBe("CORRECT");
    expect(["FOLLOW_UP_REQUIRED", "ROLLBACK_REQUIRED", "KEEP", "BLOCKED", "EVALUATED"]).toContain(
      result.state,
    );
  });

  it("evaluation remains distinct from outcome and is reproducible from recorded facts", async () => {
    const { kernel, input } = buildHarness();
    const result = await kernel.run(input);
    expect(result.run.outcome).toBeDefined();
    expect(result.run.evaluation).toBeDefined();
    expect(result.run.outcome!.id).not.toBe(result.run.evaluation!.id);
    const replayed = createCoreEvaluation({
      id: result.run.evaluation!.id,
      decisionId: result.run.evaluation!.decisionId,
      outcomeId: result.run.evaluation!.outcomeId,
      evaluatorActorId: result.run.evaluation!.evaluatorActorId,
      verdict: result.run.evaluation!.verdict,
      evaluatedAt: result.run.evaluation!.evaluatedAt,
      rationale: result.run.evaluation!.rationale,
      createdAt: result.run.evaluation!.createdAt,
      provenance: PROVENANCE,
    });
    expect(replayed.verdict).toBe(result.run.evaluation!.verdict);
  });

  it("observation-only authorize path cannot mutate via Core execution", () => {
    let mutated = false;
    const policy = activePolicy({ failureBehavior: "SHADOW" });
    const adapter = authorizeOnlyAdapter(policy);
    adapter.actionExecutor.execute = () => {
      mutated = true;
      return { status: "EXECUTED", resultRef: "should-not-happen" };
    };
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const result = evaluateDomainDecisionAuthorization({
      adapter,
      actor,
      authority,
      grant,
      proposal: buildProposal(),
      policyVersion: policy,
      evidence: passEvidence(),
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-shadow",
      explanationId: "exp-shadow",
    });
    expect(result.ok).toBe(true);
    expect(mutated).toBe(false);
  });

  it("authorize-only consumers can build a DecisionTrace", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policy = activePolicy();
    const evidence = passEvidence();
    const proposal = buildProposal();
    const result = evaluateDomainDecisionAuthorization({
      adapter: authorizeOnlyAdapter(policy, evidence),
      actor,
      authority,
      grant,
      proposal,
      policyVersion: policy,
      evidence,
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-trace",
      explanationId: "exp-trace",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const trace = buildDecisionTrace({
      id: "trace-1",
      decisionId: result.decision.id,
      createdAt: AT,
      provenance: PROVENANCE,
      proposal,
      decision: result.decision,
      explanation: result.explanation,
      policyVersion: policy,
      evidence,
    });
    expect(trace.who).toBe(actor.id);
    expect(trace.policyId).toBe(policy.policyId);
    expect(trace.evidenceIds).toContain("ev-1");
    expect(trace.links.some((l) => l.stage === "DECISION")).toBe(true);
  });

  it("experimental export names are explicit and non-empty", () => {
    expect(CORE_EXPERIMENTAL_EXPORTS.length).toBeGreaterThan(20);
    expect(CORE_EXPERIMENTAL_EXPORTS).toContain("EvaluationCorpus");
    expect(CORE_EXPERIMENTAL_EXPORTS).toContain("GovernedComponentRegistry");
    expect(CORE_EXPERIMENTAL_EXPORTS).not.toContain("GovernorKernel");
    expect(CORE_EXPERIMENTAL_EXPORTS).not.toContain("evaluateDomainDecisionAuthorization");
  });
});

describe("CORE-STAB-01 reference consumers", () => {
  it("Consumer A — predictive authorize-only (domain-neutral)", () => {
    const at = AT;
    const provenance = { actorId: "predictive-governor", source: "consumer-a" };
    const resource = { domain: "predictive-lab", resourceType: "model-lifecycle" };
    const actor = createActor({
      id: "predictive-governor",
      type: "DOMAIN_GOVERNOR",
      code: "predictive-governor",
      scopes: ["predictive-lab"],
      createdAt: at,
      provenance,
    });
    const authority = createAuthority({
      id: "auth-predictive",
      code: "PREDICTIVE_RETAIN",
      scopes: ["EXECUTE_ACTION"],
      createdAt: at,
      provenance,
    });
    const grant = createAuthorityGrant({
      id: "grant-predictive",
      actorId: actor.id,
      authority,
      scopes: ["EXECUTE_ACTION"],
      resource,
      validFrom: at,
      validUntil: null,
      issuerActorId: "bootstrap",
      createdAt: at,
      provenance,
    });
    const gates: PolicyGate[] = [
      gate("readiness", "champion_frozen"),
      { id: "leakage", code: "leakage", operator: "EQ", expected: "PASS", mandatory: true, evidenceKind: "leakage" },
    ];
    const policy = activatePolicyVersion(
      createPolicyVersion({
        id: "pv-pred",
        policyId: "predictive-lifecycle",
        version: "1.0.0",
        domain: "predictive-lab",
        decisionType: "RETAIN_CHAMPION",
        createdAt: at,
        provenance,
        applicableActorAuthority: [actor.code],
        requiredAuthorityScope: "EXECUTE_ACTION",
        requiredEvidence: ["champion_frozen", "leakage"],
        gates,
        decisionOutcomes: { onPass: "KEEP_CHAMPION", onFail: "BLOCK" },
        failureBehavior: "SHADOW",
        rollbackRequirements: { required: false },
        overrideRules: { humanOverrideAvailable: true, requiredAuthorityScope: "OVERRIDE_DECISION" },
        autonomyMode: "AUTONOMOUS",
        effectiveFrom: at,
      }),
      at,
    );
    const evidence = [
      createEvidence({
        id: "ev-frozen",
        kind: "champion_frozen",
        subject: { type: "model", id: "champion-1", domain: "predictive-lab" },
        observationRefs: ["obs-frozen"],
        value: "PASS",
        evaluatorActorId: actor.id,
        createdAt: at,
        provenance,
      }),
      createEvidence({
        id: "ev-leak",
        kind: "leakage",
        subject: { type: "model", id: "champion-1", domain: "predictive-lab" },
        observationRefs: ["obs-leak"],
        value: "PASS",
        evaluatorActorId: actor.id,
        createdAt: at,
        provenance,
      }),
    ];
    const proposal = createDecisionProposal({
      id: "prop-retain",
      actorId: actor.id,
      action: "RETAIN",
      subject: { type: "model", id: "champion-1", domain: "predictive-lab" },
      policyId: policy.policyId,
      policyVersion: policy.version,
      domain: "predictive-lab",
      decisionType: "RETAIN_CHAMPION",
      evidenceRefs: evidence.map((e) => e.id),
      createdAt: at,
      provenance,
      metadata: { mode: "SHADOW" },
    });
    const evaluation = evaluateDomainDecisionAuthorization({
      adapter: {
        domain: "predictive-lab",
        observationProvider: { domain: "predictive-lab", fetchObservations: () => [] },
        policyProvider: { domain: "predictive-lab", resolvePolicyVersion: () => policy },
        evidenceProvider: { domain: "predictive-lab", collectEvidence: () => evidence },
      },
      actor,
      authority,
      grant,
      proposal,
      policyVersion: policy,
      evidence,
      resource,
      at,
      decisionId: "dec-retain",
      explanationId: "exp-retain",
    });
    expect(evaluation.ok).toBe(true);
    if (!evaluation.ok) return;
    expect(evaluation.decision.decisionValue).toBe("KEEP_CHAMPION");
    const trace = buildDecisionTrace({
      id: "trace-pred",
      decisionId: evaluation.decision.id,
      createdAt: at,
      provenance,
      proposal,
      decision: evaluation.decision,
      explanation: evaluation.explanation,
      policyVersion: policy,
      evidence,
    });
    expect(trace.canRollback).toBe(false);
    expect(trace.policyVersion).toBe("1.0.0");
  });

  it("Consumer B — compliance authorize-only (domain-neutral)", () => {
    const at = AT;
    const provenance = { actorId: "readiness-governor", source: "consumer-b" };
    const resource = { domain: "compliance-lab", resourceType: "regulatory-scope" };
    const actor = createActor({
      id: "readiness-governor",
      type: "DOMAIN_GOVERNOR",
      code: "readiness-governor",
      scopes: ["compliance-lab"],
      createdAt: at,
      provenance,
    });
    const capability = "compliance-lab:scope:set-ready";
    const authority = createAuthority({
      id: "auth-ready",
      code: "COMPLIANCE_READINESS",
      scopes: [capability],
      createdAt: at,
      provenance,
    });
    const grant = createAuthorityGrant({
      id: "grant-ready",
      actorId: actor.id,
      authority,
      scopes: [capability],
      resource,
      validFrom: at,
      validUntil: null,
      issuerActorId: "bootstrap",
      createdAt: at,
      provenance,
    });
    const policy = activatePolicyVersion(
      createPolicyVersion({
        id: "pv-ready",
        policyId: "compliance-readiness",
        version: "1.0.0",
        domain: "compliance-lab",
        decisionType: "PROMOTE",
        createdAt: at,
        provenance,
        applicableActorAuthority: [actor.code],
        requiredAuthorityScope: capability,
        requiredEvidence: ["evaluations_pass"],
        gates: [
          {
            id: "g-eval",
            code: "EVALUATIONS_PASS",
            operator: "EQ",
            expected: true,
            mandatory: true,
            evidenceKind: "evaluations_pass",
          },
        ],
        decisionOutcomes: { onPass: "READY", onFail: "NOT_READY" },
        failureBehavior: "BLOCK",
        rollbackRequirements: { required: false },
        overrideRules: { humanOverrideAvailable: true, requiredAuthorityScope: "OVERRIDE_DECISION" },
        autonomyMode: "AUTONOMOUS",
        effectiveFrom: at,
      }),
      at,
    );
    const evidence = [
      createEvidence({
        id: "ev-eval",
        kind: "evaluations_pass",
        subject: { type: "regulatory-scope", id: "scope-1", domain: "compliance-lab" },
        observationRefs: ["obs:scope-1:evaluations_pass"],
        value: true,
        evaluatorActorId: actor.id,
        createdAt: at,
        provenance,
      }),
    ];
    const proposal = createDecisionProposal({
      id: "prop-ready",
      actorId: actor.id,
      action: capability,
      subject: { type: "regulatory-scope", id: "scope-1", domain: "compliance-lab" },
      policyId: policy.policyId,
      policyVersion: policy.version,
      domain: "compliance-lab",
      decisionType: "PROMOTE",
      evidenceRefs: evidence.map((e) => e.id),
      createdAt: at,
      provenance,
      metadata: { mode: "LIVE" },
    });
    const evaluation = evaluateDomainDecisionAuthorization({
      adapter: {
        domain: "compliance-lab",
        observationProvider: { domain: "compliance-lab", fetchObservations: () => [] },
        policyProvider: { domain: "compliance-lab", resolvePolicyVersion: () => policy },
        evidenceProvider: { domain: "compliance-lab", collectEvidence: () => evidence },
      },
      actor,
      authority,
      grant,
      proposal,
      policyVersion: policy,
      evidence,
      resource,
      at,
      decisionId: "dec-ready",
      explanationId: "exp-ready",
    });
    expect(evaluation.ok).toBe(true);
    if (!evaluation.ok) return;
    expect(evaluation.decision.decisionValue).toBe("READY");
    expect(evaluation.decision.status).not.toBe("EXECUTED");
  });
});

describe("CORE-STAB-01 performance sanity", () => {
  it("repeated authorize-only evaluation stays bounded", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policy = activePolicy();
    const evidence = passEvidence();
    const proposal = buildProposal();
    const adapter = authorizeOnlyAdapter(policy, evidence);
    const started = Date.now();
    for (let i = 0; i < 250; i += 1) {
      const result = evaluateDomainDecisionAuthorization({
        adapter,
        actor,
        authority,
        grant,
        proposal,
        policyVersion: policy,
        evidence,
        resource: TEST_RESOURCE,
        at: AT,
        decisionId: `dec-${i}`,
        explanationId: `exp-${i}`,
      });
      expect(result.ok).toBe(true);
    }
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
