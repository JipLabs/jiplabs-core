import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  activatePolicyVersion,
  assertDomainAdapterCannotBypassCore,
  assertLedgerAppendOnly,
  assertPolicyVersionImmutable,
  assertTraceReconstructable,
  authorizeAction,
  authorizeOverride,
  computeDecisionHash,
  createActionRequest,
  createActionResult,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createDecision,
  createDecisionProposal,
  createEvaluation,
  createOutcome,
  createPolicyVersion,
  evaluateAuthorityGrant,
  evaluateDomainDecisionAuthorization,
  evaluateDecisionProposal,
  evaluatePolicyGates,
  evaluateRollbackReadiness,
  GovernanceError,
  GovernanceErrorCode,
  InMemoryGovernanceLedger,
  mandatoryGatesPassed,
  revokeAuthorityGrant,
  revisePolicyVersion,
  buildDecisionTrace,
  answerTraceQuestions,
  type DomainGovernanceAdapter,
  type PolicyGate,
} from "../src/index.js";
import { createGovernanceEvent } from "../src/ledger/index.js";
import { freezeDeep } from "../src/envelope.js";
import {
  buildResearchPromotionFixture,
  runResearchPromotionFixture,
} from "./fixtures/research-promotion-fixture.js";

const AT = "2026-08-25T12:00:00.000Z";
const TEST_RESOURCE = { domain: "test-domain", resourceType: "entity" } as const;
const PROVENANCE = { actorId: "test-actor", source: "test" };

function gate(id: string, kind: string): PolicyGate {
  return {
    id,
    code: kind,
    operator: "EQ",
    expected: "PASS",
    mandatory: true,
    evidenceKind: kind,
  };
}

function basePolicyVersion(
  overrides: Partial<Parameters<typeof createPolicyVersion>[0]> = {},
) {
  return createPolicyVersion({
    id: "pv-1",
    policyId: "test-policy",
    version: "1.0.0",
    domain: "test-domain",
    decisionType: "TEST",
    createdAt: AT,
    provenance: PROVENANCE,
    applicableActorAuthority: ["test-governor"],
    requiredAuthorityScope: "PROMOTE_MODEL",
    requiredEvidence: ["gate_a"],
    gates: [gate("g1", "gate_a")],
    decisionOutcomes: { onPass: "APPROVE", onFail: "REJECT" },
    failureBehavior: "BLOCK",
    rollbackRequirements: { required: false },
    overrideRules: {
      humanOverrideAvailable: true,
      requiredAuthorityScope: "OVERRIDE_DECISION",
    },
    autonomyMode: "AUTONOMOUS",
    effectiveFrom: AT,
    ...overrides,
  });
}

function baseActor() {
  return createActor({
    id: "actor-1",
    type: "DOMAIN_GOVERNOR",
    code: "test-governor",
    scopes: ["test-domain"],
    createdAt: AT,
    provenance: PROVENANCE,
  });
}

function baseAuthority() {
  return createAuthority({
    id: "auth-1",
    code: "TEST_AUTH",
    scopes: ["PROMOTE_MODEL"],
    createdAt: AT,
    provenance: PROVENANCE,
  });
}

function activeGrant(
  actorId: string,
  authority = baseAuthority(),
  overrides: Partial<Parameters<typeof createAuthorityGrant>[0]> = {},
) {
  return createAuthorityGrant({
    id: "grant-1",
    actorId,
    authority,
    scopes: ["PROMOTE_MODEL"],
    resource: { domain: "test-domain", resourceType: "entity" },
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z",
    issuerActorId: "issuer",
    createdAt: AT,
    provenance: PROVENANCE,
    ...overrides,
  });
}

function testSnapshot(proposalId: string): {
  proposalId: string;
  authorityGrantId: string;
  authorityGrantContentHash: string;
  authorityCode: string;
  requiredCapability: string;
  policyId: string;
  policyVersion: string;
  policyContentHash: string;
  evidenceRefs: readonly string[];
  gateResults: readonly [];
  decidedAt: string;
} {
  return {
    proposalId,
    authorityGrantId: "grant-test",
    authorityGrantContentHash: "hash-grant",
    authorityCode: "TEST_AUTH",
    requiredCapability: "PROMOTE_MODEL",
    policyId: "test-policy",
    policyVersion: "1.0.0",
    policyContentHash: "hash-policy",
    evidenceRefs: [],
    gateResults: [],
    decidedAt: AT,
  };
}

