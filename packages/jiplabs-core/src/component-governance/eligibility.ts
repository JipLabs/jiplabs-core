import { compareIso } from "../envelope.js";
import type { EvaluationCorpusStore } from "../evaluation-corpus/contracts.js";
import type { Authority, AuthorityGrant } from "../authority/index.js";
import { evaluateAuthorityGrant } from "../authority/index.js";
import type { PolicyVersion } from "../policies/index.js";
import type { IsoTimestamp } from "../schema.js";
import { createResponsibilityEligibility } from "./factories.js";
import type {
  CapabilityDeclaration,
  ComponentGovernanceTraceRefs,
  EligibilityOutcome,
  GovernedComponent,
  QualificationRecord,
  QualificationRequirement,
  Responsibility,
  ResponsibilityEligibility,
  ValidatorIndependencePolicy,
} from "./types.js";

export type EligibilityEvaluationInput = {
  readonly eligibilityId: string;
  readonly component: GovernedComponent;
  readonly responsibility: Responsibility;
  readonly capabilityDeclarations: readonly CapabilityDeclaration[];
  readonly qualificationRecords: readonly QualificationRecord[];
  readonly at: IsoTimestamp;
  readonly provenance: import("../schema.js").Provenance;
  readonly corpusStore?: EvaluationCorpusStore;
  readonly requireHumanApproval?: boolean;
  readonly authority?: Authority;
  readonly grant?: AuthorityGrant | null;
  readonly actorId?: string;
};

