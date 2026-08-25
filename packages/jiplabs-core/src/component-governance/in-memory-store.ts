import { compareIso } from "../envelope.js";
import type { GovernedComponentRegistryStore } from "./contracts.js";
import type {
  CapabilityDeclaration,
  ComponentSelectionResult,
  ComponentStatusTransition,
  FallbackRelationship,
  GovernedComponent,
  QualificationRecord,
  ReplacementProposal,
  Responsibility,
  ResponsibilityAssignment,
  ResponsibilityEligibility,
} from "./types.js";

export class InMemoryGovernedComponentRegistryStore implements GovernedComponentRegistryStore {
  readonly #components = new Map<string, GovernedComponent>();
  readonly #capabilities = new Map<string, CapabilityDeclaration>();
  readonly #responsibilities = new Map<string, Responsibility>();
  readonly #qualifications = new Map<string, QualificationRecord>();
  readonly #eligibilities = new Map<string, ResponsibilityEligibility>();
  readonly #assignments = new Map<string, ResponsibilityAssignment>();
  readonly #selections = new Map<string, ComponentSelectionResult>();
  readonly #transitions = new Map<string, ComponentStatusTransition>();
  readonly #fallbacks = new Map<string, FallbackRelationship>();
  readonly #replacements = new Map<string, ReplacementProposal>();

  #componentKey(componentId: string, version: string): string {
    return `${componentId}:${version}`;
  }

  saveComponent(component: GovernedComponent): void {
    this.#components.set(this.#componentKey(component.componentId, component.version), component);
  }

  getComponent(componentId: string, version: string): GovernedComponent | undefined {
    return this.#components.get(this.#componentKey(componentId, version));
  }

  listComponents(filter?: { readonly componentId?: string }): readonly GovernedComponent[] {
    return [...this.#components.values()].filter(
      (c) => !filter?.componentId || c.componentId === filter.componentId,
    );
  }

  listComponentVersions(componentId: string): readonly GovernedComponent[] {
    return this.listComponents({ componentId });
  }

  saveCapabilityDeclaration(declaration: CapabilityDeclaration): void {
    this.#capabilities.set(declaration.declarationId, declaration);
  }

  getCapabilityDeclaration(declarationId: string): CapabilityDeclaration | undefined {
    return this.#capabilities.get(declarationId);
  }

  listCapabilityDeclarations(componentId: string, version?: string): readonly CapabilityDeclaration[] {
    return [...this.#capabilities.values()].filter(
      (d) => d.componentId === componentId && (!version || d.componentVersion === version),
    );
  }

  saveResponsibility(responsibility: Responsibility): void {
    this.#responsibilities.set(responsibility.responsibilityId, responsibility);
  }

  getResponsibility(responsibilityId: string): Responsibility | undefined {
    return this.#responsibilities.get(responsibilityId);
  }

  listResponsibilities(): readonly Responsibility[] {
    return [...this.#responsibilities.values()];
  }

  saveQualificationRecord(record: QualificationRecord): void {
    this.#qualifications.set(record.qualificationId, record);
  }

  getQualificationRecord(qualificationId: string): QualificationRecord | undefined {
    return this.#qualifications.get(qualificationId);
  }

  listQualificationRecords(componentId: string, version?: string): readonly QualificationRecord[] {
    return [...this.#qualifications.values()].filter(
      (q) => q.componentId === componentId && (!version || q.componentVersion === version),
    );
  }

  getCurrentQualification(input: {
    readonly componentId: string;
    readonly componentVersion: string;
    readonly responsibilityId?: string;
    readonly at: string;
  }): QualificationRecord | undefined {
    const records = this.listQualificationRecords(input.componentId, input.componentVersion)
      .filter((q) => {
        if (q.supersededBy) return false;
        if (input.responsibilityId && q.responsibilityId && q.responsibilityId !== input.responsibilityId) {
          return false;
        }
        if (compareIso(input.at, q.validFrom) < 0) return false;
        if (q.validUntil && compareIso(input.at, q.validUntil) > 0) return false;
        return true;
      })
      .sort((a, b) => compareIso(b.validFrom, a.validFrom));
    return records[0];
  }

  saveEligibility(eligibility: ResponsibilityEligibility): void {
    this.#eligibilities.set(eligibility.eligibilityId, eligibility);
  }

  getEligibility(eligibilityId: string): ResponsibilityEligibility | undefined {
    return this.#eligibilities.get(eligibilityId);
  }

  listEligibilities(filter?: {
    readonly componentId?: string;
    readonly responsibilityId?: string;
  }): readonly ResponsibilityEligibility[] {
    return [...this.#eligibilities.values()].filter((e) => {
      if (filter?.componentId && e.componentId !== filter.componentId) return false;
      if (filter?.responsibilityId && e.responsibilityId !== filter.responsibilityId) return false;
      return true;
    });
  }

  saveAssignment(assignment: ResponsibilityAssignment): void {
    this.#assignments.set(assignment.assignmentId, assignment);
  }

  getAssignment(assignmentId: string): ResponsibilityAssignment | undefined {
    return this.#assignments.get(assignmentId);
  }

  getActiveAssignment(input: {
    readonly componentId: string;
    readonly componentVersion: string;
    readonly responsibilityId: string;
    readonly at: string;
  }): ResponsibilityAssignment | undefined {
    return [...this.#assignments.values()].find(
      (a) =>
        a.componentId === input.componentId &&
        a.componentVersion === input.componentVersion &&
        a.responsibilityId === input.responsibilityId &&
        a.status === "ACTIVE" &&
        compareIso(input.at, a.validFrom) >= 0 &&
        (!a.validUntil || compareIso(input.at, a.validUntil) <= 0),
    );
  }

  listAssignments(filter?: {
    readonly componentId?: string;
    readonly responsibilityId?: string;
  }): readonly ResponsibilityAssignment[] {
    return [...this.#assignments.values()].filter((a) => {
      if (filter?.componentId && a.componentId !== filter.componentId) return false;
      if (filter?.responsibilityId && a.responsibilityId !== filter.responsibilityId) return false;
      return true;
    });
  }

  saveSelection(selection: ComponentSelectionResult): void {
    this.#selections.set(selection.selectionId, selection);
  }

  getSelection(selectionId: string): ComponentSelectionResult | undefined {
    return this.#selections.get(selectionId);
  }

  saveStatusTransition(transition: ComponentStatusTransition): void {
    this.#transitions.set(transition.transitionId, transition);
  }

  getStatusTransition(transitionId: string): ComponentStatusTransition | undefined {
    return this.#transitions.get(transitionId);
  }

  listStatusTransitions(componentId: string): readonly ComponentStatusTransition[] {
    return [...this.#transitions.values()].filter((t) => t.componentId === componentId);
  }

  saveFallbackRelationship(relationship: FallbackRelationship): void {
    this.#fallbacks.set(relationship.relationshipId, relationship);
  }

  getFallbackRelationship(relationshipId: string): FallbackRelationship | undefined {
    return this.#fallbacks.get(relationshipId);
  }

  listFallbackRelationships(primaryComponentId: string): readonly FallbackRelationship[] {
    return [...this.#fallbacks.values()].filter((r) => r.primaryComponentId === primaryComponentId);
  }

  saveReplacementProposal(proposal: ReplacementProposal): void {
    this.#replacements.set(proposal.proposalId, proposal);
  }

  getReplacementProposal(proposalId: string): ReplacementProposal | undefined {
    return this.#replacements.get(proposalId);
  }
}
