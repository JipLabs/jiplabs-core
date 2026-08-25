import { sha256Canonical } from "../hash.js";

export function computeComponentContentHash(input: {
  readonly componentId: string;
  readonly componentType: string;
  readonly version: string;
  readonly artifactIdentity?: string;
  readonly runtimeIdentity?: string;
}): string {
  return sha256Canonical(input);
}

export function computeCapabilityContentHash(input: {
  readonly componentId: string;
  readonly componentVersion: string;
  readonly capabilityId: string;
}): string {
  return sha256Canonical(input);
}

export function computeResponsibilityContentHash(input: {
  readonly responsibilityId: string;
  readonly requiredCapabilities: readonly string[];
}): string {
  return sha256Canonical(input);
}

export function computeQualificationContentHash(input: {
  readonly qualificationId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly status: string;
  readonly evidenceRefs: readonly string[];
}): string {
  return sha256Canonical(input);
}

export function computeEligibilityContentHash(input: {
  readonly eligibilityId: string;
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly outcome: string;
}): string {
  return sha256Canonical(input);
}

export function computeAssignmentHash(input: {
  readonly componentId: string;
  readonly componentVersion: string;
  readonly responsibilityId: string;
  readonly eligibilityId: string;
  readonly mode: string;
  readonly validFrom: string;
}): string {
  return sha256Canonical(input);
}

export function computeAssignmentContentHash(input: {
  readonly assignmentId: string;
  readonly assignmentHash: string;
}): string {
  return sha256Canonical(input);
}

export function computeSelectionContentHash(input: {
  readonly selectionId: string;
  readonly responsibilityId: string;
  readonly selectedComponentId: string;
  readonly selectedComponentVersion: string;
}): string {
  return sha256Canonical(input);
}
