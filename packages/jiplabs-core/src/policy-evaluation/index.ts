import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import { freezeDeep, requireIsoTimestamp, requireNonEmpty } from "../envelope.js";
import { canonicalJson, sha256Canonical } from "../hash.js";
import type { IsoTimestamp, SubjectRef } from "../schema.js";

/**
 * Domain-agnostic policy evaluation decision.
 *
 * Distinct from {@link DecisionStatus} (lifecycle) and from gate verdicts
 * (`PASS` / `FAIL` / `MISSING`). Domain policies map their rules onto this
 * three-valued result. `REVIEW` is a governed outcome, not an error.
 */
export type PolicyDecision = "ALLOW" | "BLOCK" | "REVIEW";

export const POLICY_DECISIONS = ["ALLOW", "BLOCK", "REVIEW"] as const;

export const POLICY_EVALUATION_CONTRACT_VERSION = "policy-evaluation-1" as const;
export type PolicyEvaluationContractVersion =
  typeof POLICY_EVALUATION_CONTRACT_VERSION;

export type PolicySourceKind = "POLICY" | "OVERLAY";

export type PolicyContribution = {
  readonly sourceKind: PolicySourceKind;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceContentHash?: string;
  readonly decision: PolicyDecision;
  readonly reasonCodes: readonly string[];
};

export type PolicyIdentity = {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly contentHash: string;
};

/**
 * Reconstructable policy evaluation result. Domain-agnostic: no jurisdiction
 * lists, product names, or personal data. Prefer identifiers and references.
 */
export type PolicyEvaluationResult = {
  readonly contractVersion: PolicyEvaluationContractVersion;
  readonly decision: PolicyDecision;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly reasonCodes: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly evaluatedAt: IsoTimestamp;
  readonly subject?: SubjectRef;
  readonly contextRef?: string;
  readonly consideredSignalKinds?: readonly string[];
  readonly contributingSources: readonly PolicyContribution[];
};

export type PolicyEvaluationFailure = {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly evaluatedAt: IsoTimestamp;
};

export type PolicyEvaluationSuccess = {
  readonly ok: true;
  readonly result: PolicyEvaluationResult;
};

/**
 * Distinguishes a governed `REVIEW` decision (`ok: true`) from an operational
 * evaluation failure (`ok: false`). Failures must never be treated as ALLOW.
 */
export type PolicyEvaluationOutcome =
  | PolicyEvaluationSuccess
  | PolicyEvaluationFailure;

export type PolicyEvaluateInput<TContext> = {
  readonly context: TContext;
  readonly evaluatedAt: IsoTimestamp;
};

export type PolicyRule<TContext = unknown> = PolicyIdentity & {
  evaluate(
    input: PolicyEvaluateInput<TContext>,
  ): PolicyEvaluationResult | PolicyEvaluationOutcome;
};

const DECISION_RANK: Record<PolicyDecision, number> = {
  ALLOW: 0,
  REVIEW: 1,
  BLOCK: 2,
};

export function isPolicyDecision(value: unknown): value is PolicyDecision {
  return value === "ALLOW" || value === "BLOCK" || value === "REVIEW";
}

export function policyDecisionRank(decision: PolicyDecision): number {
  return DECISION_RANK[decision];
}

/**
 * Overlays may only tighten. The more restrictive of two decisions wins:
 * BLOCK > REVIEW > ALLOW.
 */
export function moreRestrictivePolicyDecision(
  a: PolicyDecision,
  b: PolicyDecision,
): PolicyDecision {
  return DECISION_RANK[a] >= DECISION_RANK[b] ? a : b;
}

