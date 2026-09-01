import type { AuditFinding, AuditFindingResolution, AuditSeveritySummary } from "./types.js";
import { getEffectiveFindingStatus, isFindingUnresolved } from "./resolution.js";

export function buildAuditSeveritySummary(
  findings: readonly AuditFinding[],
  resolutions: readonly AuditFindingResolution[] = [],
): AuditSeveritySummary {
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let informational = 0;
  let unresolved = 0;

  for (const finding of findings) {
    switch (finding.severity) {
      case "CRITICAL":
        critical += 1;
        break;
      case "HIGH":
        high += 1;
        break;
      case "MEDIUM":
        medium += 1;
        break;
      case "LOW":
        low += 1;
        break;
      case "INFORMATIONAL":
        informational += 1;
        break;
    }
    if (isFindingUnresolved(finding, resolutions)) {
      unresolved += 1;
    }
  }

  return {
    critical,
    high,
    medium,
    low,
    informational,
    total: findings.length,
    unresolved,
  };
}

export function buildAuditReportSummary(findings: readonly AuditFinding[]): string {
  const severity = buildAuditSeveritySummary(findings);
  if (severity.total === 0) {
    return "No findings";
  }
  const parts: string[] = [];
  if (severity.critical) parts.push(`${severity.critical} critical`);
  if (severity.high) parts.push(`${severity.high} high`);
  if (severity.medium) parts.push(`${severity.medium} medium`);
  if (severity.low) parts.push(`${severity.low} low`);
  if (severity.informational) parts.push(`${severity.informational} informational`);
  return `${severity.total} finding(s): ${parts.join(", ")}`;
}

export function listUnresolvedFindingIds(
  findings: readonly AuditFinding[],
  resolutions: readonly AuditFindingResolution[] = [],
): readonly string[] {
  return findings
    .filter((f) => isFindingUnresolved(f, resolutions))
    .map((f) => f.id);
}

export function compareFindingStatuses(
  findings: readonly AuditFinding[],
  resolutions: readonly AuditFindingResolution[],
): readonly { readonly findingId: string; readonly recorded: AuditFinding["status"]; readonly effective: AuditFinding["status"] }[] {
  return findings.map((f) => ({
    findingId: f.id,
    recorded: f.status,
    effective: getEffectiveFindingStatus(f, resolutions),
  }));
}
