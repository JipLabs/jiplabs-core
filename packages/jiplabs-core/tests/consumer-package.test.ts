import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function buildTarball(): { tarballName: string; tarballPath: string; tarballContents: string } {
  execSync("pnpm run build", { cwd: packageRoot, stdio: "pipe" });
  const tarballName = execSync("npm pack --silent", {
    cwd: packageRoot,
    encoding: "utf8",
  }).trim();
  const tarballPath = join(packageRoot, tarballName);
  const tarballContents = execSync(`tar -tzf "${tarballPath}"`, {
    encoding: "utf8",
  });
  return { tarballName, tarballPath, tarballContents };
}

function installAndRunConsumer(tarballPath: string): string {
  const consumerDir = mkdtempSync(join(tmpdir(), "jiplabs-core-consumer-"));
  try {
    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          name: "jiplabs-core-consumer-fixture",
          private: true,
          type: "module",
          dependencies: {
            "@jiplabs/core": `file:${tarballPath.replace(/\\/g, "/")}`,
          },
        },
        null,
        2,
      ),
    );

    execSync("npm install --no-package-lock", {
      cwd: consumerDir,
      stdio: "pipe",
    });

    writeFileSync(
      join(consumerDir, "consume.mjs"),
      `
import {
  activatePolicyVersion,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createDecisionProposal,
  createEvidence,
  createPolicyVersion,
  GovernorKernel,
  InMemoryExecutionClaimStore,
  InMemoryGovernanceLedger,
  InMemoryGovernanceRunStore,
  EvaluationCorpus,
  InMemoryEvaluationCorpusStore,
  createEvaluationCaseCandidate,
  GovernedComponentRegistry,
  InMemoryGovernedComponentRegistryStore,
  createAgentIdentity,
  createCapabilityDeclaration,
  createQualificationRecord,
  createResponsibility,
  evaluateResponsibilityEligibility,
  openNodeSqliteGovernanceStorage,
} from "@jiplabs/core";

const AT = "2026-08-25T12:00:00.000Z";
const provenance = { actorId: "consumer", source: "consumer-test" };
const resource = { domain: "consumer-domain", resourceType: "entity" };

const actor = createActor({
  id: "actor-1",
  type: "DOMAIN_GOVERNOR",
  code: "consumer-governor",
  scopes: ["consumer-domain"],
  createdAt: AT,
  provenance,
});

const authority = createAuthority({
  id: "auth-1",
  code: "CONSUMER_EXECUTE",
  scopes: ["EXECUTE_ACTION"],
  createdAt: AT,
  provenance,
});

const grant = createAuthorityGrant({
  id: "grant-1",
  actorId: actor.id,
  authority,
  scopes: ["EXECUTE_ACTION"],
  resource,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:00.000Z",
  issuerActorId: "issuer",
  createdAt: AT,
  provenance,
});

const policyVersion = activatePolicyVersion(
  createPolicyVersion({
    id: "pv-1",
    policyId: "policy-1",
    version: "1.0.0",
    domain: "consumer-domain",
    decisionType: "CONSUMER",
    createdAt: AT,
    provenance,
    applicableActorAuthority: [actor.code],
    requiredAuthorityScope: "EXECUTE_ACTION",
    requiredEvidence: ["gate_a"],
    gates: [{
      id: "g1",
      code: "gate_a",
      operator: "EQ",
      expected: "PASS",
      mandatory: true,
      evidenceKind: "gate_a",
    }],
    decisionOutcomes: { onPass: "APPROVE", onFail: "REJECT" },
    failureBehavior: "BLOCK",
    rollbackRequirements: { required: false },
    overrideRules: {
      humanOverrideAvailable: true,
      requiredAuthorityScope: "OVERRIDE_DECISION",
    },
    autonomyMode: "AUTONOMOUS",
    effectiveFrom: AT,
  }),
  AT,
);

const evidence = [
  createEvidence({
    id: "ev-1",
    kind: "gate_a",
    subject: { type: "entity", id: "target-1", domain: "consumer-domain" },
    observationRefs: ["obs-1"],
    value: "PASS",
    evaluatorActorId: "evaluator-1",
    createdAt: AT,
    provenance,
  }),
];

const proposal = createDecisionProposal({
  id: "prop-1",
  actorId: actor.id,
  action: "EXECUTE",
  subject: { type: "entity", id: "target-1", domain: "consumer-domain" },
  policyId: "policy-1",
  policyVersion: "1.0.0",
  domain: "consumer-domain",
  decisionType: "CONSUMER",
  evidenceRefs: ["ev-1"],
  createdAt: AT,
  provenance,
});

const adapter = {
  domain: "consumer-domain",
  observationProvider: {
    domain: "consumer-domain",
    fetchObservations: () => [],
  },
  policyProvider: {
    domain: "consumer-domain",
    resolvePolicyVersion: () => policyVersion,
  },
  evidenceProvider: {
    domain: "consumer-domain",
    collectEvidence: () => evidence,
  },
  actionExecutor: {
    domain: "consumer-domain",
    execute: async () => ({ status: "EXECUTED", resultRef: "result-1" }),
  },
  outcomeEvaluator: {
    domain: "consumer-domain",
    evaluate: () => ({ verdict: "CORRECT", rationale: "ok" }),
  },
};

const kernel = new GovernorKernel({
  ledger: new InMemoryGovernanceLedger(),
  runStore: new InMemoryGovernanceRunStore(),
  claimStore: new InMemoryExecutionClaimStore(),
});

const result = await kernel.run({
  idempotencyKey: "idem-1",
  ids: {
    runId: "run-1",
    decisionId: "run-1:decision",
    explanationId: "run-1:explanation",
    actionRequestId: "run-1:action-request",
    authorizationId: "run-1:authorization",
    actionResultId: "run-1:action-result",
    outcomeId: "run-1:outcome",
    evaluationId: "run-1:evaluation",
  },
  actor,
  executorActorId: "executor-1",
  authority,
  grant,
  proposal,
  policyVersion,
  evidence,
  rollbackPlan: null,
  resource,
  adapter,
  at: AT,
  provenance,
});

console.log(JSON.stringify({
  ok: result.ok,
  state: result.state,
  corpus: typeof EvaluationCorpus === "function",
  sqlite: typeof openNodeSqliteGovernanceStorage === "function",
  corpusCandidate: (() => {
    const corpus = new EvaluationCorpus({
      store: new InMemoryEvaluationCorpusStore(),
      at: AT,
      provenance,
    });
    const candidate = createEvaluationCaseCandidate({
      id: "cc-1",
      candidateId: "cc-1",
      domain: "consumer-domain",
      title: "Consumer corpus case",
      provenance: { sourceKind: "MANUAL_REFERENCE" },
      inputContextRefs: [],
      evidenceRefs: [],
      createdAt: AT,
      provenanceEnvelope: provenance,
    });
    corpus.addCandidate(candidate);
    return corpus.getCandidate("cc-1")?.candidateId === "cc-1";
  })(),
  componentRegistry: typeof GovernedComponentRegistry === "function",
  componentWorkflow: (() => {
    const store = new InMemoryGovernedComponentRegistryStore();
    const registry = new GovernedComponentRegistry({ store, at: AT, provenance });
    const agent = createAgentIdentity({
      id: "agent-1:1.0.0",
      componentId: "agent-1",
      version: "1.0.0",
      createdAt: AT,
      provenance,
      status: "ACTIVE",
    });
    registry.registerComponent({ component: agent });
    registry.declareCapability({
      declaration: createCapabilityDeclaration({
        id: "cap-1",
        declarationId: "cap-1",
        componentId: agent.componentId,
        componentVersion: agent.version,
        capabilityId: "generic:reason",
        createdAt: AT,
        provenance,
      }),
    });
    registry.defineResponsibility(createResponsibility({
      id: "resp-1",
      responsibilityId: "resp-1",
      requiredCapabilities: ["generic:reason"],
      effectiveFrom: AT,
      createdAt: AT,
      provenance,
    }));
    registry.recordQualification({
      record: createQualificationRecord({
        id: "qual-1",
        qualificationId: "qual-1",
        componentId: agent.componentId,
        componentVersion: agent.version,
        status: "QUALIFIED",
        evidenceRefs: ["ev-qual"],
        validFrom: AT,
        createdAt: AT,
        provenance,
      }),
    });
    const elig = registry.evaluateEligibility({
      eligibilityId: "elig-1",
      componentId: agent.componentId,
      componentVersion: agent.version,
      responsibilityId: "resp-1",
    });
    return elig.outcome === "ELIGIBLE" && typeof evaluateResponsibilityEligibility === "function";
  })(),
}));
`,
    );

    return execSync("node consume.mjs", {
      cwd: consumerDir,
      encoding: "utf8",
    }).trim();
  } finally {
    rmSync(consumerDir, { recursive: true, force: true });
  }
}

