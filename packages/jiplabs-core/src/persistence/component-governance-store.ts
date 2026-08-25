import { deserializeGovernanceRecord, serializeGovernanceRecord } from "./serialization.js";
import type { GovernedComponentRegistryStore } from "../component-governance/contracts.js";
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
} from "../component-governance/types.js";
import type { SqliteDatabase } from "./sqlite/storage.js";
import { compareIso } from "../envelope.js";

type EntityKind =
  | "component"
  | "capability"
  | "responsibility"
  | "qualification"
  | "eligibility"
  | "assignment"
  | "selection"
  | "transition"
  | "fallback"
  | "replacement";

function saveEntity(
  db: SqliteDatabase,
  kind: EntityKind,
  primaryKey: string,
  payload: unknown,
  secondaryKey = "",
  fingerprint?: string,
): void {
  db.prepare(
    `INSERT INTO component_governance_entities (kind, primary_key, secondary_key, fingerprint, record_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(kind, primary_key, secondary_key) DO UPDATE SET fingerprint = excluded.fingerprint, record_json = excluded.record_json`,
  ).run(kind, primaryKey, secondaryKey, fingerprint ?? null, serializeGovernanceRecord(payload));
}

function getEntity<T>(db: SqliteDatabase, kind: EntityKind, primaryKey: string, secondaryKey = ""): T | undefined {
  const row = db
    .prepare(
      "SELECT record_json FROM component_governance_entities WHERE kind = ? AND primary_key = ? AND secondary_key = ?",
    )
    .get(kind, primaryKey, secondaryKey) as { record_json: string } | undefined;
  if (!row) return undefined;
  return deserializeGovernanceRecord<T>(row.record_json);
}

function listEntities<T>(db: SqliteDatabase, kind: EntityKind): readonly T[] {
  const rows = db
    .prepare("SELECT record_json FROM component_governance_entities WHERE kind = ?")
    .all(kind) as Array<{ record_json: string }>;
  return rows.map((row) => deserializeGovernanceRecord<T>(row.record_json));
}

