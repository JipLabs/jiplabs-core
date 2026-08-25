import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  Provenance,
} from "../schema.js";

export type CoreEvaluationVerdict =
  | "CORRECT"
  | "INCORRECT"
  | "PARTIAL"
  | "INCONCLUSIVE"
  | "PENDING"
  | "NOT_EVALUABLE";

export type CoreEvaluation = EntityEnvelope & {
  readonly decisionId: string;
  readonly outcomeId: string;
  readonly evaluatorActorId: string;
  readonly verdict: CoreEvaluationVerdict;
  readonly evaluatedAt: IsoTimestamp;
  readonly rationale: string;
  readonly details?: JsonSafeMetadata;
};

export function createCoreEvaluation(input: {
  readonly id: string;
  readonly decisionId: string;
  readonly outcomeId: string;
  readonly evaluatorActorId: string;
  readonly verdict: CoreEvaluationVerdict;
  readonly evaluatedAt: IsoTimestamp;
  readonly rationale: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly details?: JsonSafeMetadata;
}): CoreEvaluation {
  return freezeDeep({
    ...envelope(input),
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    outcomeId: requireNonEmpty(input.outcomeId, "outcomeId"),
    evaluatorActorId: requireNonEmpty(
      input.evaluatorActorId,
      "evaluatorActorId",
    ),
    verdict: input.verdict,
    evaluatedAt: requireIsoTimestamp(input.evaluatedAt, "evaluatedAt"),
    rationale: requireNonEmpty(input.rationale, "rationale"),
    ...(input.details ? { details: input.details } : {}),
  });
}

export function mapDomainVerdict(
  verdict: string,
): CoreEvaluationVerdict {
  switch (verdict) {
    case "CORRECT":
    case "KEEP":
      return "CORRECT";
    case "INCORRECT":
    case "ROLLBACK":
      return "INCORRECT";
    case "PARTIAL":
    case "FOLLOW_UP":
      return "PARTIAL";
    case "PENDING":
      return "PENDING";
    case "NOT_EVALUABLE":
      return "NOT_EVALUABLE";
    default:
      return "INCONCLUSIVE";
  }
}
