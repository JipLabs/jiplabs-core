import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import { sha256Canonical } from "../hash.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeValue,
  Provenance,
} from "../schema.js";
import type { CapabilityId } from "../authority/capabilities.js";

export type PolicyStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "REVOKED";

export type GateOperator = "EQ" | "NEQ" | "GTE" | "LTE" | "EXISTS" | "TRUTH";

export type GateVerdict = "PASS" | "FAIL" | "MISSING";

export type AutonomyMode =
  | "AUTONOMOUS"
  | "AUTONOMOUS_WITH_ROLLBACK"
  | "AUTONOMOUS_CANARY"
  | "HUMAN_APPROVAL_REQUIRED"
  | "BLOCKED";

export type FailureBehavior = "BLOCK" | "KEEP" | "REJECT" | "SHADOW";

export type PolicyGate = {
  readonly id: string;
  readonly code: string;
  readonly operator: GateOperator;
  readonly expected: JsonSafeValue;
  readonly mandatory: boolean;
  readonly evidenceKind: string;
};

export type GateResult = {
  readonly gateId: string;
  readonly code: string;
  readonly verdict: GateVerdict;
  readonly actual: JsonSafeValue | null;
  readonly expected: JsonSafeValue;
  readonly mandatory: boolean;
};

export type DecisionOutcomes = {
  readonly onPass: string;
  readonly onFail: string;
  readonly onPartial?: string;
};

export type RollbackRequirements = {
  readonly required: boolean;
  readonly maximumWindow?: string;
};

export type OverrideRules = {
  readonly humanOverrideAvailable: boolean;
  readonly requiredAuthorityScope: CapabilityId;
};

export type Policy = EntityEnvelope & {
  readonly policyId: string;
  readonly domain: string;
  readonly decisionType: string;
};

export type PolicySupersession = {
  readonly policyId: string;
  readonly version: string;
};

export type PolicyVersion = EntityEnvelope & {
  readonly policyId: string;
  readonly version: string;
  readonly domain: string;
  readonly decisionType: string;
  readonly status: PolicyStatus;
  readonly applicableActorAuthority: readonly string[];
  readonly requiredAuthorityScope: CapabilityId;
  readonly requiredEvidence: readonly string[];
  readonly gates: readonly PolicyGate[];
  readonly decisionOutcomes: DecisionOutcomes;
  readonly failureBehavior: FailureBehavior;
  readonly rollbackRequirements: RollbackRequirements;
  readonly overrideRules: OverrideRules;
  readonly autonomyMode: AutonomyMode;
  readonly effectiveFrom: IsoTimestamp;
  readonly supersedes?: PolicySupersession;
  readonly activatedAt: IsoTimestamp | null;
  readonly immutable: boolean;
  readonly contentHash: string;
};

export function policyContentPayload(input: {
  readonly policyId: string;
  readonly version: string;
  readonly domain: string;
  readonly decisionType: string;
  readonly applicableActorAuthority: readonly string[];
  readonly requiredAuthorityScope: CapabilityId;
  readonly requiredEvidence: readonly string[];
  readonly gates: readonly PolicyGate[];
  readonly decisionOutcomes: DecisionOutcomes;
  readonly failureBehavior: FailureBehavior;
  readonly rollbackRequirements: RollbackRequirements;
  readonly overrideRules: OverrideRules;
  readonly autonomyMode: AutonomyMode;
  readonly effectiveFrom: IsoTimestamp;
  readonly supersedes?: PolicySupersession;
}): unknown {
  return {
    policyId: input.policyId,
    version: input.version,
    domain: input.domain,
    decisionType: input.decisionType,
    applicableActorAuthority: [...input.applicableActorAuthority].sort(),
    requiredAuthorityScope: input.requiredAuthorityScope,
    requiredEvidence: [...input.requiredEvidence].sort(),
    gates: input.gates,
    decisionOutcomes: input.decisionOutcomes,
    failureBehavior: input.failureBehavior,
    rollbackRequirements: input.rollbackRequirements,
    overrideRules: input.overrideRules,
    autonomyMode: input.autonomyMode,
    effectiveFrom: input.effectiveFrom,
    supersedes: input.supersedes ?? null,
  };
}

