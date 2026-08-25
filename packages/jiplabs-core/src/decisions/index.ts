import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import type { AuthorityCheckResult } from "../authority/index.js";
import {
  evaluateAuthorityGrant,
  type Authority,
  type AuthorityGrant,
  type AuthorityScope,
} from "../authority/index.js";
import { evidenceByKind, type Evidence } from "../evidence/index.js";
import { sha256Canonical } from "../hash.js";
import {
  envelope,
  freezeDeep,
  requireNonEmpty,
  requireIsoTimestamp,
} from "../envelope.js";
import {
  evaluatePolicyGates,
  mandatoryGatesPassed,
  type GateResult,
  type PolicyVersion,
} from "../policies/index.js";
import { evaluateRollbackReadiness, type RollbackPlan } from "../rollback/index.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  Provenance,
  ResourceRef,
  SubjectRef,
} from "../schema.js";
import type { Actor } from "../actors/index.js";

export type DecisionStatus =
  | "PROPOSED"
  | "AUTHORIZED"
  | "BLOCKED"
  | "PENDING_HUMAN_APPROVAL"
  | "DECIDED"
  | "EXECUTED"
  | "EVALUATED"
  | "ROLLED_BACK"
  | "OVERRIDDEN";

export type DecisionProposal = EntityEnvelope & {
  readonly actorId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly domain: string;
  readonly decisionType: string;
  readonly evidenceRefs: readonly string[];
  readonly rationale?: string;
  readonly metadata?: JsonSafeMetadata;
};

export type Decision = EntityEnvelope & {
  readonly proposalId: string;
  readonly actorId: string;
  readonly authorityRef: string;
  readonly authorityCode: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly evidenceRefs: readonly string[];
  readonly gateResults: readonly GateResult[];
  readonly decisionValue: string;
  readonly status: DecisionStatus;
  readonly decidedAt: IsoTimestamp;
  readonly decisionHash: string;
  readonly humanApprovalRequired: boolean;
  readonly humanOverrideAvailable: boolean;
  readonly rollbackRequired: boolean;
  readonly rollbackPlanId?: string;
  readonly explanationRef: string;
  readonly autonomyMode: PolicyVersion["autonomyMode"];
  readonly metadata?: JsonSafeMetadata;
};

export type RejectedAlternative = {
  readonly action: string;
  readonly reason: string;
};

export type DecisionExplanation = EntityEnvelope & {
  readonly decisionId: string;
  readonly summary: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly gateResults: readonly GateResult[];
  readonly evidenceRefs: readonly string[];
  readonly rejectedAlternatives: readonly RejectedAlternative[];
  readonly knownLimitations: readonly string[];
  readonly rollbackPath?: string;
};

export type DecisionEvaluationResult =
  | {
      readonly ok: true;
      readonly decision: Decision;
      readonly explanation: DecisionExplanation;
      readonly authorityCheck: Extract<AuthorityCheckResult, { allowed: true }>;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly authorityCheck?: AuthorityCheckResult;
      readonly gateResults?: readonly GateResult[];
    };

function decisionHashPayload(input: {
  readonly proposalId: string;
  readonly actorId: string;
  readonly authorityRef: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly evidenceRefs: readonly string[];
  readonly gateResults: readonly GateResult[];
  readonly decisionValue: string;
  readonly decidedAt: IsoTimestamp;
}): unknown {
  return {
    proposalId: input.proposalId,
    actorId: input.actorId,
    authorityRef: input.authorityRef,
    policyRef: input.policyRef,
    policyVersion: input.policyVersion,
    evidenceRefs: [...input.evidenceRefs].sort(),
    gateResults: input.gateResults,
    decisionValue: input.decisionValue,
    decidedAt: input.decidedAt,
  };
}