describe("CORE-00 constitution tests", () => {
  it("1. proposal != decision", () => {
    const proposal = createDecisionProposal({
      id: "prop-1",
      actorId: "actor-1",
      action: "PROMOTE",
      subject: { type: "entity", id: "x-1" },
      policyId: "p1",
      policyVersion: "1.0.0",
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const decision = createDecision({
      id: "dec-1",
      proposalId: proposal.id,
      actorId: proposal.actorId,
      authorityRef: "grant-1",
      authorityCode: "TEST_AUTH",
      policyRef: proposal.policyId,
      policyVersion: proposal.policyVersion,
      evidenceRefs: [],
      gateResults: [],
      decisionValue: "PROMOTE",
      status: "DECIDED",
      decidedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
      humanApprovalRequired: false,
      humanOverrideAvailable: true,
      rollbackRequired: false,
      explanationRef: "exp-1",
      autonomyMode: "AUTONOMOUS",
      governanceSnapshot: testSnapshot(proposal.id),
    });
    expect(proposal.id).not.toBe(decision.id);
    expect(proposal.action).toBe("PROMOTE");
    expect(decision.proposalId).toBe(proposal.id);
  });

  it("2. decision != action", () => {
    const decision = createDecision({
      id: "dec-2",
      proposalId: "prop-2",
      actorId: "actor-1",
      authorityRef: "grant-1",
      authorityCode: "TEST_AUTH",
      policyRef: "p1",
      policyVersion: "1.0.0",
      evidenceRefs: [],
      gateResults: [],
      decisionValue: "PROMOTE",
      status: "DECIDED",
      decidedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
      humanApprovalRequired: false,
      humanOverrideAvailable: true,
      rollbackRequired: false,
      explanationRef: "exp-2",
      autonomyMode: "AUTONOMOUS",
      governanceSnapshot: testSnapshot("prop-2"),
    });
    const action = createActionRequest({
      id: "act-req-1",
      decisionId: decision.id,
      action: "EXECUTE_PROMOTE",
      subject: { type: "entity", id: "x-1" },
      requestedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    expect(action.id).not.toBe(decision.id);
    expect(action.decisionId).toBe(decision.id);
  });

  it("3. outcome != evaluation", () => {
    const outcome = createOutcome({
      id: "out-1",
      decisionId: "dec-3",
      actionResultId: "ar-1",
      subject: { type: "entity", id: "x-1" },
      outcomeValue: { metric: 0.91 },
      observedAt: AT,
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const evaluation = createEvaluation({
      id: "eval-1",
      decisionId: "dec-3",
      outcomeId: outcome.id,
      evaluatorActorId: "evaluator-1",
      verdict: "KEEP",
      evaluatedAt: AT,
      rationale: "within tolerance",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    expect(outcome.id).not.toBe(evaluation.id);
    expect(evaluation.outcomeId).toBe(outcome.id);
  });

  it("4. actor without authority cannot decide", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const policyVersion = activatePolicyVersion(basePolicyVersion(), AT);
    const proposal = createDecisionProposal({
      id: "prop-4",
      actorId: actor.id,
      action: "PROMOTE",
      subject: { type: "entity", id: "x-1", domain: "test-domain" },
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const result = evaluateDecisionProposal({
      proposal,
      actor,
      authority,
      grant: null,
      policyVersion,
      evidence: [],
      at: AT,
      resource: TEST_RESOURCE,
      decisionId: "dec-4",
      explanationId: "exp-4",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GovernanceErrorCode.AUTHORITY_MISSING);
    }
  });

  it("5. expired authority fails", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority, {
      validUntil: "2026-01-01T00:00:00.000Z",
    });
    const check = evaluateAuthorityGrant({
      grant,
      authority,
      actorId: actor.id,
      scope: "PROMOTE_MODEL",
      resource: TEST_RESOURCE,
      at: AT,
    });
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.code).toBe(GovernanceErrorCode.AUTHORITY_EXPIRED);
    }
  });

  it("6. revoked authority fails", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = revokeAuthorityGrant(activeGrant(actor.id, authority), {
      at: AT,
      revokedByActorId: "issuer",
      reason: "compromised",
    });
    const check = evaluateAuthorityGrant({
      grant,
      authority,
      actorId: actor.id,
      scope: "PROMOTE_MODEL",
      resource: TEST_RESOURCE,
      at: AT,
    });
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.code).toBe(GovernanceErrorCode.AUTHORITY_REVOKED);
    }
  });

  it("7. active authority passes", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const check = evaluateAuthorityGrant({
      grant,
      authority,
      actorId: actor.id,
      scope: "PROMOTE_MODEL",
      resource: TEST_RESOURCE,
      at: AT,
    });
    expect(check.allowed).toBe(true);
  });

  it("8. policy version immutable", () => {
    const draft = basePolicyVersion();
    const active = activatePolicyVersion(draft, AT);
    expect(() => revisePolicyVersion(active, { autonomyMode: "BLOCKED" })).toThrow(
      GovernanceError,
    );
    expect(() => assertPolicyVersionImmutable(active)).not.toThrow();
  });

  it("9. failed mandatory gate blocks decision", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policyVersion = activatePolicyVersion(basePolicyVersion(), AT);
    const proposal = createDecisionProposal({
      id: "prop-9",
      actorId: actor.id,
      action: "PROMOTE",
      subject: { type: "entity", id: "x-1", domain: "test-domain" },
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const result = evaluateDecisionProposal({
      proposal,
      actor,
      authority,
      grant,
      policyVersion,
      evidence: [],
      at: AT,
      resource: TEST_RESOURCE,
      decisionId: "dec-9",
      explanationId: "exp-9",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GovernanceErrorCode.GATE_FAILED);
    }
  });

  it("10. all required gates can authorize autonomous decision", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policyVersion = activatePolicyVersion(basePolicyVersion(), AT);
    const proposal = createDecisionProposal({
      id: "prop-10",
      actorId: actor.id,
      action: "PROMOTE",
      subject: { type: "entity", id: "x-1", domain: "test-domain" },
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const evidence = [
      {
        id: "ev-1",
        schemaVersion: "core-00.1" as const,
        createdAt: AT,
        recordedAt: AT,
        provenance: PROVENANCE,
        kind: "gate_a",
        subject: { type: "entity", id: "x-1" },
        observationRefs: [],
        value: "PASS" as const,
        evaluatorActorId: "evaluator",
      },
    ];
    const result = evaluateDecisionProposal({
      proposal,
      actor,
      authority,
      grant,
      policyVersion,
      evidence,
      at: AT,
      resource: TEST_RESOURCE,
      decisionId: "dec-10",
      explanationId: "exp-10",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.humanApprovalRequired).toBe(false);
      expect(result.decision.decisionValue).toBe("APPROVE");
    }
  });

  it("11. human approval not globally required", () => {
    const policyVersion = activatePolicyVersion(
      basePolicyVersion({ autonomyMode: "AUTONOMOUS" }),
      AT,
    );
    expect(policyVersion.autonomyMode).toBe("AUTONOMOUS");
    expect(policyVersion.autonomyMode).not.toBe("HUMAN_APPROVAL_REQUIRED");
  });

  it("12. policy may explicitly require human approval", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policyVersion = activatePolicyVersion(
      basePolicyVersion({ autonomyMode: "HUMAN_APPROVAL_REQUIRED" }),
      AT,
    );
    const proposal = createDecisionProposal({
      id: "prop-12",
      actorId: actor.id,
      action: "PROMOTE",
      subject: { type: "entity", id: "x-1", domain: "test-domain" },
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const evidence = [
      {
        id: "ev-12",
        schemaVersion: "core-00.1" as const,
        createdAt: AT,
        recordedAt: AT,
        provenance: PROVENANCE,
        kind: "gate_a",
        subject: { type: "entity", id: "x-1" },
        observationRefs: [],
        value: "PASS" as const,
        evaluatorActorId: "evaluator",
      },
    ];
    const result = evaluateDecisionProposal({
      proposal,
      actor,
      authority,
      grant,
      policyVersion,
      evidence,
      at: AT,
      resource: TEST_RESOURCE,
      decisionId: "dec-12",
      explanationId: "exp-12",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.humanApprovalRequired).toBe(true);
      expect(result.decision.status).toBe("PENDING_HUMAN_APPROVAL");
    }
  });

  it("13. rollback-required action blocked without rollback plan", () => {
    const readiness = evaluateRollbackReadiness({
      required: true,
      plan: null,
      at: AT,
    });
    expect(readiness.ready).toBe(false);
    const actor = baseActor();
    const authority = baseAuthority();
    const grant = activeGrant(actor.id, authority);
    const policyVersion = activatePolicyVersion(
      basePolicyVersion({
        autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
        rollbackRequirements: { required: true },
      }),
      AT,
    );
    const proposal = createDecisionProposal({
      id: "prop-13",
      actorId: actor.id,
      action: "PROMOTE",
      subject: { type: "entity", id: "x-1", domain: "test-domain" },
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const evidence = [
      {
        id: "ev-13",
        schemaVersion: "core-00.1" as const,
        createdAt: AT,
        recordedAt: AT,
        provenance: PROVENANCE,
        kind: "gate_a",
        subject: { type: "entity", id: "x-1" },
        observationRefs: [],
        value: "PASS" as const,
        evaluatorActorId: "evaluator",
      },
    ];
    const result = evaluateDecisionProposal({
      proposal,
      actor,
      authority,
      grant,
      policyVersion,
      evidence,
      rollbackPlan: null,
      at: AT,
      resource: TEST_RESOURCE,
      decisionId: "dec-13",
      explanationId: "exp-13",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GovernanceErrorCode.ROLLBACK_PLAN_REQUIRED);
    }
  });

  it("14. rollback-ready action allowed", () => {
    const fixture = buildResearchPromotionFixture();
    expect(fixture.evaluation.ok).toBe(true);
    if (fixture.evaluation.ok) {
      expect(fixture.evaluation.decision.rollbackRequired).toBe(true);
      expect(fixture.evaluation.decision.rollbackPlanId).toBe(
        fixture.rollbackPlan.id,
      );
    }
  });

  it("15. human override recorded without deleting original decision", () => {
    const fixture = buildResearchPromotionFixture();
    expect(fixture.evaluation.ok).toBe(true);
    if (!fixture.evaluation.ok) return;

    const original = fixture.evaluation.decision;
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
      resource: { domain: "research-models" },
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "human-owner",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const overrideResult = authorizeOverride({
      id: "override-1",
      humanActorId: "human-owner",
      targetDecision: original,
      reason: "post-promotion regression observed",
      requestedAction: "ROLLBACK_TO_PREVIOUS",
      authority: overrideAuthority,
      grant: overrideGrant,
      resource: { domain: "research-models" },
      at: AT,
      provenance: { actorId: "human-owner", source: "test" },
    });
    expect(overrideResult.ok).toBe(true);
    expect(original.id).toBe("decision-promote-candidate-x");
    if (overrideResult.ok) {
      expect(overrideResult.override.targetDecisionId).toBe(original.id);
    }
  });

  it("16. override requires authority", () => {
    const fixture = buildResearchPromotionFixture();
    expect(fixture.evaluation.ok).toBe(true);
    if (!fixture.evaluation.ok) return;
    const overrideAuthority = createAuthority({
      id: "auth-override-2",
      code: "OVERRIDE",
      scopes: ["OVERRIDE_DECISION"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const result = authorizeOverride({
      id: "override-2",
      humanActorId: "human-without-grant",
      targetDecision: fixture.evaluation.decision,
      reason: "unauthorized attempt",
      requestedAction: "ROLLBACK",
      authority: overrideAuthority,
      grant: null,
      resource: { domain: "research-models" },
      at: AT,
      provenance: { actorId: "human-without-grant", source: "test" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GovernanceErrorCode.OVERRIDE_AUTHORITY_MISSING);
    }
  });

  it("17. ledger append-only", () => {
    const ledger = new InMemoryGovernanceLedger();
    const event = createGovernanceEvent({
      eventId: "evt-1",
      eventType: "DECISION_MADE",
      occurredAt: AT,
      actorId: "actor-1",
      payloadRef: "dec-1",
      idempotencyKey: "decision:dec-1",
      sequence: 0,
      provenance: PROVENANCE,
    });
    ledger.append(event);
    assertLedgerAppendOnly(ledger);
    expect(ledger.list()).toHaveLength(1);
  });

  it("18. duplicate event idempotent or rejected deterministically", () => {
    const ledger = new InMemoryGovernanceLedger();
    const base = {
      eventId: "evt-dup",
      eventType: "DECISION_MADE" as const,
      occurredAt: AT,
      actorId: "actor-1",
      payloadRef: "dec-dup",
      idempotencyKey: "decision:dec-dup",
      provenance: PROVENANCE,
    };
    const first = ledger.append(createGovernanceEvent({ ...base, sequence: 0 }));
    const second = ledger.append(createGovernanceEvent({ ...base, sequence: 0 }));
    expect(first.status).toBe("appended");
    expect(second.status).toBe("duplicate");
    expect(ledger.list()).toHaveLength(1);
    expect(() =>
      ledger.append(
        createGovernanceEvent({
          ...base,
          eventId: "evt-other",
          sequence: 0,
        }),
      ),
    ).toThrow(GovernanceError);
  });

  it("19. decision hash deterministic", () => {
    const payload = {
      proposalId: "prop-19",
      actorId: "actor-1",
      authorityRef: "grant-1",
      policyRef: "test-policy",
      policyVersion: "1.0.0",
      evidenceRefs: ["ev-1"],
      gateResults: evaluatePolicyGates(
        [gate("g1", "gate_a")],
        { gate_a: "PASS" },
      ),
      decisionValue: "APPROVE",
      decidedAt: AT,
    };
    const h1 = computeDecisionHash(payload);
    const h2 = computeDecisionHash(payload);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("20. decision trace reconstructable", () => {
    const fixture = buildResearchPromotionFixture();
    expect(fixture.evaluation.ok).toBe(true);
    if (!fixture.evaluation.ok) return;
    const trace = buildDecisionTrace({
      id: "trace-1",
      decisionId: fixture.evaluation.decision.id,
      createdAt: AT,
      provenance: PROVENANCE,
      proposal: fixture.proposal,
      decision: fixture.evaluation.decision,
      explanation: fixture.evaluation.explanation,
      policyVersion: fixture.policyVersion,
      evidence: fixture.evidence,
      rollbackPlan: fixture.rollbackPlan,
    });
    assertTraceReconstructable(trace);
    const answers = answerTraceQuestions(trace);
    expect(answers.whoDecided).toBe(fixture.actor.id);
    expect(answers.policyVersion).toContain("research-champion-promotion-v1");
    expect(answers.canRollback).toBe(true);
  });

  it("21. domain adapter cannot bypass Core authorization", () => {
    const actor = baseActor();
    const authority = baseAuthority();
    const policyVersion = activatePolicyVersion(basePolicyVersion(), AT);
    const proposal = createDecisionProposal({
      id: "prop-21",
      actorId: actor.id,
      action: "PROMOTE",
      subject: { type: "entity", id: "x-1", domain: "test-domain" },
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      domain: "test-domain",
      decisionType: "TEST",
      evidenceRefs: [],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const adapter: DomainGovernanceAdapter = {
      domain: "test-domain",
      observationProvider: {
        domain: "test-domain",
        fetchObservations: () => [],
      },
      policyProvider: {
        domain: "test-domain",
        resolvePolicyVersion: () => policyVersion,
      },
      evidenceProvider: {
        domain: "test-domain",
        collectEvidence: () => [],
      },
    };
    const result = evaluateDomainDecisionAuthorization({
      adapter,
      actor,
      authority,
      grant: null,
      proposal,
      policyVersion,
      evidence: [],
      resource: TEST_RESOURCE,
      at: AT,
      decisionId: "dec-21",
      explanationId: "exp-21",
    });
    expect(result.ok).toBe(false);
    assertDomainAdapterCannotBypassCore(result, true);
  });

  it("22. Core contains no product-specific production dependency", () => {
    const ROOT = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const pkg = JSON.parse(
      readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps)).not.toContain("@jipcomply/core");
    expect(Object.keys(deps).some((d) => d.includes("quinte"))).toBe(false);

    function walkTs(dir: string, out: string[] = []): string[] {
      if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const full = path.join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walkTs(full, out);
        else if (name.endsWith(".ts") && !full.includes(`${path.sep}tests${path.sep}`)) {
          out.push(full);
        }
      }
      return out;
    }

    const importRe = /from\s+["']@(?:jipcomply|quinte)[^"']+["']/;
    const brandRe = /\b(?:Quinté|Quinte|JipComply|horse.?racing|compliance.?passport)\b/i;
    const leaks: string[] = [];
    for (const file of walkTs(path.join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      if (importRe.test(text) || brandRe.test(text)) {
        leaks.push(path.relative(ROOT, file));
      }
    }
    expect(leaks).toEqual([]);
  });
});

describe("Research promotion fixture (contract-only)", () => {
  it("authorizes PROMOTE when gates and rollback are satisfied", () => {
    const result = runResearchPromotionFixture();
    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.actor).toBe("champion-governor");
      expect(result.authority).toBe("MODEL_GOVERNANCE");
      expect(result.decision).toBe("PROMOTE");
      expect(result.humanApprovalRequired).toBe(false);
      expect(result.humanOverrideAvailable).toBe(true);
      expect(result.rollbackRequired).toBe(true);
    }
  });
});

describe("Immutability helpers", () => {
  it("freezes nested contract objects", () => {
    const actor = baseActor();
    expect(Object.isFrozen(actor)).toBe(true);
    expect(Object.isFrozen(actor.scopes)).toBe(true);
  });
});