export function createPolicyEvaluationResult(input: {
  readonly decision: PolicyDecision;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly evaluatedAt: IsoTimestamp;
  readonly reasonCodes?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly subject?: SubjectRef;
  readonly contextRef?: string;
  readonly consideredSignalKinds?: readonly string[];
  readonly contributingSources?: readonly PolicyContribution[];
}): PolicyEvaluationResult {
  if (!isPolicyDecision(input.decision)) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "decision must be ALLOW, BLOCK, or REVIEW",
    );
  }
  return freezeDeep({
    contractVersion: POLICY_EVALUATION_CONTRACT_VERSION,
    decision: input.decision,
    policyId: requireNonEmpty(input.policyId, "policyId"),
    policyVersion: requireNonEmpty(input.policyVersion, "policyVersion"),
    policyContentHash: requireNonEmpty(
      input.policyContentHash,
      "policyContentHash",
    ),
    reasonCodes: Object.freeze([...(input.reasonCodes ?? [])]),
    evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [])]),
    evaluatedAt: requireIsoTimestamp(input.evaluatedAt, "evaluatedAt"),
    ...(input.subject
      ? { subject: freezeDeep({ ...input.subject }) }
      : {}),
    ...(input.contextRef
      ? { contextRef: requireNonEmpty(input.contextRef, "contextRef") }
      : {}),
    ...(input.consideredSignalKinds
      ? {
          consideredSignalKinds: Object.freeze([
            ...input.consideredSignalKinds,
          ]),
        }
      : {}),
    contributingSources: freezeDeep(
      (input.contributingSources ?? []).map((source) => {
        if (source.sourceKind !== "POLICY" && source.sourceKind !== "OVERLAY") {
          throw new GovernanceError(
            GovernanceErrorCode.INVALID_VALUE,
            "contributingSources.sourceKind must be POLICY or OVERLAY",
          );
        }
        if (!isPolicyDecision(source.decision)) {
          throw new GovernanceError(
            GovernanceErrorCode.INVALID_VALUE,
            "contributingSources.decision must be ALLOW, BLOCK, or REVIEW",
          );
        }
        return {
          sourceKind: source.sourceKind,
          sourceId: requireNonEmpty(source.sourceId, "contributingSources.sourceId"),
          sourceVersion: requireNonEmpty(
            source.sourceVersion,
            "contributingSources.sourceVersion",
          ),
          ...(source.sourceContentHash
            ? { sourceContentHash: source.sourceContentHash }
            : {}),
          decision: source.decision,
          reasonCodes: Object.freeze([...source.reasonCodes]),
        };
      }),
    ),
  });
}

function isPolicyEvaluationFailure(
  value: PolicyEvaluationResult | PolicyEvaluationOutcome,
): value is PolicyEvaluationFailure {
  return "ok" in value && value.ok === false;
}

/**
 * Evaluate a domain policy through the generic Core contract.
 *
 * Thrown evaluator errors become `ok: false` (operational failure), never
 * ALLOW and never a silent REVIEW. A successful REVIEW remains `ok: true`.
 */
export function evaluatePolicy<TContext>(input: {
  readonly policy: PolicyRule<TContext>;
  readonly context: TContext;
  readonly evaluatedAt: IsoTimestamp;
}): PolicyEvaluationOutcome {
  requireIsoTimestamp(input.evaluatedAt, "evaluatedAt");
  try {
    const raw = input.policy.evaluate({
      context: input.context,
      evaluatedAt: input.evaluatedAt,
    });
    if (isPolicyEvaluationFailure(raw)) {
      return raw;
    }
    const result = "ok" in raw && raw.ok === true ? raw.result : raw;
    if (
      result.policyId !== input.policy.policyId ||
      result.policyVersion !== input.policy.policyVersion
    ) {
      return {
        ok: false,
        code: GovernanceErrorCode.INVALID_VALUE,
        message:
          "policy evaluation result identity does not match the evaluated policy",
        evaluatedAt: input.evaluatedAt,
      };
    }
    return { ok: true, result };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "policy evaluation failed";
    const code =
      err instanceof GovernanceError
        ? err.code
        : GovernanceErrorCode.POLICY_EVALUATION_FAILED;
    return {
      ok: false,
      code,
      message,
      evaluatedAt: input.evaluatedAt,
    };
  }
}

function contributionFromResult(
  result: PolicyEvaluationResult,
  sourceKind: PolicySourceKind,
): PolicyContribution {
  return freezeDeep({
    sourceKind,
    sourceId: result.policyId,
    sourceVersion: result.policyVersion,
    sourceContentHash: result.policyContentHash,
    decision: result.decision,
    reasonCodes: Object.freeze([...result.reasonCodes]),
  });
}

function mergeUnique(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return Object.freeze(out);
}

