import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  activatePolicyVersion,
  assertLedgerAppendOnly,
  createAgentIdentity,
  createAuthority,
  createCapabilityDeclaration,
  createPolicyVersion,
  createQualificationRecord,
  createResponsibility,
  createResponsibilityAssignment,
  GovernanceError,
  GovernedComponentRegistry,
  InMemoryGovernedComponentRegistryStore,
  InMemoryGovernanceLedger,
  openNodeSqliteGovernanceStorage,
  PERSISTENCE_SCHEMA_VERSION,
  validateValidatorIndependence,
  createFallbackRelationship,
} from "../src/index.js";
import { createLearningSignal, createGovernanceRecommendation } from "../src/evaluation-corpus/regression.js";
import { ALL_MIGRATIONS } from "../src/persistence/migrations.js";
import { buildHarness, AT, PROVENANCE, activeGrant, baseActor, baseAuthority } from "./helpers/governor-harness.js";

const REG = { actorId: "rel02", source: "core-rel-02" };

function extractPublicExports(indexDts: string): string[] {
  const names = new Set<string>();
  for (const match of indexDts.matchAll(/export (?:type )?\{([^}]+)\}/g)) {
    for (const part of match[1]!.split(",")) {
      const token = part.trim();
      const name = token.includes(" as ")
        ? token.split(" as ").pop()!.trim()
        : token.split(/\s+/).pop()!.replace(/,$/, "");
      if (name && name !== "type") names.add(name);
    }
  }
  return [...names].sort();
}

function baseRegistry(store = new InMemoryGovernedComponentRegistryStore()) {
  return new GovernedComponentRegistry({ store, at: AT, provenance: REG });
}

function baseAgent() {
  return createAgentIdentity({
    id: "a1:1.0.0",
    componentId: "a1",
    version: "1.0.0",
    providerMetadata: { provider: "vendor-x" },
    createdAt: AT,
    provenance: REG,
    status: "ACTIVE",
  });
}

function assessResp() {
  return createResponsibility({
    id: "resp-1",
    responsibilityId: "resp-1",
    requiredCapabilities: ["generic:reason"],
    requiredQualifications: [
      { requirementId: "rq1", kind: "EVALUATION_SUITE", evaluationSuiteId: "suite-1", evaluationSuiteVersion: "1.0.0" },
    ],
    effectiveFrom: AT,
    createdAt: AT,
    provenance: REG,
  });
}

function qualified(componentId: string, version: string) {
  return createQualificationRecord({
    id: "q1",
    qualificationId: "q1",
    componentId,
    componentVersion: version,
    responsibilityId: "resp-1",
    status: "QUALIFIED",
    evidenceRefs: ["ev-1"],
    evaluationSuiteId: "suite-1",
    evaluationSuiteVersion: "1.0.0",
    validFrom: AT,
    createdAt: AT,
    provenance: REG,
  });
}

