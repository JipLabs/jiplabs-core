import { GovernanceError, GovernanceErrorCode } from "../errors.js";
import {
  assertAuthorizationBinding,
  assertValidForExecution,
  type GovernedActionAuthorization,
} from "../authorization/index.js";
import { createActionResult, type ActionRequest, type ActionResult } from "../actions/index.js";
import type {
  DomainActionExecutionRequest,
  DomainActionExecutor,
} from "../domain/index.js";
import type { Decision } from "../decisions/index.js";
import type { IsoTimestamp, Provenance, SubjectRef } from "../schema.js";

export type GovernedExecutionInput = {
  readonly authorization: GovernedActionAuthorization;
  readonly decision: Decision;
  readonly actionRequest: ActionRequest;
  readonly actionRequestId: string;
  readonly action: string;
  readonly subject: SubjectRef;
  readonly resourceKey: string;
  readonly executorActorId: string;
  readonly executor: DomainActionExecutor;
  readonly actionResultId: string;
  readonly executionAttemptId: string;
  readonly at: IsoTimestamp;
  readonly provenance: Provenance;
  readonly alreadyExecuted?: boolean;
  readonly reconciledResultRef?: string;
};

export type GovernedExecutionResult = {
  readonly actionResult: ActionResult;
  readonly executed: boolean;
};

export async function executeGovernedAction(
  input: GovernedExecutionInput,
): Promise<GovernedExecutionResult> {
  assertValidForExecution(input.authorization, input.decision.id);
  assertAuthorizationBinding({
    authorization: input.authorization,
    actionRequest: input.actionRequest,
    action: input.action,
    subject: input.subject,
    executorActorId: input.executorActorId,
    resourceKey: input.resourceKey,
  });
  if (input.alreadyExecuted) {
    throw new GovernanceError(
      GovernanceErrorCode.DUPLICATE_EXECUTION,
      "action already executed for this run",
    );
  }
  if (input.executor.domain !== (input.subject.domain ?? input.executor.domain)) {
    throw new GovernanceError(
      GovernanceErrorCode.INVALID_VALUE,
      "executor domain does not match governed subject domain",
    );
  }
  const request: DomainActionExecutionRequest = {
    decision: input.decision,
    action: input.action,
    subjectId: input.subject.id,
    executionAttemptId: input.executionAttemptId,
  };
  const raw = input.reconciledResultRef
    ? { status: "EXECUTED" as const, resultRef: input.reconciledResultRef }
    : await Promise.resolve(input.executor.execute(request));
  const status =
    raw.status === "EXECUTED"
      ? ("EXECUTED" as const)
      : raw.status === "FAILED"
        ? ("FAILED" as const)
        : ("BLOCKED" as const);
  const actionResult = createActionResult({
    id: input.actionResultId,
    decisionId: input.decision.id,
    actionRequestId: input.actionRequestId,
    authorizationId: input.authorization.id,
    action: input.action,
    subject: input.subject,
    status,
    createdAt: input.at,
    provenance: input.provenance,
    executedAt: input.at,
    resultRef: raw.resultRef,
    metadata: { executionAttemptId: input.executionAttemptId },
  });
  return { actionResult, executed: !input.reconciledResultRef };
}

export function assertExecutorNotBypassed(
  authorization: GovernedActionAuthorization | null | undefined,
  decisionId: string,
): void {
  assertValidForExecution(authorization, decisionId);
}
