import type { IsoTimestamp, Provenance } from "../schema.js";
import { createComponentSelectionResult } from "./factories.js";
import { evaluateResponsibilityEligibility, type EligibilityEvaluationInput } from "./eligibility.js";
import type { GovernedComponentRegistryStore } from "./contracts.js";
import type {
  ComponentSelectionCandidate,
  ComponentSelectionPolicy,
  ComponentSelectionResult,
  Responsibility,
} from "./types.js";

export interface ComponentSelector {
  readonly selectorId: string;
  select(input: ComponentSelectionInput): ComponentSelectionResult;
}

export type ComponentSelectionInput = {
  readonly selectionId: string;
  readonly responsibility: Responsibility;
  readonly candidates: readonly ComponentSelectionCandidate[];
  readonly store: GovernedComponentRegistryStore;
  readonly selectionPolicy?: ComponentSelectionPolicy;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
  readonly eligibilityInputs?: Omit<EligibilityEvaluationInput, "eligibilityId" | "responsibility">[];
};

/**
 * Deterministic selection among eligible components.
 * Domain/policy may supply ranking metadata; Core does not call external providers.
 */
export function selectEligibleComponent(input: ComponentSelectionInput): ComponentSelectionResult | null {
  const eligible: Array<{ candidate: ComponentSelectionCandidate; score: number }> = [];

  for (const candidate of input.candidates) {
    const component = input.store.getComponent(candidate.componentId, candidate.componentVersion);
    if (!component) {
      continue;
    }
    const caps = input.store.listCapabilityDeclarations(candidate.componentId, candidate.componentVersion);
    const quals = input.store.listQualificationRecords(candidate.componentId, candidate.componentVersion);
    const eligibility = evaluateResponsibilityEligibility({
      eligibilityId: `${input.selectionId}:${candidate.componentId}`,
      component,
      responsibility: input.responsibility,
      capabilityDeclarations: caps,
      qualificationRecords: quals,
      at: input.at,
      provenance: input.provenance,
    });
    if (eligibility.outcome !== "ELIGIBLE" && eligibility.outcome !== "ELIGIBLE_WITH_RESTRICTIONS") {
      continue;
    }
    let score = 0;
    const policy = input.selectionPolicy;
    if (policy?.preferLowerCost && candidate.costMetadata !== undefined) {
      score -= candidate.costMetadata;
    }
    if (policy?.preferLowerLatency && candidate.latencyMetadata !== undefined) {
      score -= candidate.latencyMetadata;
    }
    if (policy?.preferHigherReliability && candidate.reliabilityScore !== undefined) {
      score += candidate.reliabilityScore;
    }
    if (policy?.preferHigherQualification) {
      const qual = quals.find((q) => q.status === "QUALIFIED" && !q.supersededBy);
      if (qual) score += 100;
    }
    eligible.push({ candidate, score });
  }

  if (eligible.length === 0) {
    return null;
  }

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.componentId.localeCompare(b.candidate.componentId);
  });

  const selected = eligible[0]!.candidate;
  return createComponentSelectionResult({
    id: input.selectionId,
    selectionId: input.selectionId,
    responsibilityId: input.responsibility.responsibilityId,
    selectedComponentId: selected.componentId,
    selectedComponentVersion: selected.componentVersion,
    selectionPolicyId: input.selectionPolicy?.policyId,
    rationale: `deterministic selection among ${eligible.length} eligible component(s)`,
    createdAt: input.at,
    provenance: input.provenance,
  });
}