/**
 * Combine a base policy result with overlays. Overlays cannot relax a
 * restriction: the effective decision is the most restrictive of the set.
 */
export function composePolicyDecisions(input: {
  readonly base: PolicyEvaluationResult;
  readonly overlays?: readonly PolicyEvaluationResult[];
  readonly evaluatedAt?: IsoTimestamp;
}): PolicyEvaluationResult {
  const overlays = input.overlays ?? [];
  let decision = input.base.decision;
  const reasonCodes: string[] = [...input.base.reasonCodes];
  const evidenceRefs: string[] = [...input.base.evidenceRefs];
  const considered: string[] = [...(input.base.consideredSignalKinds ?? [])];
  const contributingSources: PolicyContribution[] =
    input.base.contributingSources.length > 0
      ? [...input.base.contributingSources]
      : [contributionFromResult(input.base, "POLICY")];

  for (const overlay of overlays) {
    const previous = decision;
    decision = moreRestrictivePolicyDecision(decision, overlay.decision);
    if (policyDecisionRank(overlay.decision) > policyDecisionRank(previous)) {
      for (const code of overlay.reasonCodes) {
        if (!reasonCodes.includes(code)) reasonCodes.push(code);
      }
    } else if (overlay.decision === decision) {
      for (const code of overlay.reasonCodes) {
        if (!reasonCodes.includes(code)) reasonCodes.push(code);
      }
    }
    for (const ref of overlay.evidenceRefs) {
      if (!evidenceRefs.includes(ref)) evidenceRefs.push(ref);
    }
    for (const kind of overlay.consideredSignalKinds ?? []) {
      if (!considered.includes(kind)) considered.push(kind);
    }
    contributingSources.push(contributionFromResult(overlay, "OVERLAY"));
  }

  return createPolicyEvaluationResult({
    decision,
    policyId: input.base.policyId,
    policyVersion: input.base.policyVersion,
    policyContentHash: input.base.policyContentHash,
    evaluatedAt: input.evaluatedAt ?? input.base.evaluatedAt,
    reasonCodes,
    evidenceRefs,
    subject: input.base.subject,
    contextRef: input.base.contextRef,
    consideredSignalKinds: considered.length > 0 ? considered : undefined,
    contributingSources,
  });
}

export function policyEvaluationSerializationPayload(
  result: PolicyEvaluationResult,
): unknown {
  return {
    contractVersion: result.contractVersion,
    consideredSignalKinds: result.consideredSignalKinds ?? null,
    contextRef: result.contextRef ?? null,
    contributingSources: result.contributingSources,
    decision: result.decision,
    evaluatedAt: result.evaluatedAt,
    evidenceRefs: result.evidenceRefs,
    policyContentHash: result.policyContentHash,
    policyId: result.policyId,
    policyVersion: result.policyVersion,
    reasonCodes: result.reasonCodes,
    subject: result.subject ?? null,
  };
}

export function serializePolicyEvaluationResult(
  result: PolicyEvaluationResult,
): string {
  return canonicalJson(policyEvaluationSerializationPayload(result));
}

export function hashPolicyEvaluationResult(
  result: PolicyEvaluationResult,
): string {
  return sha256Canonical(policyEvaluationSerializationPayload(result));
}

function asStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      `${field} must be an array of strings`,
    );
  }
  return value as readonly string[];
}

function parseContribution(value: unknown): PolicyContribution {
  if (typeof value !== "object" || value === null) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "contributingSources entries must be objects",
    );
  }
  const entry = value as Record<string, unknown>;
  if (entry.sourceKind !== "POLICY" && entry.sourceKind !== "OVERLAY") {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "contributingSources.sourceKind must be POLICY or OVERLAY",
    );
  }
  if (!isPolicyDecision(entry.decision)) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "contributingSources.decision must be ALLOW, BLOCK, or REVIEW",
    );
  }
  return {
    sourceKind: entry.sourceKind,
    sourceId: requireNonEmpty(
      typeof entry.sourceId === "string" ? entry.sourceId : "",
      "contributingSources.sourceId",
    ),
    sourceVersion: requireNonEmpty(
      typeof entry.sourceVersion === "string" ? entry.sourceVersion : "",
      "contributingSources.sourceVersion",
    ),
    ...(typeof entry.sourceContentHash === "string"
      ? { sourceContentHash: entry.sourceContentHash }
      : {}),
    decision: entry.decision,
    reasonCodes: asStringArray(entry.reasonCodes, "contributingSources.reasonCodes"),
  };
}