export function createPolicy(input: {
  readonly id: string;
  readonly policyId: string;
  readonly domain: string;
  readonly decisionType: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): Policy {
  return freezeDeep({
    ...envelope(input),
    policyId: requireNonEmpty(input.policyId, "policyId"),
    domain: requireNonEmpty(input.domain, "domain"),
    decisionType: requireNonEmpty(input.decisionType, "decisionType"),
  });
}

export function createPolicyVersion(input: {
  readonly id: string;
  readonly policyId: string;
  readonly version: string;
  readonly domain: string;
  readonly decisionType: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly applicableActorAuthority: readonly string[];
  readonly requiredAuthorityScope: CapabilityId;
  readonly requiredEvidence: readonly string[];
  readonly gates: readonly PolicyGate[];
  readonly decisionOutcomes: DecisionOutcomes;
  readonly failureBehavior: FailureBehavior;
  readonly rollbackRequirements: RollbackRequirements;
  readonly overrideRules: OverrideRules;
  readonly autonomyMode: AutonomyMode;
  readonly effectiveFrom: IsoTimestamp;
  readonly supersedes?: PolicySupersession;
  readonly status?: PolicyStatus;
}): PolicyVersion {
  const body = {
    policyId: requireNonEmpty(input.policyId, "policyId"),
    version: requireNonEmpty(input.version, "version"),
    domain: requireNonEmpty(input.domain, "domain"),
    decisionType: requireNonEmpty(input.decisionType, "decisionType"),
    status: input.status ?? "DRAFT",
    applicableActorAuthority: Object.freeze([
      ...input.applicableActorAuthority,
    ]),
    requiredAuthorityScope: input.requiredAuthorityScope,
    requiredEvidence: Object.freeze([...input.requiredEvidence]),
    gates: freezeDeep([...input.gates]),
    decisionOutcomes: freezeDeep({ ...input.decisionOutcomes }),
    failureBehavior: input.failureBehavior,
    rollbackRequirements: freezeDeep({ ...input.rollbackRequirements }),
    overrideRules: freezeDeep({ ...input.overrideRules }),
    autonomyMode: input.autonomyMode,
    effectiveFrom: requireIsoTimestamp(input.effectiveFrom, "effectiveFrom"),
    ...(input.supersedes ? { supersedes: freezeDeep({ ...input.supersedes }) } : {}),
    activatedAt: null as IsoTimestamp | null,
    immutable: false,
  };
  return freezeDeep({
    ...envelope({
      ...input,
      provenance: {
        ...input.provenance,
        policyVersion: input.version,
      },
    }),
    ...body,
    contentHash: sha256Canonical(policyContentPayload(body)),
  });
}

export function activatePolicyVersion(
  policyVersion: PolicyVersion,
  at: IsoTimestamp,
  recordedAt?: IsoTimestamp,
): PolicyVersion {
  if (policyVersion.immutable || policyVersion.status === "ACTIVE") {
    const expected = sha256Canonical(policyContentPayload(policyVersion));
    if (expected !== policyVersion.contentHash) {
      throw new GovernanceError(
        GovernanceErrorCode.POLICY_IMMUTABLE,
        `policy ${policyVersion.policyId}@${policyVersion.version} content hash mismatch`,
      );
    }
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_IMMUTABLE,
      `policy ${policyVersion.policyId}@${policyVersion.version} is immutable once activated`,
    );
  }
  if (policyVersion.status !== "DRAFT") {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_IMMUTABLE,
      `policy ${policyVersion.policyId}@${policyVersion.version} cannot be activated from ${policyVersion.status}`,
    );
  }
  const contentHash = sha256Canonical(policyContentPayload(policyVersion));
  return freezeDeep({
    ...policyVersion,
    recordedAt: requireIsoTimestamp(recordedAt ?? at, "recordedAt"),
    status: "ACTIVE" as const,
    activatedAt: requireIsoTimestamp(at, "at"),
    immutable: true,
    contentHash,
  });
}