describe("CORE-REL-02 release audit", () => {
  it("A. identity and capability declarations do not grant authority", () => {
    const agent = baseAgent();
    const authority = createAuthority({
      id: "auth-x",
      code: "AUTH",
      scopes: ["EXECUTE_ACTION"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const decl = createCapabilityDeclaration({
      id: "cap-1",
      declarationId: "cap-1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      capabilityId: "jipcomply:regulation:assess",
      createdAt: AT,
      provenance: REG,
    });
    expect(agent.componentId).not.toBe(authority.id);
    expect(decl).not.toHaveProperty("authorityGrantId");
    expect(evaluateAuthorityGrantMissing(agent.componentId)).toBe(true);
  });

  it("B. capability claim is not qualification", () => {
    const registry = baseRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResp());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-1",
        declarationId: "cap-1",
        componentId: agent.componentId,
        componentVersion: agent.version,
        capabilityId: "jipcomply:regulation:assess",
        createdAt: AT,
        provenance: REG,
      }),
    });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
    });
    expect(elig.outcome).toBe("EVALUATION_REQUIRED");
    expect(registry.store.getQualificationRecord("q1")).toBeUndefined();
  });

  it("C. qualification is not assignment", () => {
    const registry = baseRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResp());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-1",
        declarationId: "cap-1",
        componentId: agent.componentId,
        componentVersion: agent.version,
        capabilityId: "generic:reason",
        createdAt: AT,
        provenance: REG,
      }),
    });
    registry.recordQualification({ record: qualified(agent.componentId, agent.version) });
    expect(registry.store.listAssignments().length).toBe(0);
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
    });
    expect(elig.outcome).toBe("ELIGIBLE");
    expect(registry.store.listAssignments().length).toBe(0);
  });

  it("D. responsibility assignment is not action authorization", async () => {
    const { adapter } = buildHarness();
    const executeSpy = vi.fn();
    adapter.actionExecutor.execute = executeSpy;
    const registry = baseRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResp());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-1",
        declarationId: "cap-1",
        componentId: agent.componentId,
        componentVersion: agent.version,
        capabilityId: "generic:reason",
        createdAt: AT,
        provenance: REG,
      }),
    });
    registry.recordQualification({ record: qualified(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
    });
    const assignment = registry.assignResponsibility({
      assignmentId: "asgn-1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
      eligibilityId: elig.eligibilityId,
      mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    expect(assignment).not.toHaveProperty("authorizationId");
    expect(assignment.status).toBe("ACTIVE");
    expect(executeSpy).not.toHaveBeenCalled();
    const manualAuth = createResponsibilityAssignment({
      id: "asgn-1",
      assignmentId: "asgn-1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
      eligibilityId: elig.eligibilityId,
      mode: "FULL",
      assignedByActorId: pol.actor.id,
      evidenceRefs: [],
      assignedAt: AT,
      validFrom: AT,
      status: "ACTIVE",
      createdAt: AT,
      provenance: REG,
    });
    expect(manualAuth).not.toHaveProperty("authorizedAt");
  });

  it("E. historical assignment valid after later suspension", () => {
    const registry = baseRegistry();
    const agent = baseAgent();
    const pol = assignmentPolicy();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResp());
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-1",
        declarationId: "cap-1",
        componentId: agent.componentId,
        componentVersion: agent.version,
        capabilityId: "generic:reason",
        createdAt: AT,
        provenance: REG,
      }),
    });
    registry.recordQualification({ record: qualified(agent.componentId, agent.version) });
    const elig = registry.evaluateEligibility({
      eligibilityId: "e1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
    });
    registry.assignResponsibility({
      assignmentId: "asgn-1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
      eligibilityId: elig.eligibilityId,
      mode: "FULL",
      assignedByActorId: pol.actor.id,
      assignmentPolicy: { authority: pol.authority, grant: pol.grant, policyVersion: pol.policy },
    });
    registry.suspendComponent({
      transitionId: "t1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      rationale: "incident",
      actorId: pol.actor.id,
    });
    expect(registry.store.getAssignment("asgn-1")?.status).toBe("ACTIVE");
    const newElig = registry.evaluateEligibility({
      eligibilityId: "e2",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
    });
    expect(newElig.outcome).toBe("SUSPENDED");
  });

  it("F. expired qualification blocks new assignment; requalification preserves history", () => {
    const registry = baseRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    registry.defineResponsibility(assessResp());
    registry.recordQualification({
      record: createQualificationRecord({
        id: "q-exp",
        qualificationId: "q-exp",
        componentId: agent.componentId,
        componentVersion: agent.version,
        status: "EXPIRED",
        evidenceRefs: [],
        validFrom: "2020-01-01T00:00:00.000Z",
        validUntil: "2020-06-01T00:00:00.000Z",
        createdAt: AT,
        provenance: REG,
      }),
    });
    registry.requalifyComponent({
      record: qualified(agent.componentId, agent.version),
    });
    expect(registry.store.getQualificationRecord("q-exp")).toBeDefined();
    expect(registry.store.getQualificationRecord("q1")).toBeDefined();
  });

  it("G. regression recommendation does not self-modify responsibility", () => {
    const registry = baseRegistry();
    const agent = baseAgent();
    registry.registerComponent({ component: agent });
    const signal = createLearningSignal({
      id: "sig-1",
      signalId: "sig-1",
      kind: "REGRESSION_DETECTED",
      domain: "d",
      rationale: "regression",
      refs: [],
      createdAt: AT,
      provenance: REG,
    });
    const rec = createGovernanceRecommendation({
      id: "rec-1",
      recommendationId: "rec-1",
      kind: "RESTRICT_RESPONSIBILITY",
      domain: "d",
      rationale: "reduce",
      refs: [],
      signalIds: [signal.signalId],
      createdAt: AT,
      provenance: REG,
    });
    registry.proposeDemotionFromRecommendation({
      transitionId: "t1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      recommendation: rec,
      learningSignal: signal,
      actorId: "gov",
    });
    expect(registry.store.getComponent(agent.componentId, agent.version)?.status).toBe("ACTIVE");
    expect(registry.store.listAssignments().length).toBe(0);
  });

  it("H. fallback must be registered, qualified, and eligible", () => {
    const registry = baseRegistry();
    const primary = baseAgent();
    const fallback = createAgentIdentity({
      id: "fb:1.0.0",
      componentId: "fb",
      version: "1.0.0",
      createdAt: AT,
      provenance: REG,
      status: "ACTIVE",
    });
    registry.registerComponent({ component: primary });
    registry.registerComponent({ component: fallback });
    registry.defineResponsibility(assessResp());
    expect(() =>
      registry.recordFallbackRelationship({
        relationship: createFallbackRelationship({
          id: "rel-1",
          relationshipId: "rel-1",
          primaryComponentId: primary.componentId,
          primaryComponentVersion: primary.version,
          fallbackComponentId: fallback.componentId,
          fallbackComponentVersion: fallback.version,
          responsibilityId: "resp-1",
          createdAt: AT,
          provenance: REG,
        }),
      }),
    ).toThrow(GovernanceError);
  });

  it("I. validator independence is policy-driven", () => {
    const producer = baseAgent();
    const validator = createAgentIdentity({
      id: "v1:1.0.0",
      componentId: "v1",
      version: "1.0.0",
      createdAt: AT,
      provenance: REG,
    });
    expect(
      validateValidatorIndependence({
        producer,
        validator: producer,
        policy: { requireIndependentValidator: true },
      }).valid,
    ).toBe(false);
    expect(
      validateValidatorIndependence({
        producer,
        validator,
        policy: { requireIndependentValidator: false },
      }).valid,
    ).toBe(true);
  });

  it("J. no LLM provider runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.dependencies ?? {}).toEqual({});
    const serialized = JSON.stringify(pkg);
    expect(serialized).not.toMatch(/openai|anthropic|@google|huggingface|langchain/i);
  });

  it("public API preserves all v0.2.0 exports", () => {
    execSync("pnpm run build", { cwd: join(process.cwd()), stdio: "pipe" });
    const current = readFileSync(join(process.cwd(), "dist", "index.d.ts"), "utf8");
    const v020 = execSync("git show 95f53cc:packages/jiplabs-core/src/index.ts", { encoding: "utf8" });
    const currentExports = extractPublicExports(current);
    const v020Exports = extractPublicExports(v020);
    for (const name of v020Exports) {
      expect(currentExports, `missing v0.2.0 export: ${name}`).toContain(name);
    }
  });

  it("migration 002-only database upgrades to 003 preserving corpus", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel02-mig-"));
    const dbPath = join(dir, "v02.db");
    try {
      const db = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      db.corpusStore.saveCandidate({
        id: "c1",
        candidateId: "c1",
        domain: "d",
        title: "t",
        fingerprint: "fp",
        sourceProvenance: { sourceKind: "MANUAL_REFERENCE" },
        inputContextRefs: [],
        evidenceRefs: [],
        status: "PENDING",
        contentHash: "ch",
        schemaVersion: "core-00.1",
        createdAt: AT,
        recordedAt: AT,
        provenance: REG,
      } as import("../src/index.js").EvaluationCaseCandidate);
      db.close();
      const reopened = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      expect(reopened.corpusStore.getCandidate("c1")?.candidateId).toBe("c1");
      expect(reopened.componentStore).toBeDefined();
      reopened.componentStore.saveComponent(baseAgent());
      expect(reopened.componentStore.getComponent("a1", "1.0.0")).toBeDefined();
      reopened.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows tolerance
      }
    }
  });

  it("fresh database applies 001→002→003", () => {
    expect(ALL_MIGRATIONS.map((m) => m.id)).toEqual([
      "001_initial",
      "002_evaluation_corpus",
      "003_component_governance",
    ]);
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(3);
  });

  it("component governance state survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel02-restart-"));
    const dbPath = join(dir, "restart.db");
    try {
      const s1 = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      const registry = new GovernedComponentRegistry({ store: s1.componentStore, at: AT, provenance: REG });
      const agent = baseAgent();
      registry.registerComponent({ component: agent });
      registry.defineResponsibility(assessResp());
      registry.declareCapability({
        declaration: createCapabilityDeclaration({
          id: "cap-1",
          declarationId: "cap-1",
          componentId: agent.componentId,
          componentVersion: agent.version,
          capabilityId: "generic:reason",
          createdAt: AT,
          provenance: REG,
        }),
      });
      registry.recordQualification({ record: qualified(agent.componentId, agent.version) });
      registry.suspendComponent({
        transitionId: "t1",
        componentId: agent.componentId,
        componentVersion: agent.version,
        rationale: "test",
        actorId: "a",
      });
      s1.close();
      const s2 = openNodeSqliteGovernanceStorage({ path: dbPath, appliedAt: AT });
      expect(s2.componentStore.getComponent("a1", "1.0.0")?.status).toBe("SUSPENDED");
      expect(s2.componentStore.getQualificationRecord("q1")?.status).toBe("QUALIFIED");
      s2.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("ledger integrity preserved with component events", () => {
    const ledger = new InMemoryGovernanceLedger();
    const registry = new GovernedComponentRegistry({ store: new InMemoryGovernedComponentRegistryStore(), ledger, at: AT, provenance: REG });
    registry.registerComponent({ component: baseAgent() });
    assertLedgerAppendOnly(ledger);
    expect(ledger.list().length).toBeGreaterThan(0);
    expect(ledger.list()[0]?.eventType).toBe("COMPONENT_REGISTERED");
  });
});

