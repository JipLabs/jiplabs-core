import type {
  AuditFinding,
  AuditFindingResolution,
  AuditFindingStatus,
} from "./types.js";

const RESOLVED_STATUSES: ReadonlySet<AuditFindingStatus> = new Set([
  "RESOLVED",
  "DISMISSED",
  "SUPERSEDED",
]);

export function getEffectiveFindingStatus(
  finding: AuditFinding,
  resolutions: readonly AuditFindingResolution[],
): AuditFindingStatus {
  const forFinding = resolutions
    .filter((r) => r.findingId === finding.id)
    .sort((a, b) => Date.parse(a.resolvedAt) - Date.parse(b.resolvedAt));

  if (forFinding.length === 0) {
    return finding.status;
  }
  return forFinding[forFinding.length - 1]!.toStatus;
}

export function isFindingUnresolved(
  finding: AuditFinding,
  resolutions: readonly AuditFindingResolution[],
): boolean {
  return !RESOLVED_STATUSES.has(getEffectiveFindingStatus(finding, resolutions));
}

export function assertFindingHistoryPreserved(
  original: AuditFinding,
  afterResolution: AuditFinding,
): void {
  if (original.id !== afterResolution.id) {
    throw new Error("finding identity must not change when preserving history");
  }
  if (original.fingerprint !== afterResolution.fingerprint) {
    throw new Error("finding fingerprint must remain immutable");
  }
}