describe("consumer package (packed artifact)", () => {
  it("resolves public imports from npm pack tarball and runs a minimal governed decision", { timeout: 60000 }, () => {
    const { tarballPath } = buildTarball();
    try {
      const output = installAndRunConsumer(tarballPath);
      expect(JSON.parse(output)).toEqual({
        ok: true,
        state: "KEEP",
        corpus: true,
        sqlite: true,
        corpusCandidate: true,
        componentRegistry: true,
        componentWorkflow: true,
      });
    } finally {
      rmSync(tarballPath, { force: true });
    }
  });

  it("ships only intentional release files", () => {
    const { tarballPath, tarballContents } = buildTarball();
    try {
      const entries = tarballContents.split("\n").filter(Boolean);

      expect(entries.some((e) => e.includes("dist/index.js"))).toBe(true);
      expect(entries.some((e) => e.includes("dist/index.d.ts"))).toBe(true);
      expect(entries.some((e) => e.includes("README.md"))).toBe(true);
      expect(entries.some((e) => e.includes("LICENSE"))).toBe(true);
      expect(entries.some((e) => e.includes("CHANGELOG.md"))).toBe(true);

      expect(entries.some((e) => e.includes("/tests/"))).toBe(false);
      expect(entries.some((e) => e.includes(".env"))).toBe(false);
      expect(entries.some((e) => e.includes(".cursor"))).toBe(false);
      expect(entries.some((e) => e.includes("node_modules"))).toBe(false);
    } finally {
      rmSync(tarballPath, { force: true });
    }
  });

  it("contains no embedded secrets in published metadata", () => {
    const { tarballPath, tarballContents } = buildTarball();
    try {
      const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
      const serialized = JSON.stringify(pkg);
      expect(serialized).not.toMatch(/api[_-]?key|secret|token|password|Bearer /i);
      expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
      expect(tarballContents).not.toMatch(/C:\\\\Users\\\\Admin/i);
    } finally {
      rmSync(tarballPath, { force: true });
    }
  });
});