export function evaluateResponsibilityEligibility(
  input: EligibilityEvaluationInput,
): ResponsibilityEligibility {
  const reasons: string[] = [];
  let outcome: EligibilityOutcome = "ELIGIBLE";
  let qualificationRecordId: string | undefined;
  let restrictions: string[] | undefined;

  const { component, responsibility, at } = input;

  if (component.status === "SUSPENDED" || component.status === "DISQUALIFIED") {
    return createResponsibilityEligibility({
      id: input.eligibilityId,
      eligibilityId: input.eligibilityId,
      componentId: component.componentId,
      componentVersion: component.version,
      responsibilityId: responsibility.responsibilityId,
      outcome: "SUSPENDED",
      reasons: Object.freeze([`component status is ${component.status}`]),
      evaluatedAt: at,
      createdAt: at,
      provenance: input.provenance,
    });
  }

  if (compareIso(at, responsibility.effectiveFrom) < 0) {
    reasons.push("responsibility not yet effective");
    outcome = "INELIGIBLE";
  }
  if (responsibility.effectiveUntil && compareIso(at, responsibility.effectiveUntil) > 0) {
    reasons.push("responsibility expired");
    outcome = "INELIGIBLE";
  }

  const declaredCaps = new Set(input.capabilityDeclarations.map((d) => d.capabilityId));
  for (const required of responsibility.requiredCapabilities) {
    if (!declaredCaps.has(required)) {
      reasons.push(`missing declared capability: ${required}`);
      outcome = "INELIGIBLE";
    }
  }

  const activeQualifications = input.qualificationRecords.filter((q) => {
    if (q.componentId !== component.componentId || q.componentVersion !== component.version) {
      return false;
    }
    if (q.validUntil && compareIso(at, q.validUntil) > 0) {
      return false;
    }
    if (compareIso(at, q.validFrom) < 0) {
      return false;
    }
    if (q.supersededBy) {
      return false;
    }
    return true;
  });

  const relevantQual = activeQualifications.find(
    (q) =>
      !q.responsibilityId || q.responsibilityId === responsibility.responsibilityId,
  );

  if (responsibility.requiredQualifications && responsibility.requiredQualifications.length > 0) {
    const evalResult = evaluateQualificationRequirements({
      requirements: responsibility.requiredQualifications,
      qualifications: activeQualifications,
      corpusStore: input.corpusStore,
      at,
    });
    if (!evalResult.satisfied) {
      reasons.push(...evalResult.reasons);
      outcome = evalResult.evaluationRequired ? "EVALUATION_REQUIRED" : "INELIGIBLE";
    } else if (evalResult.qualificationRecordId) {
      qualificationRecordId = evalResult.qualificationRecordId;
      const matched = input.qualificationRecords.find((q) => q.qualificationId === evalResult.qualificationRecordId);
      if (matched?.status === "QUALIFIED_WITH_RESTRICTIONS") {
        outcome = outcome === "ELIGIBLE" ? "ELIGIBLE_WITH_RESTRICTIONS" : outcome;
        restrictions = matched.limitations ? [...matched.limitations] : ["restricted"];
      } else if (matched?.status === "PROBATION") {
        outcome = outcome === "ELIGIBLE" ? "ELIGIBLE_WITH_RESTRICTIONS" : outcome;
        restrictions = ["probation"];
      }
    }
  } else if (!relevantQual || relevantQual.status === "UNASSESSED") {
    if (outcome === "ELIGIBLE") {
      outcome = "EVALUATION_REQUIRED";
      reasons.push("no qualification evidence");
    }
  } else {
    qualificationRecordId = relevantQual.qualificationId;
    switch (relevantQual.status) {
      case "QUALIFIED":
        break;
      case "QUALIFIED_WITH_RESTRICTIONS":
        outcome = outcome === "ELIGIBLE" ? "ELIGIBLE_WITH_RESTRICTIONS" : outcome;
        restrictions = relevantQual.limitations ? [...relevantQual.limitations] : ["restricted"];
        break;
      case "PROBATION":
        outcome = outcome === "ELIGIBLE" ? "ELIGIBLE_WITH_RESTRICTIONS" : outcome;
        restrictions = ["probation"];
        break;
      case "SUSPENDED":
      case "DISQUALIFIED":
      case "EXPIRED":
        outcome = relevantQual.status === "SUSPENDED" ? "SUSPENDED" : "INELIGIBLE";
        reasons.push(`qualification status is ${relevantQual.status}`);
        break;
      default:
        outcome = "EVALUATION_REQUIRED";
        reasons.push(`qualification status is ${relevantQual.status}`);
    }
  }

  if (input.requireHumanApproval && (outcome === "ELIGIBLE" || outcome === "ELIGIBLE_WITH_RESTRICTIONS")) {
    outcome = "HUMAN_APPROVAL_REQUIRED";
    reasons.push("policy requires human approval for assignment");
  }

  if (responsibility.requiredAuthority && responsibility.requiredAuthority.length > 0 && input.grant && input.authority) {
    for (const scope of responsibility.requiredAuthority) {
      const check = evaluateAuthorityGrant({
        grant: input.grant,
        authority: input.authority,
        actorId: input.actorId ?? input.provenance.actorId,
        scope: scope as import("../authority/index.js").CapabilityId,
        resource: responsibility.resourceScope ?? { domain: responsibility.domainScope ?? "global" },
        at,
      });
      if (!check.allowed) {
        reasons.push(`authority scope ${scope} denied`);
        outcome = "INELIGIBLE";
      }
    }
  }

  return createResponsibilityEligibility({
    id: input.eligibilityId,
    eligibilityId: input.eligibilityId,
    componentId: component.componentId,
    componentVersion: component.version,
    responsibilityId: responsibility.responsibilityId,
    outcome,
    reasons: Object.freeze(reasons),
    qualificationRecordId,
    restrictions: restrictions ? Object.freeze(restrictions) : undefined,
    evaluatedAt: at,
    createdAt: at,
    provenance: input.provenance,
  });
}

function evaluateQualificationRequirements(input: {
  readonly requirements: readonly QualificationRequirement[];
  readonly qualifications: readonly QualificationRecord[];
  readonly corpusStore?: EvaluationCorpusStore;
  readonly at: IsoTimestamp;
}): {
  readonly satisfied: boolean;
  readonly evaluationRequired: boolean;
  readonly reasons: readonly string[];
  readonly qualificationRecordId?: string;
} {
  const reasons: string[] = [];
  let evaluationRequired = false;
  let qualificationRecordId: string | undefined;

  for (const req of input.requirements) {
    switch (req.kind) {
      case "EVALUATION_SUITE": {
        const match = input.qualifications.find(
          (q) =>
            q.evaluationSuiteId === req.evaluationSuiteId &&
            (!req.evaluationSuiteVersion || q.evaluationSuiteVersion === req.evaluationSuiteVersion) &&
            (q.status === "QUALIFIED" || q.status === "QUALIFIED_WITH_RESTRICTIONS" || q.status === "PROBATION"),
        );
        if (!match) {
          if (req.evaluationSuiteId) {
            evaluationRequired = true;
            reasons.push(`missing evaluation suite ${req.evaluationSuiteId} qualification`);
          } else {
            reasons.push("evaluation suite requirement unspecified");
            evaluationRequired = true;
          }
        } else {
          qualificationRecordId = match.qualificationId;
          if (req.maxAgeDays && match.evaluationRunId && input.corpusStore) {
            const run = input.corpusStore.getRun(match.evaluationRunId);
            if (run) {
              const runAt = run.completedAt ?? run.startedAt;
              const ageMs = Date.parse(input.at) - Date.parse(runAt);
              const ageDays = ageMs / (86400 * 1000);
              if (ageDays > req.maxAgeDays) {
                reasons.push("evaluation evidence too old");
                evaluationRequired = true;
              }
            }
          }
        }
        break;
      }
      case "PASS_RATE": {
        const match = input.qualifications.find((q) => q.status === "QUALIFIED" || q.status === "QUALIFIED_WITH_RESTRICTIONS");
        if (!match) {
          evaluationRequired = true;
          reasons.push("pass rate qualification missing");
        } else {
          qualificationRecordId = match.qualificationId;
        }
        break;
      }
      default:
        break;
    }
  }

  const satisfied = reasons.length === 0;
  return { satisfied, evaluationRequired, reasons, qualificationRecordId };
}

