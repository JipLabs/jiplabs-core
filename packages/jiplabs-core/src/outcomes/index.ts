import { envelope, freezeDeep, requireNonEmpty, requireIsoTimestamp } from "../envelope.js";
import type {
  EntityEnvelope,
  IsoTimestamp,
  JsonSafeMetadata,
  JsonSafeValue,
  Provenance,
  SubjectRef,
} from "../schema.js";

export type OutcomeKind =
  | "SUCCESS"
  | "FAILURE"
  | "PARTIAL"
  | "UNKNOWN"
  | "PENDING";

export type Outcome = EntityEnvelope & {
  readonly decisionId: string;
  readonly actionResultId: string;
  readonly subject: SubjectRef;
  readonly outcomeValue: JsonSafeValue;
  readonly observedAt: IsoTimestamp;
  readonly metadata?: JsonSafeMetadata;
};

/** CORE-01 outcome record with execution result classification. */
export type OutcomeRecord = EntityEnvelope & {
  readonly decisionId: string;
  readonly actionResultId: string;
  readonly subject: SubjectRef;
  readonly kind: OutcomeKind;
  readonly outcomeValue: JsonSafeValue;
  readonly observedAt: IsoTimestamp;
  readonly metadata?: JsonSafeMetadata;
};

export type EvaluationVerdict =
  | "KEEP"
  | "ROLLBACK"
  | "FOLLOW_UP"
  | "INCONCLUSIVE";

export type Evaluation = EntityEnvelope & {
  readonly decisionId: string;
  readonly outcomeId: string;
  readonly evaluatorActorId: string;
  readonly verdict: EvaluationVerdict;
  readonly evaluatedAt: IsoTimestamp;
  readonly rationale: string;
  readonly metadata?: JsonSafeMetadata;
};

export function createOutcome(input: {
  readonly id: string;
  readonly decisionId: string;
  readonly actionResultId: string;
  readonly subject: SubjectRef;
  readonly outcomeValue: JsonSafeValue;
  readonly observedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
}): Outcome {
  return freezeDeep({
    ...envelope(input),
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    actionResultId: requireNonEmpty(input.actionResultId, "actionResultId"),
    subject: freezeDeep({ ...input.subject }),
    outcomeValue: input.outcomeValue,
    observedAt: requireIsoTimestamp(input.observedAt, "observedAt"),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function createEvaluation(input: {
  readonly id: string;
  readonly decisionId: string;
  readonly outcomeId: string;
  readonly evaluatorActorId: string;
  readonly verdict: EvaluationVerdict;
  readonly evaluatedAt: IsoTimestamp;
  readonly rationale: string;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
}): Evaluation {
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
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function createOutcomeRecord(input: {
  readonly id: string;
  readonly decisionId: string;
  readonly actionResultId: string;
  readonly subject: SubjectRef;
  readonly kind: OutcomeKind;
  readonly outcomeValue: JsonSafeValue;
  readonly observedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly metadata?: JsonSafeMetadata;
}): OutcomeRecord {
  return freezeDeep({
    ...envelope(input),
    decisionId: requireNonEmpty(input.decisionId, "decisionId"),
    actionResultId: requireNonEmpty(input.actionResultId, "actionResultId"),
    subject: freezeDeep({ ...input.subject }),
    kind: input.kind,
    outcomeValue: input.outcomeValue,
    observedAt: requireIsoTimestamp(input.observedAt, "observedAt"),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function outcomeKindFromExecutionStatus(
  status: "EXECUTED" | "FAILED" | "BLOCKED" | "REQUESTED" | "AUTHORIZED",
): OutcomeKind {
  switch (status) {
    case "EXECUTED":
      return "SUCCESS";
    case "FAILED":
      return "FAILURE";
    case "BLOCKED":
      return "UNKNOWN";
    default:
      return "PENDING";
  }
}