/**
 * Reconstruct a historical evaluation from its canonical serialization.
 * A later policy version cannot rewrite this object in place.
 */
export function parsePolicyEvaluationResult(
  serialized: string,
): PolicyEvaluationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "policy evaluation result is not valid JSON",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "policy evaluation result must be an object",
    );
  }
  const record = parsed as Record<string, unknown>;
  if (!isPolicyDecision(record.decision)) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "serialized decision must be ALLOW, BLOCK, or REVIEW",
    );
  }
  const contributionsRaw = record.contributingSources;
  if (!Array.isArray(contributionsRaw)) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "contributingSources must be an array",
    );
  }
  const subjectRaw = record.subject;
  let subject: SubjectRef | undefined;
  if (subjectRaw !== null && subjectRaw !== undefined) {
    if (typeof subjectRaw !== "object") {
      throw new GovernanceError(
        GovernanceErrorCode.INVALID_VALUE,
        "subject must be an object when present",
      );
    }
    const s = subjectRaw as Record<string, unknown>;
    subject = {
      type: requireNonEmpty(typeof s.type === "string" ? s.type : "", "subject.type"),
      id: requireNonEmpty(typeof s.id === "string" ? s.id : "", "subject.id"),
      ...(typeof s.domain === "string" ? { domain: s.domain } : {}),
    };
  }
  return createPolicyEvaluationResult({
    decision: record.decision,
    policyId: typeof record.policyId === "string" ? record.policyId : "",
    policyVersion:
      typeof record.policyVersion === "string" ? record.policyVersion : "",
    policyContentHash:
      typeof record.policyContentHash === "string"
        ? record.policyContentHash
        : "",
    evaluatedAt:
      typeof record.evaluatedAt === "string" ? record.evaluatedAt : "",
    reasonCodes: asStringArray(record.reasonCodes, "reasonCodes"),
    evidenceRefs: asStringArray(record.evidenceRefs, "evidenceRefs"),
    subject,
    contextRef:
      typeof record.contextRef === "string" ? record.contextRef : undefined,
    consideredSignalKinds: Array.isArray(record.consideredSignalKinds)
      ? asStringArray(record.consideredSignalKinds, "consideredSignalKinds")
      : undefined,
    contributingSources: contributionsRaw.map(parseContribution),
  });
}

/**
 * Fail-closed entitlement check. Missing, failed, BLOCK, and REVIEW are not
 * ALLOW. Operational errors are not business decisions.
 */
export function isEntitlementPermitted(
  outcome: PolicyEvaluationOutcome | PolicyEvaluationResult | null | undefined,
): boolean {
  if (outcome == null) return false;
  if ("ok" in outcome) {
    return outcome.ok === true && outcome.result.decision === "ALLOW";
  }
  return outcome.decision === "ALLOW";
}

export function isPolicyAllow(
  outcome: PolicyEvaluationOutcome | PolicyEvaluationResult | null | undefined,
): boolean {
  return isEntitlementPermitted(outcome);
}

export function assertEntitlementPermitted(
  outcome: PolicyEvaluationOutcome | PolicyEvaluationResult | null | undefined,
): asserts outcome is PolicyEvaluationSuccess | PolicyEvaluationResult {
  if (isEntitlementPermitted(outcome)) return;
  let detail = "missing evaluation";
  if (outcome && "ok" in outcome && outcome.ok === false) {
    detail = `evaluation failed (${outcome.code})`;
  } else if (outcome && "ok" in outcome && outcome.ok === true) {
    detail = `decision=${outcome.result.decision}`;
  } else if (outcome && "decision" in outcome) {
    detail = `decision=${outcome.decision}`;
  }
  throw new GovernanceError(
    GovernanceErrorCode.ENTITLEMENT_NOT_PERMITTED,
    `entitlement is not permitted: ${detail}`,
  );
}
