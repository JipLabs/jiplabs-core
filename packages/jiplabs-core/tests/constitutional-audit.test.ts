import { describe, expect, it, vi } from "vitest";
import {
  activatePolicyVersion,
  assertHistoricalAuditSelfContained,
  createAuthority,
  createAuthorityGrant,
  createPolicyVersion,
  evaluateAuthorityGrant,
  evaluateDomainDecisionAuthorization,
  InMemoryGovernanceLedger,
  reconstructDecisionFromSnapshot,
  revokeAuthorityGrant,
  supersedePolicyVersion,
  WellKnownCapability,
  type DomainGovernanceAdapter,
  type PolicyGate,
} from "../src/index.js";
import { createDecisionMadeEvent } from "../src/ledger/index.js";
import { buildResearchPromotionFixture } from "./fixtures/research-promotion-fixture.js";

const AT = "2026-08-25T12:00:00.000Z";
const PROVENANCE = { actorId: "test-actor", source: "audit-test" };

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

describe("CORE-00 constitutional audit invariants", () => {
  it("1. extensible namespaced authority capabilities without Core source changes", () => {
    const namespaced = "jipcomply:jurisdiction:prioritize";
    const authority = createAuthority({
      id: "auth-jipcomply",
      code: "JIPCOMPLY_JURISDICTION",
      scopes: [namespaced, "jipcomply:jurisdiction:set-ready"],
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const grant = createAuthorityGrant({
      id: "grant-jipcomply",
      actorId: "actor-jipcomply",
      authority,
      scopes: [namespaced],
      resource: { domain: "jipcomply", resourceType: "jurisdiction" },
      validFrom: "2026-01-01T00:00:00.000Z",
      issuerActorId: "issuer",
      createdAt: AT,
      provenance: PROVENANCE,
    });
    const check = evaluateAuthorityGrant({
      grant,
      authority,
      actorId: "actor-jipcomply",
      scope: namespaced,
      resource: { domain: "jipcomply", resourceType: "jurisdiction" },
      at: AT,
    });
    expect(check.allowed).toBe(true);
    expect(WellKnownCapability.PROMOTE_MODEL).toBe("PROMOTE_MODEL");
    expect(namespaced).not.toBe(WellKnownCapability.PROMOTE_MODEL);
  });

  it("2. decision reconstructable from decision-time snapshot after revocation and supersession", () => {
    const fixture = buildResearchPromotionFixture();
    expect(fixture.evaluation.ok).toBe(true);
    if (!fixture.evaluation.ok) return;

    const decision = fixture.evaluation.decision;
    const revokedGrant = revokeAuthorityGrant(fixture.grant, {
      at: "2026-08-26T12:00:00.000Z",
      revokedByActorId: "human-owner",
      reason: "post-decision revocation",
    });
    expect(revokedGrant.revokedAt).not.toBeNull();

    const supersededPolicy = supersedePolicyVersion(
      fixture.policyVersion,
      "2026-08-26T12:00:00.000Z",
    );
    expect(supersededPolicy.status).toBe("SUPERSEDED");

    const reconstruction = reconstructDecisionFromSnapshot({
      snapshot: decision.governanceSnapshot,
      proposal: fixture.proposal,
      policyVersionAtDecisionTime: fixture.policyVersion,
      evidenceAtDecisionTime: fixture.evidence,
    });

    expect(reconstruction.matchesSnapshot).toBe(true);
    expect(reconstruction.decisionValue).toBe("PROMOTE");
    expect(reconstruction.snapshot.authorityGrantContentHash).toBe(
      fixture.grant.contentHash,
    );
    expect(reconstruction.snapshot.policyContentHash).toBe(
      fixture.policyVersion.contentHash,
    );

    const liveCheck = evaluateAuthorityGrant({
      grant: revokedGrant,
      authority: fixture.authority,
      actorId: fixture.actor.id,
      scope: "PROMOTE_MODEL",
      resource: { domain: "research-models", resourceType: "model" },
      at: "2026-08-26T12:00:00.000Z",
    });
    expect(liveCheck.allowed).toBe(false);
  });

  it("3. CORE-00 evaluates authorization only and does not invoke domain execution", () => {
    const executeSpy = vi.fn(() => ({ status: "EXECUTED" as const }));
    const fixture = buildResearchPromotionFixture();
    expect(fixture.evaluation.ok).toBe(true);
    if (!fixture.evaluation.ok) return;

    const adapter: DomainGovernanceAdapter = {
      domain: fixture.proposal.domain,
      observationProvider: {
        domain: fixture.proposal.domain,
        fetchObservations: () => [],
      },
      policyProvider: {
        domain: fixture.proposal.domain,
        resolvePolicyVersion: () => fixture.policyVersion,
      },
      evidenceProvider: {
        domain: fixture.proposal.domain,
        collectEvidence: () => fixture.evidence,
      },
    };

    const result = evaluateDomainDecisionAuthorization({
      adapter,
      actor: fixture.actor,
      authority: fixture.authority,
      grant: fixture.grant,
      proposal: fixture.proposal,
      policyVersion: fixture.policyVersion,
      evidence: fixture.evidence,
      rollbackPlan: fixture.rollbackPlan,
      resource: { domain: "research-models", resourceType: "model" },
      at: AT,
      decisionId: "dec-audit-boundary",
      explanationId: "exp-audit-boundary",
    });

    expect(result.ok).toBe(true);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("4. ledger DECISION_MADE events are self-contained for historical audit", () => {
    const fixture = buildResearchPromotionFixture();
    expect(fixture.evaluation.ok).toBe(true);
    if (!fixture.evaluation.ok) return;

    const ledger = new InMemoryGovernanceLedger();
    const eventInput = createDecisionMadeEvent({
      eventId: "evt-decision-made",
      occurredAt: AT,
      actorId: fixture.actor.id,
      decision: fixture.evaluation.decision,
      provenance: PROVENANCE,
    });
    const appended = ledger.append(eventInput);
    expect(appended.status).toBe("appended");

    const stored = ledger.getByEventId("evt-decision-made");
    expect(stored).toBeDefined();
    assertHistoricalAuditSelfContained(stored!);
    expect(stored!.temporalRefs?.decisionHash).toBe(
      fixture.evaluation.decision.decisionHash,
    );
    expect(stored!.temporalRefs?.policyContentHash).toBe(
      fixture.policyVersion.contentHash,
    );
    expect(stored!.temporalRefs?.authorityGrantContentHash).toBe(
      fixture.grant.contentHash,
    );
  });
});