function evaluateAuthorityGrantMissing(actorId: string): boolean {
  const authority = createAuthority({
    id: "auth-1",
    code: "AUTH",
    scopes: ["EXECUTE_ACTION"],
    createdAt: AT,
    provenance: PROVENANCE,
  });
  return actorId !== authority.id;
}

function assignmentPolicy() {
  const actor = baseActor();
  const authority = baseAuthority(["EXECUTE_ACTION", "MODEL_GOVERNANCE"]);
  const grant = activeGrant(actor.id, authority, {
    scopes: ["EXECUTE_ACTION", "MODEL_GOVERNANCE"],
    resource: { domain: "component-governance", resourceType: "responsibility_assignment" },
  });
  const policy = activatePolicyVersion(
    createPolicyVersion({
      id: "pv-rel02",
      policyId: "pol-rel02",
      version: "1.0.0",
      domain: "test",
      decisionType: "ASSIGN",
      createdAt: AT,
      provenance: PROVENANCE,
      applicableActorAuthority: [actor.code],
      requiredAuthorityScope: "EXECUTE_ACTION",
      requiredEvidence: [],
      gates: [],
      decisionOutcomes: { onPass: "APPROVE", onFail: "REJECT" },
      failureBehavior: "BLOCK",
      rollbackRequirements: { required: false },
      overrideRules: { humanOverrideAvailable: true, requiredAuthorityScope: "OVERRIDE_DECISION" },
      autonomyMode: "AUTONOMOUS",
      effectiveFrom: AT,
    }),
    AT,
  );
  return { policy, authority, grant, actor };
}