export class SqliteGovernedComponentRegistryStore implements GovernedComponentRegistryStore {
  readonly #db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.#db = db;
  }

  saveComponent(component: GovernedComponent): void {
    saveEntity(
      this.#db,
      "component",
      component.componentId,
      component,
      component.version,
      component.contentHash,
    );
  }

  getComponent(componentId: string, version: string): GovernedComponent | undefined {
    return getEntity(this.#db, "component", componentId, version);
  }

  listComponents(filter?: { readonly componentId?: string }): readonly GovernedComponent[] {
    return listEntities<GovernedComponent>(this.#db, "component").filter(
      (c) => !filter?.componentId || c.componentId === filter.componentId,
    );
  }

  listComponentVersions(componentId: string): readonly GovernedComponent[] {
    return this.listComponents({ componentId });
  }

  saveCapabilityDeclaration(declaration: CapabilityDeclaration): void {
    saveEntity(this.#db, "capability", declaration.declarationId, declaration, "", declaration.contentHash);
  }

  getCapabilityDeclaration(declarationId: string): CapabilityDeclaration | undefined {
    return getEntity(this.#db, "capability", declarationId);
  }

  listCapabilityDeclarations(componentId: string, version?: string): readonly CapabilityDeclaration[] {
    return listEntities<CapabilityDeclaration>(this.#db, "capability").filter(
      (d) => d.componentId === componentId && (!version || d.componentVersion === version),
    );
  }

  saveResponsibility(responsibility: Responsibility): void {
    saveEntity(this.#db, "responsibility", responsibility.responsibilityId, responsibility, "", responsibility.contentHash);
  }

  getResponsibility(responsibilityId: string): Responsibility | undefined {
    return getEntity(this.#db, "responsibility", responsibilityId);
  }

  listResponsibilities(): readonly Responsibility[] {
    return listEntities<Responsibility>(this.#db, "responsibility");
  }

  saveQualificationRecord(record: QualificationRecord): void {
    saveEntity(this.#db, "qualification", record.qualificationId, record, "", record.contentHash);
  }

  getQualificationRecord(qualificationId: string): QualificationRecord | undefined {
    return getEntity(this.#db, "qualification", qualificationId);
  }

  listQualificationRecords(componentId: string, version?: string): readonly QualificationRecord[] {
    return listEntities<QualificationRecord>(this.#db, "qualification").filter(
      (q) => q.componentId === componentId && (!version || q.componentVersion === version),
    );
  }

  getCurrentQualification(input: {
    readonly componentId: string;
    readonly componentVersion: string;
    readonly responsibilityId?: string;
    readonly at: string;
  }): QualificationRecord | undefined {
    return this.listQualificationRecords(input.componentId, input.componentVersion)
      .filter((q) => {
        if (q.supersededBy) return false;
        if (input.responsibilityId && q.responsibilityId && q.responsibilityId !== input.responsibilityId) {
          return false;
        }
        if (compareIso(input.at, q.validFrom) < 0) return false;
        if (q.validUntil && compareIso(input.at, q.validUntil) > 0) return false;
        return true;
      })
      .sort((a, b) => compareIso(b.validFrom, a.validFrom))[0];
  }

  saveEligibility(eligibility: ResponsibilityEligibility): void {
    saveEntity(this.#db, "eligibility", eligibility.eligibilityId, eligibility, "", eligibility.contentHash);
  }

  getEligibility(eligibilityId: string): ResponsibilityEligibility | undefined {
    return getEntity(this.#db, "eligibility", eligibilityId);
  }

  listEligibilities(filter?: {
    readonly componentId?: string;
    readonly responsibilityId?: string;
  }): readonly ResponsibilityEligibility[] {
    return listEntities<ResponsibilityEligibility>(this.#db, "eligibility").filter((e) => {
      if (filter?.componentId && e.componentId !== filter.componentId) return false;
      if (filter?.responsibilityId && e.responsibilityId !== filter.responsibilityId) return false;
      return true;
    });
  }

  saveAssignment(assignment: ResponsibilityAssignment): void {
    saveEntity(this.#db, "assignment", assignment.assignmentId, assignment, "", assignment.contentHash);
  }

  getAssignment(assignmentId: string): ResponsibilityAssignment | undefined {
    return getEntity(this.#db, "assignment", assignmentId);
  }

  getActiveAssignment(input: {
    readonly componentId: string;
    readonly componentVersion: string;
    readonly responsibilityId: string;
    readonly at: string;
  }): ResponsibilityAssignment | undefined {
    return this.listAssignments({
      componentId: input.componentId,
      responsibilityId: input.responsibilityId,
    }).find(
      (a) =>
        a.componentVersion === input.componentVersion &&
        a.status === "ACTIVE" &&
        compareIso(input.at, a.validFrom) >= 0 &&
        (!a.validUntil || compareIso(input.at, a.validUntil) <= 0),
    );
  }

  listAssignments(filter?: {
    readonly componentId?: string;
    readonly responsibilityId?: string;
  }): readonly ResponsibilityAssignment[] {
    return listEntities<ResponsibilityAssignment>(this.#db, "assignment").filter((a) => {
      if (filter?.componentId && a.componentId !== filter.componentId) return false;
      if (filter?.responsibilityId && a.responsibilityId !== filter.responsibilityId) return false;
      return true;
    });
  }

  saveSelection(selection: ComponentSelectionResult): void {
    saveEntity(this.#db, "selection", selection.selectionId, selection, "", selection.contentHash);
  }

  getSelection(selectionId: string): ComponentSelectionResult | undefined {
    return getEntity(this.#db, "selection", selectionId);
  }

  saveStatusTransition(transition: ComponentStatusTransition): void {
    saveEntity(this.#db, "transition", transition.transitionId, transition, "", transition.contentHash);
  }

  getStatusTransition(transitionId: string): ComponentStatusTransition | undefined {
    return getEntity(this.#db, "transition", transitionId);
  }

  listStatusTransitions(componentId: string): readonly ComponentStatusTransition[] {
    return listEntities<ComponentStatusTransition>(this.#db, "transition").filter(
      (t) => t.componentId === componentId,
    );
  }

  saveFallbackRelationship(relationship: FallbackRelationship): void {
    saveEntity(this.#db, "fallback", relationship.relationshipId, relationship, "", relationship.contentHash);
  }

  getFallbackRelationship(relationshipId: string): FallbackRelationship | undefined {
    return getEntity(this.#db, "fallback", relationshipId);
  }

  listFallbackRelationships(primaryComponentId: string): readonly FallbackRelationship[] {
    return listEntities<FallbackRelationship>(this.#db, "fallback").filter(
      (r) => r.primaryComponentId === primaryComponentId,
    );
  }

  saveReplacementProposal(proposal: ReplacementProposal): void {
    saveEntity(this.#db, "replacement", proposal.proposalId, proposal, "", proposal.contentHash);
  }

  getReplacementProposal(proposalId: string): ReplacementProposal | undefined {
    return getEntity(this.#db, "replacement", proposalId);
  }
}
