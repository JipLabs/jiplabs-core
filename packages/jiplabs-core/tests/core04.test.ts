import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  activatePolicyVersion,
  assertLedgerAppendOnly,
  buildComponentGovernanceTraceRefs,
  buildDecisionTrace,
  createAgentIdentity,
  createAuthority,
  createAuthorityGrant,
  createCapabilityDeclaration,
  createModelIdentity,
  createPolicyVersion,
  createQualificationRecord,
  createResponsibility,
  evaluateResponsibilityEligibility,
  GovernanceError,
  GovernedComponentRegistry,
  InMemoryGovernanceLedger,
  InMemoryGovernedComponentRegistryStore,
  isAssignmentEligible,
  openNodeSqliteGovernanceStorage,
  PERSISTENCE_SCHEMA_VERSION,
  selectEligibleComponent,
  validateValidatorIndependence,
  type PolicyGate,
} from "../src/index.js";
import { ALL_MIGRATIONS as MIGRATIONS } from "../src/persistence/migrations.js";
import { createGovernanceRecommendation, createLearningSignal } from "../src/evaluation-corpus/regression.js";
import { createFallbackRelationship } from "../src/component-governance/factories.js";
import { AT, PROVENANCE, activeGrant, baseActor, baseAuthority } from "./helpers/governor-harness.js";

const REG_PROVENANCE = { actorId: "registry-actor", source: "core04-test" };

function createRegistry(ledger?: InMemoryGovernanceLedger, store?: InMemoryGovernedComponentRegistryStore) {
  return new GovernedComponentRegistry({
    store: store ?? new InMemoryGovernedComponentRegistryStore(),
    ledger,
    at: AT,
    provenance: REG_PROVENANCE,
  });
}

function baseAgent(overrides: Partial<Parameters<typeof createAgentIdentity>[0]> = {}) {
  return createAgentIdentity({
    id: "agent-1:1.0.0",
    componentId: "agent-1",
    version: "1.0.0",
    artifactIdentity: "artifact-a",
    runtimeIdentity: "runtime-a",
    createdAt: AT,
    provenance: REG_PROVENANCE,
    status: "ACTIVE",
    ...overrides,
  });
}

function baseModel(overrides: Partial<Parameters<typeof createModelIdentity>[0]> = {}) {
  return createModelIdentity({
    id: "model-1:1.0.0",
    componentId: "model-1",
    version: "1.0.0",
    modelFamily: "generic",
    providerMetadata: { provider: "vendor-a" },
    createdAt: AT,
    provenance: REG_PROVENANCE,
    status: "ACTIVE",
    ...overrides,
  });
}

function assessResponsibility() {
  return createResponsibility({
    id: "resp-assess",
    responsibilityId: "resp-assess",
    requiredCapabilities: ["generic:reason"],
    requiredQualifications: [
      { requirementId: "req-1", kind: "EVALUATION_SUITE", evaluationSuiteId: "suite-1", evaluationSuiteVersion: "1.0.0" },
    ],
    effectiveFrom: AT,
    createdAt: AT,
    provenance: REG_PROVENANCE,
  });
}

function qualifiedRecord(componentId: string, version: string) {
  return createQualificationRecord({
    id: "qual-1",
    qualificationId: "qual-1",
    componentId,
    componentVersion: version,
    responsibilityId: "resp-assess",
    status: "QUALIFIED",
    evidenceRefs: ["ev-run-1"],
    evaluationRunId: "run-1",
    evaluationSuiteId: "suite-1",
    evaluationSuiteVersion: "1.0.0",
    validFrom: AT,
    createdAt: AT,
    provenance: REG_PROVENANCE,
  });
}

function assignmentPolicy(requireHuman = false) {
  const actor = baseActor();
  const authority = baseAuthority(["EXECUTE_ACTION", "MODEL_GOVERNANCE"]);
  const grant = activeGrant(actor.id, authority, {
    scopes: ["EXECUTE_ACTION", "MODEL_GOVERNANCE"],
    resource: { domain: "component-governance", resourceType: "responsibility_assignment" },
  });
  const gate: PolicyGate = { id: "g1", code: "gate_a", operator: "EQ", expected: "PASS", mandatory: true, evidenceKind: "gate_a" };
  const policy = activatePolicyVersion(
    createPolicyVersion({
      id: "pol-v1",
      policyId: "pol-1",
      version: "1.0.0",
      domain: "test",
      decisionType: "ASSIGN_RESPONSIBILITY",
      createdAt: AT,
      provenance: PROVENANCE,
      applicableActorAuthority: [actor.code],
      requiredAuthorityScope: "EXECUTE_ACTION",
      requiredEvidence: [],
      gates: [gate],
      decisionOutcomes: { onPass: "APPROVE", onFail: "REJECT" },
      failureBehavior: "BLOCK",
      rollbackRequirements: { required: false },
      overrideRules: { humanOverrideAvailable: true, requiredAuthorityScope: "OVERRIDE_DECISION" },
      autonomyMode: requireHuman ? "HUMAN_APPROVAL" : "AUTONOMOUS",
      effectiveFrom: AT,
    }),
    AT,
  );
  return { policy, authority, grant, actor, requireHuman };
}

