import { emitComponentGovernanceEvent } from "./ledger-events.js";
import type {
  AssignResponsibilityInput,
  ApproveAssignmentInput,
  DeclareCapabilityInput,
  EvaluateEligibilityInput,
  ExecuteDemotionInput,
  GovernedComponentRegistryDeps,
  ProposeDemotionInput,
  ProposeReplacementInput,
  RecordFallbackInput,
  RecordQualificationInput,
  RegisterComponentInput,
  SelectComponentInput,
  SuspendComponentInput,
} from "./contracts.js";
import {
  createComponentStatusTransition,
  createGovernedComponent,
  createQualificationRecord,
  createResponsibilityAssignment,
  supersedeQualificationRecord,
} from "./factories.js";
import {
  evaluateResponsibilityEligibility,
  isAssignmentEligible,
  validateValidatorIndependence,
} from "./eligibility.js";
import { selectEligibleComponent } from "./selection.js";
import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { evaluateAuthorityGrant } from "../authority/index.js";
import { freezeDeep } from "../envelope.js";
import type {
  GovernedComponent,
  QualificationRecord,
  ResponsibilityAssignment,
} from "./types.js";

export class GovernedComponentRegistry {
  readonly #deps: GovernedComponentRegistryDeps;

  constructor(deps: GovernedComponentRegistryDeps) {
    this.#deps = deps;
  }

  get store() {
    return this.#deps.store;
  }

