import { vi } from "vitest";
import {
  activatePolicyVersion,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createDecisionProposal,
  createEvidence,
  createPolicyVersion,
  createRollbackPlan,
  GovernorKernel,
  InMemoryGovernanceLedger,
  type DomainAdapterBundle,
  type PolicyGate,
  type PolicyVersion,
} from "../../src/index.js";

export const AT = "2026-08-25T12:00:00.000Z";
export const PROVENANCE = { actorId: "test-actor", source: "harness" };
export const TEST_RESOURCE = { domain: "test-domain", resourceType: "entity" } as const;

export function gate(id: string, kind: string): PolicyGate {
  return {
    id,
    code: kind,
    operator: "EQ",
    expected: "PASS",
    mandatory: true,
    evidenceKind: kind,
  };
}

export function basePolicyVersion(
  overrides: Partial<Parameters<typeof createPolicyVersion>[0]> = {},
): ReturnType<typeof createPolicyVersion> {
  return createPolicyVersion({
    id: "pv-base",
    policyId: "test-policy",
    version: "1.0.0",
    domain: "test-domain",
    decisionType: "TEST",
    createdAt: AT,
    provenance: PROVENANCE,
    applicableActorAuthority: ["test-governor"],
    requiredAuthorityScope: "EXECUTE_ACTION",
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

export function activePolicy(
  overrides: Partial<Parameters<typeof createPolicyVersion>[0]> = {},
) {
  return activatePolicyVersion(basePolicyVersion(overrides), AT);
}

export function baseActor() {
  return createActor({
    id: "actor-governor",
    type: "DOMAIN_GOVERNOR",
    code: "test-governor",
    scopes: ["test-domain"],
    createdAt: AT,
    provenance: PROVENANCE,
  });
}

export function baseAuthority(scopes = ["EXECUTE_ACTION"]) {
  return createAuthority({
    id: "auth-base",
    code: "TEST_EXECUTE",
    scopes,
    createdAt: AT,
    provenance: PROVENANCE,
  });
}

export function activeGrant(
  actorId: string,
  authority = baseAuthority(),
  overrides: Partial<Parameters<typeof createAuthorityGrant>[0]> = {},
) {
  return createAuthorityGrant({
    id: "grant-base",
    actorId,
    authority,
    scopes: ["EXECUTE_ACTION"],
    resource: TEST_RESOURCE,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z",
    issuerActorId: "issuer",
    createdAt: AT,
    provenance: PROVENANCE,
    ...overrides,
  });
}

export function passEvidence() {
  return [
    createEvidence({
      id: "ev-1",
      kind: "gate_a",
      subject: { type: "entity", id: "target-1", domain: "test-domain" },
      observationRefs: ["obs-1"],
      value: "PASS",
      evaluatorActorId: "evaluator-1",
      createdAt: AT,
      provenance: PROVENANCE,
    }),
  ];
}

export function buildProposal(action = "EXECUTE") {
  return createDecisionProposal({
    id: "proposal-1",
    actorId: "actor-governor",
    action,
    subject: { type: "entity", id: "target-1", domain: "test-domain" },
    policyId: "test-policy",
    policyVersion: "1.0.0",
    domain: "test-domain",
    decisionType: "TEST",
    evidenceRefs: ["ev-1"],
    createdAt: AT,
    provenance: PROVENANCE,
  });
}

export function buildAdapter(options: {
  execute?: DomainAdapterBundle["actionExecutor"]["execute"];
  evaluate?: DomainAdapterBundle["outcomeEvaluator"]["evaluate"];
} = {}): DomainAdapterBundle {
  const executeSpy = vi.fn(
    options.execute ??
      (() => ({ status: "EXECUTED" as const, resultRef: "result-1" })),
  );
  const evaluateSpy = vi.fn(
    options.evaluate ??
      (() => ({ verdict: "CORRECT", rationale: "within tolerance" })),
  );
  return {
    domain: "test-domain",
    observationProvider: {
      domain: "test-domain",
      fetchObservations: () => [],
    },
    policyProvider: {
      domain: "test-domain",
      resolvePolicyVersion: () => null,
    },
    evidenceProvider: {
      domain: "test-domain",
      collectEvidence: () => passEvidence(),
    },
    actionExecutor: {
      domain: "test-domain",
      execute: executeSpy,
    },
    outcomeEvaluator: {
      domain: "test-domain",
      evaluate: evaluateSpy,
    },
  };
}

export function governorIds(runId = "run-1") {
  return {
    runId,
    decisionId: `${runId}:decision`,
    explanationId: `${runId}:explanation`,
    actionRequestId: `${runId}:action-request`,
    authorizationId: `${runId}:authorization`,
    actionResultId: `${runId}:action-result`,
    outcomeId: `${runId}:outcome`,
    evaluationId: `${runId}:evaluation`,
  };
}

export function buildHarness(options: {
  policy?: PolicyVersion;
  grant?: ReturnType<typeof activeGrant> | null;
  adapter?: DomainAdapterBundle;
  rollbackPlan?: ReturnType<typeof createRollbackPlan> | null;
  idempotencyKey?: string;
  runId?: string;
} = {}) {
  const ledger = new InMemoryGovernanceLedger();
  const kernel = new GovernorKernel({ ledger });
  const actor = baseActor();
  const authority = baseAuthority();
  const grant = options.grant === null ? null : (options.grant ?? activeGrant(actor.id, authority));
  const policyVersion = options.policy ?? activePolicy();
  const adapter = options.adapter ?? buildAdapter();
  const ids = governorIds(options.runId ?? "run-1");
  const input = {
    idempotencyKey: options.idempotencyKey ?? "idem-1",
    ids,
    actor,
    executorActorId: "executor-1",
    authority,
    grant,
    proposal: buildProposal(),
    policyVersion,
    evidence: passEvidence(),
    rollbackPlan: options.rollbackPlan ?? null,
    resource: TEST_RESOURCE,
    adapter,
    at: AT,
    provenance: PROVENANCE,
  };
  return { kernel, ledger, input, adapter, actor, authority, grant, policyVersion };
}

export function verifiedRollbackOutcome(actual = "restored") {
  return {
    status: "COMPLETED" as const,
    verificationResult: { kind: "state", actual },
  };
}

export function rollbackPlan() {
  return createRollbackPlan({
    id: "rollback-plan-1",
    rollbackTarget: { type: "entity", id: "target-1", domain: "test-domain" },
    preconditions: ["snapshot captured"],
    rollbackAction: "RESTORE_PREVIOUS",
    verification: { kind: "state", expected: "restored" },
    maximumRollbackWindow: "2026-12-31T00:00:00.000Z",
    createdAt: AT,
    provenance: PROVENANCE,
  });
}
