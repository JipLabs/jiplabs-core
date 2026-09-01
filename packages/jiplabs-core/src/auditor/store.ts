import type {
  AuditEngagement,
  AuditFinding,
  AuditFindingResolution,
  AuditReport,
} from "./types.js";

export interface AuditArtifactStore {
  saveEngagement(engagement: AuditEngagement): void;
  getEngagement(engagementId: string): AuditEngagement | undefined;
  listEngagements(filter?: { readonly targetId?: string }): readonly AuditEngagement[];

  saveFinding(finding: AuditFinding): void;
  getFinding(findingId: string): AuditFinding | undefined;
  listFindings(filter?: {
    readonly engagementId?: string;
    readonly fingerprint?: string;
  }): readonly AuditFinding[];

  saveResolution(resolution: AuditFindingResolution): void;
  getResolution(resolutionId: string): AuditFindingResolution | undefined;
  listResolutions(filter?: {
    readonly findingId?: string;
    readonly engagementId?: string;
  }): readonly AuditFindingResolution[];

  saveReport(report: AuditReport): void;
  getReport(reportId: string): AuditReport | undefined;
  listReports(filter?: { readonly engagementId?: string }): readonly AuditReport[];
}

export class InMemoryAuditArtifactStore implements AuditArtifactStore {
  private readonly engagements = new Map<string, AuditEngagement>();
  private readonly findings = new Map<string, AuditFinding>();
  private readonly resolutions = new Map<string, AuditFindingResolution>();
  private readonly reports = new Map<string, AuditReport>();

  saveEngagement(engagement: AuditEngagement): void {
    this.engagements.set(engagement.id, engagement);
  }

  getEngagement(engagementId: string): AuditEngagement | undefined {
    return this.engagements.get(engagementId);
  }

  listEngagements(filter?: { readonly targetId?: string }): readonly AuditEngagement[] {
    const all = [...this.engagements.values()];
    if (!filter?.targetId) return all;
    return all.filter((e) => e.targetId === filter.targetId);
  }

  saveFinding(finding: AuditFinding): void {
    this.findings.set(finding.id, finding);
  }

  getFinding(findingId: string): AuditFinding | undefined {
    return this.findings.get(findingId);
  }

  listFindings(filter?: {
    readonly engagementId?: string;
    readonly fingerprint?: string;
  }): readonly AuditFinding[] {
    let all = [...this.findings.values()];
    if (filter?.engagementId) {
      all = all.filter((f) => f.engagementId === filter.engagementId);
    }
    if (filter?.fingerprint) {
      all = all.filter((f) => f.fingerprint === filter.fingerprint);
    }
    return all;
  }

  saveResolution(resolution: AuditFindingResolution): void {
    this.resolutions.set(resolution.id, resolution);
  }

  getResolution(resolutionId: string): AuditFindingResolution | undefined {
    return this.resolutions.get(resolutionId);
  }

  listResolutions(filter?: {
    readonly findingId?: string;
    readonly engagementId?: string;
  }): readonly AuditFindingResolution[] {
    let all = [...this.resolutions.values()];
    if (filter?.findingId) {
      all = all.filter((r) => r.findingId === filter.findingId);
    }
    if (filter?.engagementId) {
      all = all.filter((r) => r.engagementId === filter.engagementId);
    }
    return all;
  }

  saveReport(report: AuditReport): void {
    this.reports.set(report.id, report);
  }

  getReport(reportId: string): AuditReport | undefined {
    return this.reports.get(reportId);
  }

  listReports(filter?: { readonly engagementId?: string }): readonly AuditReport[] {
    const all = [...this.reports.values()];
    if (!filter?.engagementId) return all;
    return all.filter((r) => r.engagementId === filter.engagementId);
  }
}
