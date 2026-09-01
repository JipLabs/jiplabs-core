import { sha256Canonical } from "../hash.js";
import type { GovernanceEvent } from "../ledger/index.js";
import { buildDecisionTrace, type DecisionTrace, type TraceInput } from "../trace/index.js";
import type { IsoTimestamp, JsonSafeMetadata } from "../schema.js";
import { computeAuditStateFingerprint } from "./fingerprints.js";

/**
 * Normalized read-only view over existing Core governance artifacts.
 * Not a second governance model — an adapter for Auditor evaluation.
 */
export type AuditGovernedStateView = {
  readonly decisionIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly policyVersions: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly authorityRefs: readonly string[];
  readonly executionRefs: readonly string[];
  readonly outcomeIds: readonly string[];
  readonly evaluationIds: readonly string[];
  readonly rollbackRefs: readonly string[];
  readonly overrideIds: readonly string[];
  readonly ledgerEventIds: readonly string[];
  readonly traces: readonly DecisionTrace[];
  readonly evaluatedAt: IsoTimestamp;
  readonly stateFingerprint: string;
  readonly metadata?: JsonSafeMetadata;
};

export function buildAuditGovernedStateView(input: {
  readonly traces?: readonly DecisionTrace[];
  readonly trace?: DecisionTrace;
  readonly ledgerEvents?: readonly GovernanceEvent[];
  readonly evaluatedAt: IsoTimestamp;
  readonly metadata?: JsonSafeMetadata;
}): AuditGovernedStateView {
  const traces = Object.freeze([
    ...(input.traces ?? []),
    ...(input.trace ? [input.trace] : []),
  ]);

  const decisionIds = traces.map((t) => t.decisionId);
  const policyIds = traces.map((t) => t.policyId);
  const policyVersions = traces.map((t) => t.policyVersion);
  const evidenceIds = traces.flatMap((t) => t.evidenceIds);
  const authorityRefs = traces.map(
    (t) => t.links.find((l) => l.stage === "AUTHORITY_CHECK")?.refId ?? "",
  );
  const executionRefs = traces.flatMap((t) =>
    [t.actionId, t.authorizationId].filter((id): id is string => Boolean(id)),
  );
  const outcomeIds = traces.flatMap((t) => (t.outcomeId ? [t.outcomeId] : []));
  const evaluationIds = traces.flatMap((t) => (t.evaluationId ? [t.evaluationId] : []));
  const rollbackRefs = traces.flatMap((t) => (t.rollbackPlanId ? [t.rollbackPlanId] : []));
  const overrideIds = traces.flatMap((t) => [...t.overrideIds]);
  const ledgerEventIds = Object.freeze(
    (input.ledgerEvents ?? []).map((e) => e.eventId),
  );

  const partial: Omit<AuditGovernedStateView, "stateFingerprint"> = {
    decisionIds: Object.freeze([...decisionIds]),
    policyIds: Object.freeze([...policyIds]),
    policyVersions: Object.freeze([...policyVersions]),
    evidenceIds: Object.freeze([...evidenceIds]),
    authorityRefs: Object.freeze(authorityRefs.filter(Boolean)),
    executionRefs: Object.freeze([...executionRefs]),
    outcomeIds: Object.freeze([...outcomeIds]),
    evaluationIds: Object.freeze([...evaluationIds]),
    rollbackRefs: Object.freeze([...rollbackRefs]),
    overrideIds: Object.freeze([...overrideIds]),
    ledgerEventIds,
    traces,
    evaluatedAt: input.evaluatedAt,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  return {
    ...partial,
    stateFingerprint: computeAuditStateFingerprint(partial),
  };
}

export function buildAuditGovernedStateViewFromTraceInput(
  input: TraceInput & { readonly evaluatedAt?: IsoTimestamp },
): AuditGovernedStateView {
  const trace = buildDecisionTrace(input);
  return buildAuditGovernedStateView({
    trace,
    ledgerEvents: input.ledgerEvents,
    evaluatedAt: input.evaluatedAt ?? input.decision.decidedAt,
    metadata: input.provenance.source
      ? { source: input.provenance.source }
      : undefined,
  });
}

export function computeGovernedStateContentHash(view: AuditGovernedStateView): string {
  return sha256Canonical({
    stateFingerprint: view.stateFingerprint,
    decisionIds: view.decisionIds,
    evaluatedAt: view.evaluatedAt,
  });
}