export function validateValidatorIndependence(input: {
  readonly producer: GovernedComponent;
  readonly validator: GovernedComponent;
  readonly policy: ValidatorIndependencePolicy;
}): { readonly valid: boolean; readonly reason?: string } {
  if (!input.policy.requireIndependentValidator) {
    return { valid: true };
  }
  if (input.policy.forbidSameComponent !== false && input.producer.componentId === input.validator.componentId) {
    return { valid: false, reason: "validator cannot be same component as producer" };
  }
  if (input.policy.forbidSameProvider) {
    const pProvider = input.producer.providerMetadata?.provider;
    const vProvider = input.validator.providerMetadata?.provider;
    if (pProvider && vProvider && pProvider === vProvider) {
      return { valid: false, reason: "validator must be from different provider" };
    }
  }
  if (input.policy.forbidSameModelFamily) {
    const pFamily = (input.producer as { modelFamily?: string }).modelFamily;
    const vFamily = (input.validator as { modelFamily?: string }).modelFamily;
    if (pFamily && vFamily && pFamily === vFamily) {
      return { valid: false, reason: "validator must be from different model family" };
    }
  }
  return { valid: true };
}

export function buildComponentGovernanceTraceRefs(input: {
  readonly component?: GovernedComponent;
  readonly capabilities?: readonly CapabilityDeclaration[];
  readonly qualification?: QualificationRecord;
  readonly responsibility?: Responsibility;
  readonly assignment?: import("./types.js").ResponsibilityAssignment;
  readonly laterSuspended?: boolean;
}): ComponentGovernanceTraceRefs {
  return {
    ...(input.component
      ? { componentId: input.component.componentId, componentVersion: input.component.version }
      : {}),
    ...(input.capabilities
      ? { capabilityDeclarationIds: Object.freeze(input.capabilities.map((c) => c.declarationId)) }
      : {}),
    ...(input.qualification
      ? {
          qualificationRecordId: input.qualification.qualificationId,
          evaluationRunId: input.qualification.evaluationRunId,
          evaluationSuiteId: input.qualification.evaluationSuiteId,
          evaluationSuiteVersion: input.qualification.evaluationSuiteVersion,
        }
      : {}),
    ...(input.responsibility ? { responsibilityId: input.responsibility.responsibilityId } : {}),
    ...(input.assignment
      ? {
          assignmentId: input.assignment.assignmentId,
          assignedByActorId: input.assignment.assignedByActorId,
          policyVersionId: input.assignment.policyVersionId,
          assignmentMode: input.assignment.mode,
          validatorComponentId: input.assignment.validatorComponentId,
        }
      : {}),
    ...(input.laterSuspended !== undefined ? { laterSuspended: input.laterSuspended } : {}),
  };
}

export type AssignmentPolicy = {
  readonly policyVersion?: PolicyVersion;
  readonly authority?: Authority;
  readonly grant?: AuthorityGrant | null;
  readonly requireHumanApproval?: boolean;
  readonly allowedModes?: readonly import("./types.js").AssignmentMode[];
  readonly validatorIndependence?: ValidatorIndependencePolicy;
};

export function isAssignmentEligible(outcome: EligibilityOutcome): boolean {
  return outcome === "ELIGIBLE" || outcome === "ELIGIBLE_WITH_RESTRICTIONS";
}
