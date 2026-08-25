/**
 * Contract-only fixture demonstrating generic governed promotion capability.
 * Lives under tests/fixtures — not a production dependency.
 */
import {
  activatePolicyVersion,
  createActor,
  createAuthority,
  createAuthorityGrant,
  createDecisionProposal,
  createEvidence,
  createPolicyVersion,
  createRollbackPlan,
  evaluateDecisionProposal,
  type IsoTimestamp,
  type PolicyGate,
} from "../../src/index.js";

const FIXTURE_DOMAIN = "research-models";
const FIXTURE_AT: IsoTimestamp = "2026-08-25T12:00:00.000Z";

function gate(
  id: string,
  code: string,
  evidenceKind: string,
): PolicyGate {
  return {
    id,
    code,
    operator: "EQ",
    expected: "PASS",
    mandatory: true,
    evidenceKind,
  };
}

export function buildResearchPromotionFixture() {
  const actor = createActor({
    id: "actor-champion-governor",
    type: "DOMAIN_GOVERNOR",
    code: "champion-governor",
    scopes: ["model-governance"],
    createdAt: FIXTURE_AT,
    provenance: {
      actorId: "system-bootstrap",
      source: "fixture",
    },
    displayName: "Champion Governor",
  });

  const authority = createAuthority({
    id: "auth-model-governance",
    code: "MODEL_GOVERNANCE",
    scopes: ["PROMOTE_MODEL", "MODEL_GOVERNANCE"],
    createdAt: FIXTURE_AT,
    provenance: {
      actorId: "system-bootstrap",
      source: "fixture",
    },
  });

  const grant = createAuthorityGrant({
    id: "grant-champion-governor-promote",
    actorId: actor.id,
    authority,
    scopes: ["PROMOTE_MODEL"],
    resource: {
      domain: FIXTURE_DOMAIN,
      resourceType: "model",
    },
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: null,
    issuerActorId: "human-owner",
    createdAt: FIXTURE_AT,
    provenance: {
      actorId: "human-owner",
      source: "fixture",
    },
  });

  const policyVersion = activatePolicyVersion(
    createPolicyVersion({
      id: "policy-version-research-promotion-v1",
      policyId: "research-champion-promotion-v1",
      version: "1.0.0",
      domain: FIXTURE_DOMAIN,
      decisionType: "MODEL_PROMOTION",
      createdAt: FIXTURE_AT,
      provenance: {
        actorId: "human-owner",
        source: "fixture",
        policyVersion: "1.0.0",
      },
      applicableActorAuthority: ["champion-governor"],
      requiredAuthorityScope: "PROMOTE_MODEL",
      requiredEvidence: [
        "scientific_integrity",
        "fresh_holdout",
        "bootstrap",
        "temporal_stability",
        "leakage",
      ],
      gates: [
        gate("g-scientific-integrity", "scientific_integrity", "scientific_integrity"),
        gate("g-fresh-holdout", "fresh_holdout", "fresh_holdout"),
        gate("g-bootstrap", "bootstrap", "bootstrap"),
        gate("g-temporal-stability", "temporal_stability", "temporal_stability"),
        gate("g-leakage", "leakage", "leakage"),
      ],
      decisionOutcomes: { onPass: "PROMOTE", onFail: "KEEP" },
      failureBehavior: "KEEP",
      rollbackRequirements: { required: true },
      overrideRules: {
        humanOverrideAvailable: true,
        requiredAuthorityScope: "OVERRIDE_DECISION",
      },
      autonomyMode: "AUTONOMOUS_WITH_ROLLBACK",
      effectiveFrom: FIXTURE_AT,
    }),
    FIXTURE_AT,
  );

  const evidenceKinds = [
    "scientific_integrity",
    "fresh_holdout",
    "bootstrap",
    "temporal_stability",
    "leakage",
  ] as const;

  const evidence = evidenceKinds.map((kind, index) =>
    createEvidence({
      id: `evidence-${kind}`,
      kind,
      subject: { type: "model", id: "candidate-X", domain: FIXTURE_DOMAIN },
      observationRefs: [`obs-${index}`],
      value: "PASS",
      evaluatorActorId: "evaluator-1",
      createdAt: FIXTURE_AT,
      provenance: { actorId: "evaluator-1", source: "fixture" },
    }),
  );

  const rollbackPlan = createRollbackPlan({
    id: "rollback-previous-champion",
    rollbackTarget: {
      type: "model",
      id: "previous-champion",
      domain: FIXTURE_DOMAIN,
    },
    preconditions: ["previous champion state captured"],
    rollbackAction: "RESTORE_PREVIOUS_CHAMPION",
    verification: { kind: "metric", expected: "baseline_restored" },
    maximumRollbackWindow: "2026-09-25T12:00:00.000Z",
    createdAt: FIXTURE_AT,
    provenance: { actorId: actor.id, source: "fixture" },
  });

  const proposal = createDecisionProposal({
    id: "proposal-promote-candidate-x",
    actorId: actor.id,
    action: "PROMOTE",
    subject: { type: "model", id: "candidate-X", domain: FIXTURE_DOMAIN },
    policyId: policyVersion.policyId,
    policyVersion: policyVersion.version,
    domain: FIXTURE_DOMAIN,
    decisionType: "MODEL_PROMOTION",
    evidenceRefs: evidence.map((e) => e.id),
    createdAt: FIXTURE_AT,
    provenance: { actorId: actor.id, source: "fixture" },
    rationale: "All scientific gates passed",
  });

  const evaluation = evaluateDecisionProposal({
    proposal,
    actor,
    authority,
    grant,
    policyVersion,
    evidence,
    rollbackPlan,
    at: FIXTURE_AT,
    resource: { domain: FIXTURE_DOMAIN, resourceType: "model" },
    decisionId: "decision-promote-candidate-x",
    explanationId: "explanation-promote-candidate-x",
  });

  return {
    actor,
    authority,
    grant,
    policyVersion,
    evidence,
    rollbackPlan,
    proposal,
    evaluation,
  };
}

export function runResearchPromotionFixture() {
  const fixture = buildResearchPromotionFixture();
  if (!fixture.evaluation.ok) {
    return {
      authorized: false as const,
      reason: fixture.evaluation.message,
    };
  }
  const decision = fixture.evaluation.decision;
  return {
    authorized: true as const,
    actor: fixture.actor.code,
    authority: fixture.authority.code,
    decision: decision.decisionValue,
    humanApprovalRequired: decision.humanApprovalRequired,
    humanOverrideAvailable: decision.humanOverrideAvailable,
    rollbackRequired: decision.rollbackRequired,
    policy: `${decision.policyRef}@${decision.policyVersion}`,
  };
}
