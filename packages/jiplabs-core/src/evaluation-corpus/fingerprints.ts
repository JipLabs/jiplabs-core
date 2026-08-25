import { sha256Canonical } from "../hash.js";
import type { EvaluationCaseCandidate, EvaluationCaseVersion, EvaluationRun, EvaluationSuiteVersion } from "./types.js";

export function candidateContentPayload(input: {
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly inputContextRefs: readonly unknown[];
  readonly evidenceRefs: readonly string[];
  readonly provenance: unknown;
  readonly tags?: readonly string[];
}): unknown {
  return {
    domain: input.domain,
    title: input.title,
    description: input.description ?? null,
    inputContextRefs: input.inputContextRefs,
    evidenceRefs: [...input.evidenceRefs].sort(),
    provenance: input.provenance,
    tags: input.tags ? [...input.tags].sort() : null,
  };
}

export function computeCandidateFingerprint(input: {
  readonly domain: string;
  readonly title: string;
  readonly description?: string;
  readonly inputContextRefs: readonly unknown[];
  readonly evidenceRefs: readonly string[];
  readonly provenance: unknown;
  readonly tags?: readonly string[];
}): string {
  return sha256Canonical(candidateContentPayload(input));
}

export function caseVersionContentPayload(input: {
  readonly caseId: string;
  readonly version: string;
  readonly domain: string;
  readonly title: string;
  readonly inputContextRefs: readonly unknown[];
  readonly evidenceRefs: readonly string[];
  readonly expectation: unknown;
  readonly criteria: readonly unknown[];
  readonly limitations?: readonly string[];
  readonly tags?: readonly string[];
}): unknown {
  return {
    caseId: input.caseId,
    version: input.version,
    domain: input.domain,
    title: input.title,
    inputContextRefs: input.inputContextRefs,
    evidenceRefs: [...input.evidenceRefs].sort(),
    expectation: input.expectation,
    criteria: input.criteria,
    limitations: input.limitations ?? null,
    tags: input.tags ? [...input.tags].sort() : null,
  };
}

export function computeCaseVersionFingerprint(input: {
  readonly caseId: string;
  readonly version: string;
  readonly domain: string;
  readonly title: string;
  readonly inputContextRefs: readonly unknown[];
  readonly evidenceRefs: readonly string[];
  readonly expectation: unknown;
  readonly criteria: readonly unknown[];
  readonly limitations?: readonly string[];
  readonly tags?: readonly string[];
}): string {
  return sha256Canonical(caseVersionContentPayload(input));
}

export function computeSuiteVersionContentHash(input: {
  readonly suiteId: string;
  readonly version: string;
  readonly caseVersionRefs: readonly { readonly caseId: string; readonly version: string }[];
}): string {
  const refs = [...input.caseVersionRefs].sort((a, b) =>
    `${a.caseId}:${a.version}`.localeCompare(`${b.caseId}:${b.version}`),
  );
  return sha256Canonical({
    suiteId: input.suiteId,
    version: input.version,
    caseVersionRefs: refs,
  });
}

export function computeEvaluationRunFingerprint(input: {
  readonly targetId: string;
  readonly targetVersion: string;
  readonly suiteId: string;
  readonly suiteVersion: string;
  readonly caseVersionRefs: readonly { readonly caseId: string; readonly version: string }[];
  readonly evaluatorActorId: string;
  readonly evaluatorVersion?: string;
  readonly configuration: unknown;
}): string {
  const refs = [...input.caseVersionRefs].sort((a, b) =>
    `${a.caseId}:${a.version}`.localeCompare(`${b.caseId}:${b.version}`),
  );
  return sha256Canonical({
    targetId: input.targetId,
    targetVersion: input.targetVersion,
    suiteId: input.suiteId,
    suiteVersion: input.suiteVersion,
    caseVersionRefs: refs,
    evaluatorActorId: input.evaluatorActorId,
    evaluatorVersion: input.evaluatorVersion ?? null,
    configuration: input.configuration,
  });
}

export function assertNoDuplicateCandidate(
  existing: EvaluationCaseCandidate | undefined,
  fingerprint: string,
): void {
  if (existing && existing.fingerprint === fingerprint) {
    return;
  }
}

export function assertNoConflictingCaseVersion(
  existing: EvaluationCaseVersion | undefined,
  fingerprint: string,
  caseId: string,
  version: string,
): void {
  if (!existing) {
    return;
  }
  if (existing.caseId === caseId && existing.version === version && existing.fingerprint !== fingerprint) {
    throw new Error(`conflicting content for case ${caseId} version ${version}`);
  }
}

export function computeRunFingerprintFromRun(run: EvaluationRun): string {
  return computeEvaluationRunFingerprint({
    targetId: run.target.targetId,
    targetVersion: run.target.version,
    suiteId: run.suiteId,
    suiteVersion: run.suiteVersion,
    caseVersionRefs: run.caseVersionRefs,
    evaluatorActorId: run.evaluatorActorId,
    evaluatorVersion: run.evaluatorVersion,
    configuration: run.configuration,
  });
}

export function computeSuiteVersionHash(version: EvaluationSuiteVersion): string {
  return computeSuiteVersionContentHash({
    suiteId: version.suiteId,
    version: version.version,
    caseVersionRefs: version.caseVersionRefs,
  });
}