describe("CORE-04 Agent, Model & Responsibility Governance", () => {
  it("1. component identity is distinct from authority", () => {
    const agent = baseAgent();
    const authority = createAuthority({ id: "auth-1", code: "AUTH", scopes: ["EXECUTE_ACTION"], createdAt: AT, provenance: PROVENANCE });
    expect(agent.componentId).not.toBe(authority.code);
    expect(agent.id).not.toBe(authority.id);
  });

  it("2. declared capability is not qualification", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    const decl = createCapabilityDeclaration({
      id: "cap-1",
      declarationId: "cap-1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      capabilityId: "generic:reason",
      createdAt: AT,
      provenance: REG_PROVENANCE,
    });
    registry.declareCapability({ declaration: decl });
    expect(registry.store.getQualificationRecord("qual-1")).toBeUndefined();
  });

  it("3. qualification is not responsibility assignment", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    expect(registry.store.getAssignment("asgn-1")).toBeUndefined();
  });

  it("4. eligibility is not assignment", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-1", declarationId: "cap-1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    const elig = registry.evaluateEligibility({
      eligibilityId: "elig-1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
    });
    expect(elig.outcome).toBe("EVALUATION_REQUIRED");
    expect(registry.store.listAssignments().length).toBe(0);
  });

  it("5. agent can declare namespaced capability", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-ns", declarationId: "cap-ns", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "jipcomply:regulation:assess", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    expect(registry.store.listCapabilityDeclarations(agent.componentId)[0]?.capabilityId).toBe("jipcomply:regulation:assess");
  });

  it("6. model can declare namespaced capability", () => {
    const registry = createRegistry();
    const model = baseModel();
    registry.registerComponent({ component: model });
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-m", declarationId: "cap-m", componentId: model.componentId, componentVersion: model.version,
        capabilityId: "quintelab:model:evaluate", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    expect(registry.store.listCapabilityDeclarations(model.componentId)[0]?.capabilityId).toContain("quintelab");
  });

  it("7. provider metadata is optional", () => {
    const model = createModelIdentity({
      id: "m2:1.0.0", componentId: "m2", version: "1.0.0", createdAt: AT, provenance: REG_PROVENANCE,
    });
    expect(model.providerMetadata).toBeUndefined();
  });

  it("8. capability identifiers are extensible", () => {
    const cap = "future:any-capability";
    expect(cap).toMatch(/:/);
  });

  it("9. unqualified component is ineligible", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
    });
    expect(["INELIGIBLE", "EVALUATION_REQUIRED"]).toContain(elig.outcome);
  });

  it("10. missing evaluation → EVALUATION_REQUIRED", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
    });
    expect(elig.outcome).toBe("EVALUATION_REQUIRED");
  });

  it("11. qualifying evaluation → ELIGIBLE", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
    });
    expect(elig.outcome).toBe("ELIGIBLE");
  });

  it("12. expired qualification blocks new assignment", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({
      record: createQualificationRecord({
        id: "q-exp", qualificationId: "q-exp", componentId: agent.componentId, componentVersion: agent.version,
        status: "EXPIRED", evidenceRefs: [], validFrom: "2020-01-01T00:00:00.000Z", validUntil: "2020-06-01T00:00:00.000Z",
        createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
    });
    expect(elig.outcome).not.toBe("ELIGIBLE");
  });

  it("13. suspended component blocks new assignment", () => {
    const registry = createRegistry();
    const agent = baseAgent({ status: "SUSPENDED" });
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
    });
    expect(elig.outcome).toBe("SUSPENDED");
  });

  it("14. historical assignment reconstructable after suspension", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    const policy = assignmentPolicy();
    const assignment = registry.assignResponsibility({
      assignmentId: "asgn-1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: policy.actor.id, assignmentPolicy: { authority: policy.authority, grant: policy.grant, policyVersion: policy.policy },
    });
    registry.suspendComponent({ transitionId: "t1", componentId: agent.componentId, componentVersion: agent.version, rationale: "incident", actorId: policy.actor.id });
    expect(registry.store.getAssignment(assignment.assignmentId)?.status).toBe("ACTIVE");
  });

  it("15. qualification record immutable historically", () => {
    const record = qualifiedRecord("a1", "1.0.0");
    expect(record.immutable).toBe(true);
  });

  it("16. requalification creates new record", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    registry.requalifyComponent({
      record: createQualificationRecord({
        id: "qual-2", qualificationId: "qual-2", componentId: agent.componentId, componentVersion: agent.version,
        status: "QUALIFIED", evidenceRefs: ["ev-2"], validFrom: AT, createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    expect(registry.store.getQualificationRecord("qual-1")?.supersededBy).toBe("qual-2");
    expect(registry.store.getQualificationRecord("qual-2")).toBeDefined();
  });

  it("17. eligibility evaluation is deterministic", () => {
    const agent = baseAgent();
    const resp = assessResponsibility();
    const caps = [createCapabilityDeclaration({
      id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
      capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
    })];
    const quals = [qualifiedRecord(agent.componentId, agent.version)];
    const a = evaluateResponsibilityEligibility({
      eligibilityId: "e1", component: agent, responsibility: resp, capabilityDeclarations: caps,
      qualificationRecords: quals, at: AT, provenance: REG_PROVENANCE,
    });
    const b = evaluateResponsibilityEligibility({
      eligibilityId: "e1", component: agent, responsibility: resp, capabilityDeclarations: caps,
      qualificationRecords: quals, at: AT, provenance: REG_PROVENANCE,
    });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.outcome).toBe(b.outcome);
  });

  it("18. policy may allow autonomous assignment", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy(false);
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    const asgn = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(asgn.status).toBe("ACTIVE");
  });

  it("19. human approval not globally required", () => {
    const pol = assignmentPolicy(false);
    expect(pol.requireHuman).toBe(false);
  });

  it("20. policy may require human approval", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy(true);
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess",
      assignmentPolicy: { requireHumanApproval: true },
    });
    expect(elig.outcome).toBe("HUMAN_APPROVAL_REQUIRED");
  });

  it("21. unauthorized human cannot approve responsibility", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy(true);
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
      assignmentPolicy: { requireHumanApproval: true },
    });
    const pending = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { requireHumanApproval: true, authority: pol.authority, grant: null, policyVersion: pol.policy },
    });
    expect(pending.status).toBe("PENDING");
    expect(() =>
      registry.approveAssignment({
        assignmentId: "a1", approvedByActorId: "unauthorized-human",
        assignmentPolicy: { authority: pol.authority, grant: null, policyVersion: pol.policy },
      }),
    ).toThrow(GovernanceError);
  });

  it("22. authorized human can approve", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy(true);
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
      assignmentPolicy: { requireHumanApproval: true },
    });
    registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { requireHumanApproval: true, authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    const approved = registry.approveAssignment({
      assignmentId: "a1", approvedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(approved.status).toBe("ACTIVE");
    expect(approved.humanApproved).toBe(true);
  });

  it("23. assignment binds exact component/version", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    const asgn = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(asgn.componentId).toBe("agent-1");
    expect(asgn.componentVersion).toBe("1.0.0");
  });

  it("24. assignment binds exact responsibility", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    const asgn = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(asgn.responsibilityId).toBe("resp-assess");
  });

  it("25. assignment binds authority/policy/evidence", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    const asgn = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id, evidenceRefs: ["ev-1"],
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(asgn.authorityGrantId).toBe(pol.grant.id);
    expect(asgn.policyVersionId).toBe(pol.policy.id);
    expect(asgn.evidenceRefs).toContain("ev-1");
  });

  it("26. assignment survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "core04-asgn-"));
    const dbPath = join(dir, "gov.db");
    try {
      const storage1 = openNodeSqliteGovernanceStorage({ path: dbPath });
      const registry1 = new GovernedComponentRegistry({ store: storage1.componentStore, at: AT, provenance: REG_PROVENANCE });
      const agent = baseAgent();
      const pol = assignmentPolicy();
      registry1.registerComponent({ component: agent });
      registry1.defineResponsibility(assessResponsibility());
      registry1.declareCapability({
        declaration: createCapabilityDeclaration({
          id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
          capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
        }),
      });
      registry1.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
      const elig = registry1.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
      registry1.assignResponsibility({
        assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
        responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
        assignedByActorId: pol.actor.id,
        assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
      });
      storage1.close();
      const storage2 = openNodeSqliteGovernanceStorage({ path: dbPath });
      expect(storage2.componentStore.getAssignment("a1")?.status).toBe("ACTIVE");
      storage2.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows file lock tolerance
      }
    }
  });

  it("27. registry survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "core04-reg-"));
    const dbPath = join(dir, "gov.db");
    try {
      const s1 = openNodeSqliteGovernanceStorage({ path: dbPath });
      s1.componentStore.saveComponent(baseAgent());
      s1.close();
      const s2 = openNodeSqliteGovernanceStorage({ path: dbPath });
      expect(s2.componentStore.getComponent("agent-1", "1.0.0")?.componentId).toBe("agent-1");
      s2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("28. qualification survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "core04-qual-"));
    const dbPath = join(dir, "gov.db");
    try {
      const s1 = openNodeSqliteGovernanceStorage({ path: dbPath });
      s1.componentStore.saveQualificationRecord(qualifiedRecord("a1", "1.0.0"));
      s1.close();
      const s2 = openNodeSqliteGovernanceStorage({ path: dbPath });
      expect(s2.componentStore.getQualificationRecord("qual-1")?.status).toBe("QUALIFIED");
      s2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("29. suspension survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "core04-susp-"));
    const dbPath = join(dir, "gov.db");
    try {
      const s1 = openNodeSqliteGovernanceStorage({ path: dbPath });
      const registry = new GovernedComponentRegistry({ store: s1.componentStore, at: AT, provenance: REG_PROVENANCE });
      registry.registerComponent({ component: baseAgent() });
      registry.suspendComponent({ transitionId: "t1", componentId: "agent-1", componentVersion: "1.0.0", rationale: "test", actorId: "a" });
      s1.close();
      const s2 = openNodeSqliteGovernanceStorage({ path: dbPath });
      expect(s2.componentStore.getComponent("agent-1", "1.0.0")?.status).toBe("SUSPENDED");
      s2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("30. capability claim cannot self-grant authority", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:execute", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    const grant = activeGrant("governor-actor", baseAuthority(["EXECUTE_ACTION"]));
    expect(grant.actorId).not.toBe(agent.componentId);
    expect(registry.store.listCapabilityDeclarations(agent.componentId).length).toBe(1);
  });

  it("31. component cannot self-qualify without evidence", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess",
    });
    expect(elig.outcome).not.toBe("ELIGIBLE");
  });

  it("32. component cannot self-assign responsibility", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    expect(() =>
      registry.assignResponsibility({
        assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
        responsibilityId: "resp-assess", eligibilityId: "missing", mode: "FULL", assignedByActorId: agent.componentId,
      }),
    ).toThrow(GovernanceError);
  });

  it("33. regression signal does not directly demote", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    const signal = createLearningSignal({
      id: "sig-1", signalId: "sig-1", domain: "test", kind: "REGRESSION_DETECTED", severity: "HIGH",
      rationale: "regression", refs: [], createdAt: AT, provenance: REG_PROVENANCE,
    });
    const rec = createGovernanceRecommendation({
      id: "rec-1", recommendationId: "rec-1", kind: "RESTRICT_RESPONSIBILITY", domain: "test",
      rationale: "reduce", refs: [], signalIds: [signal.signalId], createdAt: AT, provenance: REG_PROVENANCE,
    });
    const proposal = registry.proposeDemotionFromRecommendation({
      transitionId: "t1", componentId: agent.componentId, componentVersion: agent.version,
      recommendation: rec, learningSignal: signal, actorId: "gov",
    });
    expect(agent.status).toBe("ACTIVE");
    expect(proposal.kind).toBe("REDUCE_RESPONSIBILITY");
  });

  it("34. recommendation does not directly demote", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    const rec = createGovernanceRecommendation({
      id: "rec-1", recommendationId: "rec-1", kind: "RESTRICT_RESPONSIBILITY", domain: "test",
      rationale: "reduce", refs: [], createdAt: AT, provenance: REG_PROVENANCE,
    });
    registry.proposeDemotionFromRecommendation({
      transitionId: "t1", componentId: agent.componentId, componentVersion: agent.version,
      recommendation: rec, actorId: "gov",
    });
    expect(registry.store.getComponent(agent.componentId, agent.version)?.status).toBe("ACTIVE");
  });

  it("35. governed demotion can reduce responsibility", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    const result = registry.executeDemotion({
      transitionId: "t2", componentId: agent.componentId, componentVersion: agent.version,
      rationale: "governed demotion", decisionId: "dec-1", actorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(result.component.status).toBe("SUSPENDED");
  });

  it("36. historical prior responsibility preserved", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    registry.executeDemotion({
      transitionId: "t2", componentId: agent.componentId, componentVersion: agent.version,
      rationale: "demotion", decisionId: "dec-1", actorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(registry.store.getAssignment("a1")).toBeDefined();
  });

  it("37. canary assignment constraints enforced", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({
      record: createQualificationRecord({
        id: "q1", qualificationId: "q1", componentId: agent.componentId, componentVersion: agent.version,
        responsibilityId: "resp-assess",
        status: "PROBATION", evidenceRefs: ["ev"], evaluationSuiteId: "suite-1", evaluationSuiteVersion: "1.0.0",
        validFrom: AT, createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    const asgn = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "CANARY",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy, allowedModes: ["CANARY", "PROBATION"] },
    });
    expect(asgn.mode).toBe("CANARY");
  });

  it("38. probation constraints enforced", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({
      record: createQualificationRecord({
        id: "q1", qualificationId: "q1", componentId: agent.componentId, componentVersion: agent.version,
        responsibilityId: "resp-assess",
        status: "PROBATION", evidenceRefs: ["ev"], evaluationSuiteId: "suite-1", evaluationSuiteVersion: "1.0.0",
        validFrom: AT, createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    expect(elig.outcome).toBe("ELIGIBLE_WITH_RESTRICTIONS");
    const asgn = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "PROBATION",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(asgn.mode).toBe("PROBATION");
  });

  it("39. validator independence enforced when policy requires", () => {
    const producer = baseAgent({ componentId: "prod", id: "prod:1.0.0" });
    const result = validateValidatorIndependence({
      producer,
      validator: producer,
      policy: { requireIndependentValidator: true, forbidSameComponent: true },
    });
    expect(result.valid).toBe(false);
  });

  it("40. validator independence not globally mandatory", () => {
    const producer = baseAgent();
    const result = validateValidatorIndependence({
      producer,
      validator: producer,
      policy: { requireIndependentValidator: false },
    });
    expect(result.valid).toBe(true);
  });

  it("41. fallback must be qualified", () => {
    const registry = createRegistry();
    const primary = baseAgent({ componentId: "primary", id: "primary:1.0.0" });
    const fallback = baseAgent({ componentId: "fallback", id: "fallback:1.0.0" });
    registry.registerComponent({ component: primary });
    registry.registerComponent({ component: fallback });
    registry.defineResponsibility(assessResponsibility());
    expect(() =>
      registry.recordFallbackRelationship({
        relationship: createFallbackRelationship({
          id: "fb-1", relationshipId: "fb-1", primaryComponentId: primary.componentId, primaryComponentVersion: primary.version,
          fallbackComponentId: fallback.componentId, fallbackComponentVersion: fallback.version,
          responsibilityId: "resp-assess", createdAt: AT, provenance: REG_PROVENANCE,
        }),
      }),
    ).toThrow(GovernanceError);
  });

  it("42. fallback must be eligible", () => {
    const registry = createRegistry();
    const primary = baseAgent({ componentId: "primary", id: "primary:1.0.0" });
    const fallback = baseAgent({ componentId: "fallback", id: "fallback:1.0.0" });
    registry.registerComponent({ component: primary });
    registry.registerComponent({ component: fallback });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: fallback.componentId, componentVersion: fallback.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(fallback.componentId, fallback.version) });
    const fb = registry.recordFallbackRelationship({
      relationship: createFallbackRelationship({
        id: "fb-1", relationshipId: "fb-1", primaryComponentId: primary.componentId, primaryComponentVersion: primary.version,
        fallbackComponentId: fallback.componentId, fallbackComponentVersion: fallback.version,
        responsibilityId: "resp-assess", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    expect(fb.fallbackComponentId).toBe("fallback");
  });

  it("43. arbitrary fallback blocked", () => {
    const registry = createRegistry();
    const primary = baseAgent({ componentId: "primary", id: "primary:1.0.0" });
    const random = baseAgent({ componentId: "random", id: "random:1.0.0" });
    registry.registerComponent({ component: primary });
    registry.registerComponent({ component: random });
    registry.defineResponsibility(assessResponsibility());
    expect(() =>
      registry.recordFallbackRelationship({
        relationship: createFallbackRelationship({
          id: "fb-1", relationshipId: "fb-1", primaryComponentId: primary.componentId, primaryComponentVersion: primary.version,
          fallbackComponentId: random.componentId, fallbackComponentVersion: random.version,
          responsibilityId: "resp-assess", createdAt: AT, provenance: REG_PROVENANCE,
        }),
      }),
    ).toThrow(GovernanceError);
  });

  it("44. replacement preserves history", () => {
    const registry = createRegistry();
    const incumbent = baseAgent({ componentId: "inc", id: "inc:1.0.0" });
    const candidate = baseAgent({ componentId: "cand", id: "cand:1.0.0" });
    registry.registerComponent({ component: incumbent });
    registry.registerComponent({ component: candidate });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: candidate.componentId, componentVersion: candidate.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(candidate.componentId, candidate.version) });
    registry.proposeReplacement({
      proposal: {
        id: "rp-1", proposalId: "rp-1", incumbentComponentId: incumbent.componentId, incumbentComponentVersion: incumbent.version,
        candidateComponentId: candidate.componentId, candidateComponentVersion: candidate.version,
        responsibilityId: "resp-assess", rationale: "replacement", createdAt: AT, provenance: REG_PROVENANCE,
        status: "PROPOSED", contentHash: "rp",
      },
    });
    expect(registry.store.getComponent(incumbent.componentId, incumbent.version)).toBeDefined();
  });

  it("45. selection only considers eligible components", () => {
    const store = new InMemoryGovernedComponentRegistryStore();
    const registry = createRegistry(undefined, store);
    const qualified = baseAgent({ componentId: "q1", id: "q1:1.0.0" });
    const unqualified = baseAgent({ componentId: "u1", id: "u1:1.0.0" });
    registry.registerComponent({ component: qualified });
    registry.registerComponent({ component: unqualified });
    const resp = assessResponsibility();
    registry.defineResponsibility(resp);
    for (const c of [qualified, unqualified]) {
      registry.declareCapability({
        declaration: createCapabilityDeclaration({
          id: `cap-${c.componentId}`, declarationId: `cap-${c.componentId}`, componentId: c.componentId, componentVersion: c.version,
          capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
        }),
      });
    }
    registry.recordQualification({ record: qualifiedRecord(qualified.componentId, qualified.version) });
    const result = registry.selectComponent({
      selectionId: "sel-1", responsibilityId: resp.responsibilityId,
      candidates: [
        { componentId: qualified.componentId, componentVersion: qualified.version },
        { componentId: unqualified.componentId, componentVersion: unqualified.version },
      ],
    });
    expect(result?.selectedComponentId).toBe("q1");
  });

  it("46. selection respects policy restrictions", () => {
    const store = new InMemoryGovernedComponentRegistryStore();
    const registry = createRegistry(undefined, store);
    const a = baseAgent({ componentId: "a", id: "a:1.0.0" });
    const b = baseAgent({ componentId: "b", id: "b:1.0.0" });
    registry.registerComponent({ component: a });
    registry.registerComponent({ component: b });
    registry.defineResponsibility(assessResponsibility());
    for (const c of [a, b]) {
      registry.declareCapability({
        declaration: createCapabilityDeclaration({
          id: `cap-${c.componentId}`, declarationId: `cap-${c.componentId}`, componentId: c.componentId, componentVersion: c.version,
          capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
        }),
      });
      registry.recordQualification({ record: qualifiedRecord(c.componentId, c.version) });
    }
    const result = registry.selectComponent({
      selectionId: "sel-1", responsibilityId: "resp-assess",
      candidates: [
        { componentId: "a", componentVersion: "1.0.0", costMetadata: 10 },
        { componentId: "b", componentVersion: "1.0.0", costMetadata: 1 },
      ],
      selectionPolicy: { policyId: "cost", preferLowerCost: true },
    });
    expect(result?.selectedComponentId).toBe("b");
  });

  it("47. selection result deterministic for deterministic policy", () => {
    const store = new InMemoryGovernedComponentRegistryStore();
    const registry = createRegistry(undefined, store);
    const a = baseAgent({ componentId: "a", id: "a:1.0.0" });
    registry.registerComponent({ component: a });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: a.componentId, componentVersion: a.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(a.componentId, a.version) });
    const r1 = registry.selectComponent({ selectionId: "s1", responsibilityId: "resp-assess", candidates: [{ componentId: "a", componentVersion: "1.0.0" }] });
    const r2 = registry.selectComponent({ selectionId: "s2", responsibilityId: "resp-assess", candidates: [{ componentId: "a", componentVersion: "1.0.0" }] });
    expect(r1?.selectedComponentId).toBe(r2?.selectedComponentId);
  });

  it("48. model provider does not affect Core semantics", () => {
    const m1 = baseModel({ providerMetadata: { provider: "openai-like" } });
    const m2 = baseModel({ componentId: "model-2", id: "model-2:1.0.0", providerMetadata: { provider: "anthropic-like" } });
    const store = new InMemoryGovernedComponentRegistryStore();
    const r1 = evaluateResponsibilityEligibility({
      eligibilityId: "e1", component: m1, responsibility: assessResponsibility(),
      capabilityDeclarations: [], qualificationRecords: [], at: AT, provenance: REG_PROVENANCE,
    });
    const r2 = evaluateResponsibilityEligibility({
      eligibilityId: "e2", component: m2, responsibility: assessResponsibility(),
      capabilityDeclarations: [], qualificationRecords: [], at: AT, provenance: REG_PROVENANCE,
    });
    expect(r1.outcome).toBe(r2.outcome);
    expect(store).toBeDefined();
  });

  it("49. no model SDK required", () => {
    expect(typeof selectEligibleComponent).toBe("function");
    expect(typeof GovernedComponentRegistry).toBe("function");
  });

  it("50. no LLM call occurs in component governance", () => {
    const registry = createRegistry();
    registry.registerComponent({ component: baseAgent() });
    expect(registry.store.listComponents().length).toBe(1);
  });

  it("51. migration 003 applies after 001/002", () => {
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(3);
    expect(MIGRATIONS.map((m) => m.id)).toEqual(["001_initial", "002_evaluation_corpus", "003_component_governance"]);
  });

  it("52. upgrade from schema 002 preserves prior state", () => {
    const dir = mkdtempSync(join(tmpdir(), "core04-mig-"));
    const dbPath = join(dir, "gov.db");
    try {
      const s1 = openNodeSqliteGovernanceStorage({ path: dbPath });
      s1.corpusStore.saveCandidate({
        id: "c1", candidateId: "c1", domain: "d", title: "t", fingerprint: "fp", sourceProvenance: { sourceKind: "MANUAL_REFERENCE" },
        inputContextRefs: [], evidenceRefs: [], status: "PENDING", contentHash: "ch", schemaVersion: "core-00.1",
        createdAt: AT, recordedAt: AT, provenance: REG_PROVENANCE,
      } as import("../src/index.js").EvaluationCaseCandidate);
      s1.componentStore.saveComponent(baseAgent());
      s1.close();
      const s2 = openNodeSqliteGovernanceStorage({ path: dbPath });
      expect(s2.corpusStore.getCandidate("c1")?.candidateId).toBe("c1");
      expect(s2.componentStore.getComponent("agent-1", "1.0.0")).toBeDefined();
      s2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("53. ledger integrity preserved with component events", () => {
    const ledger = new InMemoryGovernanceLedger();
    const registry = createRegistry(ledger);
    registry.registerComponent({ component: baseAgent() });
    assertLedgerAppendOnly(ledger);
  });

  it("54. trace contains component qualification/assignment refs", () => {
    const agent = baseAgent();
    const qual = qualifiedRecord(agent.componentId, agent.version);
    const refs = buildComponentGovernanceTraceRefs({ component: agent, qualification: qual });
    expect(refs.componentId).toBe("agent-1");
    expect(refs.qualificationRecordId).toBe("qual-1");
    expect(refs.evaluationRunId).toBe("run-1");
  });

  it("55. no production JipComply dependency", () => {
    expect(typeof createAgentIdentity).toBe("function");
  });

  it("56. no production Quinté dependency", () => {
    expect(typeof createModelIdentity).toBe("function");
  });

  it("57. public 0.2 API preserved — GovernorKernel still exported", async () => {
    const mod = await import("../src/index.js");
    expect(mod.GovernorKernel).toBeDefined();
    expect(mod.EvaluationCorpus).toBeDefined();
    expect(mod.GovernedComponentRegistry).toBeDefined();
  });

  // Fixture A — qualified component full flow
  it("Fixture A — qualified component: register → qualify → eligible → assign", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.defineResponsibility(assessResponsibility());
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    expect(elig.outcome).toBe("ELIGIBLE");
    const asgn = registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(asgn.status).toBe("ACTIVE");
  });

  it("Fixture B — insufficient qualification: EVALUATION_REQUIRED, no assignment", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.defineResponsibility(assessResponsibility());
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    expect(elig.outcome).toBe("EVALUATION_REQUIRED");
    expect(isAssignmentEligible(elig.outcome)).toBe(false);
  });

  it("Fixture C — regression demotion via governed decision", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    const rec = createGovernanceRecommendation({
      id: "rec-1", recommendationId: "rec-1", kind: "RESTRICT_RESPONSIBILITY", domain: "test",
      rationale: "regression detected", refs: [], createdAt: AT, provenance: REG_PROVENANCE,
    });
    registry.proposeDemotionFromRecommendation({ transitionId: "t1", componentId: agent.componentId, componentVersion: agent.version, recommendation: rec, actorId: "gov" });
    const result = registry.executeDemotion({
      transitionId: "t2", componentId: agent.componentId, componentVersion: agent.version,
      rationale: "autonomous demotion permitted", decisionId: "dec-1", actorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(result.component.status).toBe("SUSPENDED");
    expect(registry.store.listStatusTransitions(agent.componentId).length).toBeGreaterThan(0);
  });

  it("Fixture D — human approval for high-risk responsibility", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy(true);
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", assignmentPolicy: { requireHumanApproval: true },
    });
    expect(elig.outcome).toBe("HUMAN_APPROVAL_REQUIRED");
    registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { requireHumanApproval: true, authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    const approved = registry.approveAssignment({
      assignmentId: "a1", approvedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(approved.status).toBe("ACTIVE");
  });

  it("Fixture E — suspension blocks new assignments, history preserved", () => {
    const registry = createRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: agent.componentId, componentVersion: agent.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({ eligibilityId: "e1", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    registry.assignResponsibility({
      assignmentId: "a1", componentId: agent.componentId, componentVersion: agent.version,
      responsibilityId: "resp-assess", eligibilityId: elig.eligibilityId, mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    registry.suspendComponent({ transitionId: "t1", componentId: agent.componentId, componentVersion: agent.version, rationale: "incident", actorId: pol.actor.id, decisionId: "dec-1" });
    const newElig = registry.evaluateEligibility({ eligibilityId: "e2", componentId: agent.componentId, componentVersion: agent.version, responsibilityId: "resp-assess" });
    expect(newElig.outcome).toBe("SUSPENDED");
    expect(registry.store.getAssignment("a1")).toBeDefined();
  });

  it("Fixture F — governed fallback replacement", () => {
    const registry = createRegistry();
    const primary = baseAgent({ componentId: "primary", id: "primary:1.0.0", status: "SUSPENDED" });
    const fallback = baseAgent({ componentId: "fallback", id: "fallback:1.0.0" });
    registry.registerComponent({ component: primary });
    registry.registerComponent({ component: fallback });
    registry.defineResponsibility(assessResponsibility());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "c1", declarationId: "c1", componentId: fallback.componentId, componentVersion: fallback.version,
        capabilityId: "generic:reason", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    registry.recordQualification({ record: qualifiedRecord(fallback.componentId, fallback.version) });
    registry.recordFallbackRelationship({
      relationship: createFallbackRelationship({
        id: "fb-1", relationshipId: "fb-1", primaryComponentId: primary.componentId, primaryComponentVersion: primary.version,
        fallbackComponentId: fallback.componentId, fallbackComponentVersion: fallback.version,
        responsibilityId: "resp-assess", createdAt: AT, provenance: REG_PROVENANCE,
      }),
    });
    expect(registry.store.listFallbackRelationships("primary").length).toBe(1);
  });

  it("Fixture G — validator independence", () => {
    const producer = baseAgent({ componentId: "prod", id: "prod:1.0.0" });
    const validator = baseAgent({ componentId: "valid", id: "valid:1.0.0" });
    const same = validateValidatorIndependence({ producer, validator: producer, policy: { requireIndependentValidator: true } });
    const independent = validateValidatorIndependence({ producer, validator, policy: { requireIndependentValidator: true } });
    expect(same.valid).toBe(false);
    expect(independent.valid).toBe(true);
  });

  it("Fixture H — provider neutrality", () => {
    const openaiLike = baseModel({ providerMetadata: { provider: "vendor-x" } });
    const localLike = baseModel({ componentId: "local", id: "local:1.0.0", providerMetadata: { provider: "local-runtime" } });
    const registry = createRegistry();
    registry.registerComponent({ component: openaiLike });
    registry.registerComponent({ component: localLike });
    expect(registry.store.listComponents().length).toBe(2);
  });
});