export function supersedePolicyVersion(
  policyVersion: PolicyVersion,
  at: IsoTimestamp,
  recordedAt?: IsoTimestamp,
): PolicyVersion {
  if (policyVersion.status !== "ACTIVE") {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      `only ACTIVE policies can be superseded`,
    );
  }
  return freezeDeep({
    ...policyVersion,
    recordedAt: requireIsoTimestamp(recordedAt ?? at, "recordedAt"),
    status: "SUPERSEDED" as const,
  });
}

export function revisePolicyVersion(
  policyVersion: PolicyVersion,
  patch: Partial<
    Pick<
      PolicyVersion,
      | "gates"
      | "decisionOutcomes"
      | "failureBehavior"
      | "rollbackRequirements"
      | "overrideRules"
      | "autonomyMode"
      | "requiredEvidence"
      | "applicableActorAuthority"
    >
  >,
): PolicyVersion {
  if (policyVersion.immutable || policyVersion.status === "ACTIVE") {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_IMMUTABLE,
      `policy ${policyVersion.policyId}@${policyVersion.version} cannot be revised after activation`,
    );
  }
  const next = {
    ...policyVersion,
    ...patch,
  };
  return freezeDeep({
    ...next,
    contentHash: sha256Canonical(policyContentPayload(next)),
    immutable: false,
  });
}

export function assertPolicyVersionImmutable(policyVersion: PolicyVersion): void {
  if (!policyVersion.immutable || policyVersion.status === "DRAFT") {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_NOT_ACTIVE,
      `policy ${policyVersion.policyId}@${policyVersion.version} is not an immutable active version`,
    );
  }
  const expected = sha256Canonical(policyContentPayload(policyVersion));
  if (expected !== policyVersion.contentHash) {
    throw new GovernanceError(
      GovernanceErrorCode.POLICY_IMMUTABLE,
      `policy ${policyVersion.policyId}@${policyVersion.version} was mutated after activation`,
    );
  }
}

function numeric(value: JsonSafeValue | null): number | null {
  return typeof value === "number" ? value : null;
}

export function evaluateGate(
  gate: PolicyGate,
  evidenceValue: JsonSafeValue | undefined,
): GateResult {
  if (evidenceValue === undefined) {
    return {
      gateId: gate.id,
      code: gate.code,
      verdict: "MISSING",
      actual: null,
      expected: gate.expected,
      mandatory: gate.mandatory,
    };
  }
  let pass = false;
  switch (gate.operator) {
    case "EQ":
      pass = evidenceValue === gate.expected;
      break;
    case "NEQ":
      pass = evidenceValue !== gate.expected;
      break;
    case "GTE": {
      const a = numeric(evidenceValue);
      const b = numeric(gate.expected);
      pass = a !== null && b !== null && a >= b;
      break;
    }
    case "LTE": {
      const a = numeric(evidenceValue);
      const b = numeric(gate.expected);
      pass = a !== null && b !== null && a <= b;
      break;
    }
    case "EXISTS":
      pass = evidenceValue !== null;
      break;
    case "TRUTH":
      pass = evidenceValue === true || evidenceValue === "PASS";
      break;
    default:
      pass = false;
  }
  return {
    gateId: gate.id,
    code: gate.code,
    verdict: pass ? "PASS" : "FAIL",
    actual: evidenceValue,
    expected: gate.expected,
    mandatory: gate.mandatory,
  };
}

export function evaluatePolicyGates(
  gates: readonly PolicyGate[],
  evidenceByKind: Readonly<Record<string, JsonSafeValue>>,
): readonly GateResult[] {
  return gates.map((gate) =>
    evaluateGate(gate, evidenceByKind[gate.evidenceKind]),
  );
}

export function mandatoryGatesPassed(results: readonly GateResult[]): boolean {
  return results.every((r) => !r.mandatory || r.verdict === "PASS");
}