  registerComponent(input: RegisterComponentInput): GovernedComponent {
    const existing = this.#deps.store.getComponent(input.component.componentId, input.component.version);
    if (existing && existing.contentHash !== input.component.contentHash) {
      throw new GovernanceError(
        GovernanceErrorCode.IDEMPOTENCY_CONFLICT,
        `component ${input.component.componentId}@${input.component.version} already registered with different content`,
      );
    }
    this.#deps.store.saveComponent(input.component);
    this.#emit("COMPONENT_REGISTERED", input.component.componentId, `component:${input.component.componentId}:${input.component.version}`, {
      componentType: input.component.componentType,
      version: input.component.version,
    });
    return input.component;
  }

  declareCapability(input: DeclareCapabilityInput): ReturnType<typeof import("./factories.js").createCapabilityDeclaration> {
    const component = this.#requireComponent(input.declaration.componentId, input.declaration.componentVersion);
    if (component.status === "SUSPENDED" || component.status === "DISQUALIFIED") {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "cannot declare capability on suspended/disqualified component");
    }
    this.#deps.store.saveCapabilityDeclaration(input.declaration);
    this.#emit("CAPABILITY_DECLARED", input.declaration.declarationId, `capability:${input.declaration.declarationId}`, {
      capabilityId: input.declaration.capabilityId,
    });
    return input.declaration;
  }

  defineResponsibility(responsibility: import("./types.js").Responsibility): import("./types.js").Responsibility {
    this.#deps.store.saveResponsibility(responsibility);
    return responsibility;
  }

  recordQualification(input: RecordQualificationInput): QualificationRecord {
    const component = this.#requireComponent(input.record.componentId, input.record.componentVersion);
    if (component.status === "DISQUALIFIED") {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "cannot qualify disqualified component");
    }
    const current = this.#deps.store.getCurrentQualification({
      componentId: input.record.componentId,
      componentVersion: input.record.componentVersion,
      responsibilityId: input.record.responsibilityId,
      at: this.#deps.at,
    });
    if (current && current.immutable && current.qualificationId !== input.record.qualificationId) {
      const superseded = supersedeQualificationRecord(current, input.record);
      this.#deps.store.saveQualificationRecord(superseded);
    }
    this.#deps.store.saveQualificationRecord(input.record);
    this.#emit("QUALIFICATION_RECORDED", input.record.qualificationId, `qualification:${input.record.qualificationId}`, {
      status: input.record.status,
    });
    return input.record;
  }

  evaluateEligibility(input: EvaluateEligibilityInput) {
    const component = this.#requireComponent(input.componentId, input.componentVersion);
    const responsibility = this.#requireResponsibility(input.responsibilityId);
    const caps = this.#deps.store.listCapabilityDeclarations(input.componentId, input.componentVersion);
    const quals = this.#deps.store.listQualificationRecords(input.componentId, input.componentVersion);

    const eligibility = evaluateResponsibilityEligibility({
      eligibilityId: input.eligibilityId,
      component,
      responsibility,
      capabilityDeclarations: caps,
      qualificationRecords: quals,
      at: this.#deps.at,
      provenance: this.#deps.provenance,
      corpusStore: this.#deps.corpusStore,
      requireHumanApproval: input.assignmentPolicy?.requireHumanApproval,
      authority: input.assignmentPolicy?.authority,
      grant: input.assignmentPolicy?.grant,
      actorId: input.actorId,
    });

    this.#deps.store.saveEligibility(eligibility);
    this.#emit("RESPONSIBILITY_ELIGIBILITY_EVALUATED", eligibility.eligibilityId, `eligibility:${eligibility.eligibilityId}`, {
      outcome: eligibility.outcome,
    });
    return eligibility;
  }

  assignResponsibility(input: AssignResponsibilityInput): ResponsibilityAssignment {
    const eligibility = this.#deps.store.getEligibility(input.eligibilityId);
    if (!eligibility) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, `unknown eligibility ${input.eligibilityId}`);
    }
    if (!isAssignmentEligible(eligibility.outcome) && eligibility.outcome !== "HUMAN_APPROVAL_REQUIRED") {
      throw new GovernanceError(
        GovernanceErrorCode.INVALID_VALUE,
        `component not eligible for assignment: ${eligibility.outcome}`,
      );
    }

    const policy = input.assignmentPolicy;
    if (policy?.requireHumanApproval || eligibility.outcome === "HUMAN_APPROVAL_REQUIRED") {
      if (!input.humanApproved) {
        const pending = createResponsibilityAssignment({
          id: input.assignmentId,
          assignmentId: input.assignmentId,
          componentId: input.componentId,
          componentVersion: input.componentVersion,
          responsibilityId: input.responsibilityId,
          eligibilityId: input.eligibilityId,
          mode: input.mode,
          role: input.role,
          authorityGrantId: policy?.grant?.id,
          policyVersionId: policy?.policyVersion?.id,
          evidenceRefs: input.evidenceRefs ?? [],
          assignedAt: this.#deps.at,
          validFrom: this.#deps.at,
          validUntil: input.validUntil,
          validatorComponentId: input.validatorComponentId,
          fallbackComponentId: input.fallbackComponentId,
          assignedByActorId: input.assignedByActorId,
          humanApproved: false,
          status: "PENDING",
          createdAt: this.#deps.at,
          provenance: this.#deps.provenance,
        });
        this.#deps.store.saveAssignment(pending);
        return pending;
      }
    }

    if (policy?.grant && policy.authority) {
      const check = evaluateAuthorityGrant({
        grant: policy.grant,
        authority: policy.authority,
        actorId: input.assignedByActorId,
        scope: "EXECUTE_ACTION",
        resource: policy.grant.resource,
        at: this.#deps.at,
      });
      if (!check.allowed) {
        throw new GovernanceError(GovernanceErrorCode.AUTHORITY_MISSING, "assignment authority denied");
      }
    }

    if (input.validatorComponentId && policy?.validatorIndependence) {
      const producer = this.#requireComponent(input.componentId, input.componentVersion);
      const validator = this.#requireComponent(
        input.validatorComponentId,
        this.#deps.store.listComponentVersions(input.validatorComponentId)[0]?.version ?? input.componentVersion,
      );
      const independence = validateValidatorIndependence({
        producer,
        validator,
        policy: policy.validatorIndependence,
      });
      if (!independence.valid) {
        throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, independence.reason ?? "validator independence violated");
      }
    }

    if (policy?.allowedModes && !policy.allowedModes.includes(input.mode)) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, `assignment mode ${input.mode} not permitted by policy`);
    }

    const assignment = createResponsibilityAssignment({
      id: input.assignmentId,
      assignmentId: input.assignmentId,
      componentId: input.componentId,
      componentVersion: input.componentVersion,
      responsibilityId: input.responsibilityId,
      eligibilityId: input.eligibilityId,
      mode: input.mode,
      role: input.role,
      authorityGrantId: policy?.grant?.id,
      policyVersionId: policy?.policyVersion?.id,
      evidenceRefs: input.evidenceRefs ?? [],
      assignedAt: this.#deps.at,
      validFrom: this.#deps.at,
      validUntil: input.validUntil,
      restrictions: eligibility.restrictions ? [...eligibility.restrictions] : undefined,
      validatorComponentId: input.validatorComponentId,
      fallbackComponentId: input.fallbackComponentId,
      assignedByActorId: input.assignedByActorId,
      humanApproved: input.humanApproved ?? !policy?.requireHumanApproval,
      status: "ACTIVE",
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });

    this.#deps.store.saveAssignment(assignment);
    this.#emit("RESPONSIBILITY_ASSIGNED", assignment.assignmentId, `assignment:${assignment.assignmentId}`, {
      mode: assignment.mode,
      role: assignment.role,
    });
    return assignment;
  }

  approveAssignment(input: ApproveAssignmentInput): ResponsibilityAssignment {
    const assignment = this.#deps.store.getAssignment(input.assignmentId);
    if (!assignment) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, `unknown assignment ${input.assignmentId}`);
    }
    if (assignment.status !== "PENDING") {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "assignment is not pending approval");
    }
    const policy = input.assignmentPolicy;
    if (policy?.grant && policy.authority) {
      const check = evaluateAuthorityGrant({
        grant: policy.grant,
        authority: policy.authority,
        actorId: input.approvedByActorId,
        scope: "MODEL_GOVERNANCE",
        resource: policy.grant.resource,
        at: this.#deps.at,
      });
      if (!check.allowed) {
        throw new GovernanceError(GovernanceErrorCode.AUTHORITY_MISSING, "human approval authority denied");
      }
    } else if (policy?.authority) {
      throw new GovernanceError(GovernanceErrorCode.AUTHORITY_MISSING, "human approval authority denied");
    }
    const activated = freezeDeep({
      ...assignment,
      status: "ACTIVE" as const,
      humanApproved: true,
      validFrom: this.#deps.at,
      assignedAt: this.#deps.at,
    });
    this.#deps.store.saveAssignment(activated);
    this.#emit("RESPONSIBILITY_ASSIGNED", assignment.assignmentId, `assignment-approved:${assignment.assignmentId}`, {});
    return activated;
  }

  revokeAssignment(assignmentId: string, actorId: string, rationale: string): ResponsibilityAssignment {
    const assignment = this.#deps.store.getAssignment(assignmentId);
    if (!assignment) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, `unknown assignment ${assignmentId}`);
    }
    const revoked = freezeDeep({ ...assignment, status: "REVOKED" as const });
    this.#deps.store.saveAssignment(revoked);
    this.#emit("RESPONSIBILITY_REVOKED", assignmentId, `assignment-revoked:${assignmentId}`, { actorId, rationale });
    return revoked;
  }

  suspendComponent(input: SuspendComponentInput): GovernedComponent {
    const component = this.#requireComponent(input.componentId, input.componentVersion);
    const suspended = freezeDeep({
      ...component,
      status: "SUSPENDED" as const,
    });
    this.#deps.store.saveComponent(suspended);
    const transition = createComponentStatusTransition({
      id: input.transitionId,
      transitionId: input.transitionId,
      componentId: input.componentId,
      componentVersion: input.componentVersion,
      kind: "SUSPEND",
      fromStatus: component.status,
      toStatus: "SUSPENDED",
      decisionId: input.decisionId,
      rationale: input.rationale,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveStatusTransition(transition);
    this.#emit("COMPONENT_SUSPENDED", input.componentId, `suspend:${input.transitionId}`, { actorId: input.actorId });
    return suspended;
  }

  restoreComponent(input: SuspendComponentInput): GovernedComponent {
    const component = this.#requireComponent(input.componentId, input.componentVersion);
    const restored = freezeDeep({ ...component, status: "ACTIVE" as const });
    this.#deps.store.saveComponent(restored);
    const transition = createComponentStatusTransition({
      id: input.transitionId,
      transitionId: input.transitionId,
      componentId: input.componentId,
      componentVersion: input.componentVersion,
      kind: "RESTORE",
      fromStatus: component.status,
      toStatus: "ACTIVE",
      decisionId: input.decisionId,
      rationale: input.rationale,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveStatusTransition(transition);
    this.#emit("COMPONENT_RESTORED", input.componentId, `restore:${input.transitionId}`, { actorId: input.actorId });
    return restored;
  }

  /** Creates a demotion PROPOSAL from CORE-03 recommendation — does NOT demote directly. */
  proposeDemotionFromRecommendation(input: ProposeDemotionInput): import("./types.js").ComponentStatusTransition {
    if (input.recommendation.kind !== "RESTRICT_RESPONSIBILITY") {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "recommendation kind does not imply demotion");
    }
    const component = this.#requireComponent(input.componentId, input.componentVersion);
    const transition = createComponentStatusTransition({
      id: input.transitionId,
      transitionId: input.transitionId,
      componentId: input.componentId,
      componentVersion: input.componentVersion,
      kind: "REDUCE_RESPONSIBILITY",
      fromStatus: component.status,
      toStatus: "PROPOSED_DEMOTION",
      recommendationId: input.recommendation.recommendationId,
      learningSignalId: input.learningSignal?.signalId,
      rationale: input.recommendation.rationale,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveStatusTransition(transition);
    this.#emit("COMPONENT_DEMOTION_PROPOSED", input.transitionId, `demotion-proposed:${input.transitionId}`, {
      recommendationId: input.recommendation.recommendationId,
    });
    return transition;
  }

  /** Executes governed demotion after authority + decision — not triggered by recommendation alone. */
  executeDemotion(input: ExecuteDemotionInput): { readonly component: GovernedComponent; readonly transition: import("./types.js").ComponentStatusTransition } {
    const component = this.#requireComponent(input.componentId, input.componentVersion);
    if (input.assignmentPolicy?.grant && input.assignmentPolicy.authority) {
      const check = evaluateAuthorityGrant({
        grant: input.assignmentPolicy.grant,
        authority: input.assignmentPolicy.authority,
        actorId: input.actorId,
        scope: "EXECUTE_ACTION",
        resource: input.assignmentPolicy.grant.resource,
        at: this.#deps.at,
      });
      if (!check.allowed) {
        throw new GovernanceError(GovernanceErrorCode.AUTHORITY_MISSING, "demotion authority denied");
      }
    }
    const demoted = freezeDeep({ ...component, status: "SUSPENDED" as const });
    this.#deps.store.saveComponent(demoted);
    const activeAssignments = this.#deps.store.listAssignments({
      componentId: input.componentId,
    }).filter((a) => a.status === "ACTIVE" && a.componentVersion === input.componentVersion);
    for (const assignment of activeAssignments) {
      this.#deps.store.saveAssignment(freezeDeep({ ...assignment, status: "SUSPENDED" as const }));
    }
    const transition = createComponentStatusTransition({
      id: input.transitionId,
      transitionId: input.transitionId,
      componentId: input.componentId,
      componentVersion: input.componentVersion,
      kind: "REDUCE_RESPONSIBILITY",
      fromStatus: component.status,
      toStatus: "SUSPENDED",
      decisionId: input.decisionId,
      rationale: input.rationale,
      createdAt: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    this.#deps.store.saveStatusTransition(transition);
    this.#emit("COMPONENT_DEMOTION_PROPOSED", input.transitionId, `demotion-executed:${input.transitionId}`, {
      decisionId: input.decisionId,
    });
    return { component: demoted, transition };
  }

  selectComponent(input: SelectComponentInput) {
    const responsibility = this.#requireResponsibility(input.responsibilityId);
    const result = selectEligibleComponent({
      selectionId: input.selectionId,
      responsibility,
      candidates: input.candidates,
      store: this.#deps.store,
      selectionPolicy: input.selectionPolicy,
      at: this.#deps.at,
      provenance: this.#deps.provenance,
    });
    if (!result) {
      return null;
    }
    this.#deps.store.saveSelection(result);
    this.#emit("COMPONENT_SELECTED", result.selectionId, `selection:${result.selectionId}`, {
      selectedComponentId: result.selectedComponentId,
    });
    return result;
  }

  recordFallbackRelationship(input: RecordFallbackInput) {
    const fallback = this.#requireComponent(
      input.relationship.fallbackComponentId,
      input.relationship.fallbackComponentVersion,
    );
    const eligibility = this.evaluateEligibility({
      eligibilityId: `fallback-elig:${input.relationship.relationshipId}`,
      componentId: fallback.componentId,
      componentVersion: fallback.version,
      responsibilityId: input.relationship.responsibilityId,
    });
    if (!isAssignmentEligible(eligibility.outcome)) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "fallback component is not eligible");
    }
    this.#deps.store.saveFallbackRelationship(input.relationship);
    return input.relationship;
  }

  proposeReplacement(input: ProposeReplacementInput) {
    const candidate = this.#requireComponent(
      input.proposal.candidateComponentId,
      input.proposal.candidateComponentVersion,
    );
    const eligibility = this.evaluateEligibility({
      eligibilityId: `replacement-elig:${input.proposal.proposalId}`,
      componentId: candidate.componentId,
      componentVersion: candidate.version,
      responsibilityId: input.proposal.responsibilityId,
    });
    if (!isAssignmentEligible(eligibility.outcome)) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, "replacement candidate is not eligible");
    }
    this.#deps.store.saveReplacementProposal(input.proposal);
    this.#emit("COMPONENT_REPLACEMENT_PROPOSED", input.proposal.proposalId, `replacement:${input.proposal.proposalId}`, {});
    return input.proposal;
  }

  requalifyComponent(input: RecordQualificationInput): QualificationRecord {
    return this.recordQualification(input);
  }

  #requireComponent(componentId: string, version: string): GovernedComponent {
    const component = this.#deps.store.getComponent(componentId, version);
    if (!component) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, `unknown component ${componentId}@${version}`);
    }
    return component;
  }

  #requireResponsibility(responsibilityId: string) {
    const responsibility = this.#deps.store.getResponsibility(responsibilityId);
    if (!responsibility) {
      throw new GovernanceError(GovernanceErrorCode.INVALID_VALUE, `unknown responsibility ${responsibilityId}`);
    }
    return responsibility;
  }

  #emit(
    eventType: import("./types.js").ComponentGovernanceEventType,
    payloadRef: string,
    idempotencyKey: string,
    metadata?: Record<string, string | number | boolean | null>,
  ): void {
    if (!this.#deps.ledger) return;
    emitComponentGovernanceEvent(this.#deps.ledger, {
      eventId: idempotencyKey,
      eventType,
      at: this.#deps.at,
      actorId: this.#deps.provenance.actorId,
      payloadRef,
      idempotencyKey,
      provenance: this.#deps.provenance,
      ...(metadata !== undefined ? { metadata: metadata as import("../schema.js").JsonSafeMetadata } : {}),
    });
  }
}

export function activateComponent(component: GovernedComponent, at: import("../schema.js").IsoTimestamp): GovernedComponent {
  return freezeDeep({ ...component, status: "ACTIVE" });
}

export function createSuspendedQualificationFromExpiry(
  existing: QualificationRecord,
  at: import("../schema.js").IsoTimestamp,
  provenance: import("../schema.js").Provenance,
): QualificationRecord {
  return createQualificationRecord({
    id: `${existing.qualificationId}:expired`,
    qualificationId: `${existing.qualificationId}:expired-marker`,
    componentId: existing.componentId,
    componentVersion: existing.componentVersion,
    responsibilityId: existing.responsibilityId,
    status: "EXPIRED",
    evidenceRefs: existing.evidenceRefs,
    validFrom: existing.validFrom,
    validUntil: at,
    supersededBy: undefined,
    immutable: true,
    createdAt: at,
    provenance,
  });
}