export function createDecisionProposal(input: {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly domain: string;
  readonly decisionType: string;
  readonly evidenceRefs: readonly string[];
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly rationale?: string;
  readonly metadata?: JsonSafeMetadata;
}): DecisionProposal {
  return freezeDeep({
    ...envelope(input),
    actorId: requireNonEmpty(input.actorId, "actorId"),
    action: requireNonEmpty(input.action, "action"),
    subject: freezeDeep({ ...input.subject }),
    policyId: requireNonEmpty(input.policyId, "policyId"),
    policyVersion: requireNonEmpty(input.policyVersion, "policyVersion"),
    domain: requireNonEmpty(input.domain, "domain"),
    decisionType: requireNonEmpty(input.decisionType, "decisionType"),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    ...(input.rationale ? { rationale: input.rationale } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function createDecision(input: {
  readonly id: string;
  readonly proposalId: string;
  readonly actorId: string;
  readonly authorityRef: string;
  readonly authorityCode: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly evidenceRefs: readonly string[];
  readonly gateResults: readonly GateResult[];
  readonly decisionValue: string;
  readonly status: DecisionStatus;
  readonly decidedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly humanApprovalRequired: boolean;
  readonly humanOverrideAvailable: boolean;
  readonly rollbackRequired: boolean;
  readonly rollbackPlanId?: string;
  readonly explanationRef: string;
  readonly autonomyMode: PolicyVersion["autonomyMode"];
  readonly metadata?: JsonSafeMetadata;
}): Decision {
  const body = {
    proposalId: requireNonEmpty(input.proposalId, "proposalId"),
    actorId: requireNonEmpty(input.actorId, "actorId"),
    authorityRef: requireNonEmpty(input.authorityRef, "authorityRef"),
    authorityCode: requireNonEmpty(input.authorityCode, "authorityCode"),
    policyRef: requireNonEmpty(input.policyRef, "policyRef"),
    policyVersion: requireNonEmpty(input.policyVersion, "policyVersion"),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    gateResults: freezeDeep([...input.gateResults]),
    decisionValue: requireNonEmpty(input.decisionValue, "decisionValue"),
    status: input.status,
    decidedAt: requireIsoTimestamp(input.decidedAt, "decidedAt"),
    humanApprovalRequired: input.humanApprovalRequired,
    humanOverrideAvailable: input.humanOverrideAvailable,
    rollbackRequired: input.rollbackRequired,
    ...(input.rollbackPlanId ? { rollbackPlanId: input.rollbackPlanId } : {}),
    explanationRef: requireNonEmpty(input.explanationRef, "explanationRef"),
    autonomyMode: input.autonomyMode,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
  return freezeDeep({
    ...envelope(input),
    ...body,
    decisionHash: sha256Canonical(decisionHashPayload(body)),
  });
}

export function createDecisionExplanation(input: {
  readonly id: string;
  readonly decisionId: string;
  readonly summary: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly gateResults: readonly GateResult[];
  readonly evidenceRefs: readonly string[];
  readonly rejectedAlternatives?: readonly RejectedAlternative[];
  readonly knownLimitations?: readonly string[];
  readonly rollbackPath?: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
}): DecisionExplanation {
  return freezeDeep({
    ...envelope(input),
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    summary: requireNonEmpty(input.summary, "summary"),
    policyId: requireNonEmpty(input.policyId, "policyId"),
    policyVersion: requireNonEmpty(input.policyVersion, "policyVersion"),
    gateResults: freezeDeep([...input.gateResults]),
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    rejectedAlternatives: Object.freeze([
      ...(input.rejectedAlternatives ?? []),
    ]),
    knownLimitations: Object.freeze([...(input.knownLimitations ?? [])]),
    ...(input.rollbackPath ? { rollbackPath: input.rollbackPath } : {}),
  });
}

export function computeDecisionHash(input: {
  readonly proposalId: string;
  readonly actorId: string;
  readonly authorityRef: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly evidenceRefs: readonly string[];
  readonly gateResults: readonly GateResult[];
  readonly decisionValue: string;
  readonly decidedAt: IsoTimestamp;
}): string {
  return sha256Canonical(decisionHashPayload(input));
}

export function evaluateDecisionProposal(input: {
  readonly proposal: DecisionProposal;
  readonly actor: Actor;
  readonly authority: Authority;
  readonly grant: AuthorityGrant | null | undefined;
  readonly policyVersion: PolicyVersion;
  readonly evidence: readonly Evidence[];
  readonly rollbackPlan?: RollbackPlan | null;
  readonly at: IsoTimestamp;
  readonly resource: ResourceRef;
  readonly parentGrant?: AuthorityGrant | null;
  readonly decisionId: string;
  readonly explanationId: string;
}): DecisionEvaluationResult {
  if (input.policyVersion.status !== "ACTIVE" || !input.policyVersion.immutable) {
    return {
      ok: false,
      code: GovernanceErrorCode.POLICY_NOT_ACTIVE,
      message: `policy ${input.policyVersion.policyId}@${input.policyVersion.version} is not active`,
    };
  }
  if (
    input.proposal.policyId !== input.policyVersion.policyId ||
    input.proposal.policyVersion !== input.policyVersion.version
  ) {
    return {
      ok: false,
      code: GovernanceErrorCode.INVALID_VALUE,
      message: "proposal policy reference does not match active policy version",
    };
  }

  const authorityCheck = evaluateAuthorityGrant({
    grant: input.grant,
    authority: input.authority,
    actorId: input.actor.id,
    scope: input.policyVersion.requiredAuthorityScope as AuthorityScope,
    resource: input.resource,
    at: input.at,
    parentGrant: input.parentGrant,
  });
  if (!authorityCheck.allowed) {
    return {
      ok: false,
      code: authorityCheck.code,
      message: authorityCheck.message,
      authorityCheck,
    };
  }

  const gateResults = evaluatePolicyGates(
    input.policyVersion.gates,
    evidenceByKind(input.evidence),
  );
  const gatesOk = mandatoryGatesPassed(gateResults);
  const rollbackRequired =
    input.policyVersion.rollbackRequirements.required ||
    input.policyVersion.autonomyMode === "AUTONOMOUS_WITH_ROLLBACK";
  const rollbackReadiness = evaluateRollbackReadiness({
    required: rollbackRequired,
    plan: input.rollbackPlan,
    at: input.at,
  });

  if (rollbackRequired && !rollbackReadiness.ready) {
    return {
      ok: false,
      code: GovernanceErrorCode.ROLLBACK_PLAN_REQUIRED,
      message: rollbackReadiness.reason,
      gateResults,
    };
  }

  const humanApprovalRequired =
    input.policyVersion.autonomyMode === "HUMAN_APPROVAL_REQUIRED";
  const humanOverrideAvailable =
    input.policyVersion.overrideRules.humanOverrideAvailable;

  let decisionValue: string;
  let status: DecisionStatus;
  const rejectedAlternatives: RejectedAlternative[] = [];

  if (!gatesOk) {
    decisionValue = input.policyVersion.decisionOutcomes.onFail;
    status =
      input.policyVersion.failureBehavior === "BLOCK"
        ? "BLOCKED"
        : "DECIDED";
    rejectedAlternatives.push({
      action: input.proposal.action,
      reason: "mandatory gate failed",
    });
    if (input.policyVersion.failureBehavior === "BLOCK") {
      return {
        ok: false,
        code: GovernanceErrorCode.GATE_FAILED,
        message: "mandatory policy gate failed",
        gateResults,
      };
    }
  } else if (humanApprovalRequired) {
    decisionValue = input.proposal.action;
    status = "PENDING_HUMAN_APPROVAL";
  } else if (input.policyVersion.autonomyMode === "BLOCKED") {
    return {
      ok: false,
      code: GovernanceErrorCode.INVALID_VALUE,
      message: "policy autonomy mode is BLOCKED",
      gateResults,
    };
  } else {
    decisionValue = input.policyVersion.decisionOutcomes.onPass;
    status = "DECIDED";
  }

  const evidenceRefs = input.evidence.map((e) => e.id);
  const explanation = createDecisionExplanation({
    id: input.explanationId,
    decisionId: input.decisionId,
    summary: gatesOk
      ? `Decision ${decisionValue} authorized under ${input.policyVersion.policyId}@${input.policyVersion.version}`
      : `Decision blocked or downgraded under ${input.policyVersion.policyId}@${input.policyVersion.version}`,
    policyId: input.policyVersion.policyId,
    policyVersion: input.policyVersion.version,
    gateResults,
    evidenceRefs,
    rejectedAlternatives,
    knownLimitations: [],
    rollbackPath: rollbackReadiness.ready
      ? input.rollbackPlan?.rollbackAction
      : undefined,
    createdAt: input.at,
    provenance: input.proposal.provenance,
  });

  const decision = createDecision({
    id: input.decisionId,
    proposalId: input.proposal.id,
    actorId: input.actor.id,
    authorityRef: authorityCheck.grantId,
    authorityCode: authorityCheck.authorityCode,
    policyRef: input.policyVersion.policyId,
    policyVersion: input.policyVersion.version,
    evidenceRefs,
    gateResults,
    decisionValue,
    status,
    decidedAt: input.at,
    createdAt: input.at,
    provenance: input.proposal.provenance,
    humanApprovalRequired,
    humanOverrideAvailable,
    rollbackRequired,
    rollbackPlanId:
      rollbackReadiness.ready && input.rollbackPlan
        ? input.rollbackPlan.id
        : undefined,
    explanationRef: explanation.id,
    autonomyMode: input.policyVersion.autonomyMode,
  });

  return {
    ok: true,
    decision,
    explanation,
    authorityCheck,
  };
}

export function reconstructDecision(input: {
  readonly proposal: DecisionProposal;
  readonly policyVersion: PolicyVersion;
  readonly evidence: readonly Evidence[];
  readonly authorityRef: string;
  readonly authorityCode: string;
  readonly decidedAt: IsoTimestamp;
}): { readonly decisionValue: string; readonly gateResults: readonly GateResult[] } {
  const gateResults = evaluatePolicyGates(
    input.policyVersion.gates,
    evidenceByKind(input.evidence),
  );
  const gatesOk = mandatoryGatesPassed(gateResults);
  const decisionValue = gatesOk
    ? input.policyVersion.decisionOutcomes.onPass
    : input.policyVersion.decisionOutcomes.onFail;
  return { decisionValue, gateResults };
}
