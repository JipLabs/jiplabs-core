import type { AuditRuleEvaluator } from "../../src/auditor/contracts.js";

/** Quinté Lab pattern — product adapter semantics in test fixture only. */
export const quinteLabAuditRules: readonly AuditRuleEvaluator[] = [
  {
    ruleId: "decision-time-evidence",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      const trace = input.trace;
      if (!trace) return { passed: true };
      const required = input.context?.requiredEvidenceCount as number | undefined;
      if (required === undefined) return { passed: true };
      if (trace.evidenceIds.length < required) {
        return {
          passed: false,
          findings: [
            {
              code: "DECISION_TIME_EVIDENCE_GAP",
              classification: "EVIDENCE_GAP",
              title: "Insufficient decision-time evidence",
              description: "Evidence count below policy requirement at decision time.",
              severity: "HIGH",
              justification: `expected>=${required}, actual=${trace.evidenceIds.length}`,
              evidenceRefs: [...trace.evidenceIds],
              decisionRefs: [trace.decisionId],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
  {
    ruleId: "provenance-chain",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      if (input.context?.requiresParentProvenance && !input.context?.parentRef) {
        return {
          passed: false,
          findings: [
            {
              code: "PROVENANCE_GAP",
              classification: "PROVENANCE_GAP",
              title: "Missing parent provenance",
              description: "Derived artifact lacks parent provenance reference.",
              severity: "CRITICAL",
              justification: "parentRef missing in audit context",
              decisionRefs: [...input.stateView.decisionIds],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
  {
    ruleId: "market-blindness",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      if (!input.context?.requiresMarketBlindness) return { passed: true };
      if (input.context?.marketDataPresent) {
        return {
          passed: false,
          findings: [
            {
              code: "MARKET_BLINDNESS_VIOLATION",
              classification: "POLICY_VIOLATION",
              title: "Market data present under blindness policy",
              description: "Policy required market blindness but market data was present.",
              severity: "CRITICAL",
              justification: "marketDataPresent=true",
              policyRefs: [{ refType: "POLICY", id: input.trace?.policyId ?? "unknown" }],
              decisionRefs: input.trace ? [input.trace.decisionId] : [],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
];

/** Research Engine pattern */
export const researchEngineAuditRules: readonly AuditRuleEvaluator[] = [
  {
    ruleId: "disposition-evidence-support",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      const disposition = input.context?.hypothesisDisposition as string | undefined;
      if (disposition === "KILL" && input.stateView.evidenceIds.length === 0) {
        return {
          passed: false,
          findings: [
            {
              code: "KILL_WITHOUT_EVIDENCE",
              classification: "EVIDENCE_GAP",
              title: "Negative disposition without supporting evidence",
              description: "Disposition KILL recorded without evidence in governed state.",
              severity: "HIGH",
              justification: "hypothesisDisposition=KILL, evidenceIds empty",
              decisionRefs: [...input.stateView.decisionIds],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
  {
    ruleId: "authority-at-decision-time",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      if (input.stateView.authorityRefs.length === 0) {
        return {
          passed: false,
          findings: [
            {
              code: "AUTHORITY_MISSING",
              classification: "AUTHORITY_VIOLATION",
              title: "No authority reference in governed state",
              description: "Trace lacks authority check reference.",
              severity: "HIGH",
              justification: "authorityRefs empty",
              authorityRefs: [],
              decisionRefs: [...input.stateView.decisionIds],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
];

/** Trading Bot pattern */
export const tradingBotAuditRules: readonly AuditRuleEvaluator[] = [
  {
    ruleId: "execution-chain-reconstruction",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      const trace = input.trace;
      if (!trace) return { passed: true };
      if (trace.actionId && !trace.authorizationId) {
        return {
          passed: false,
          findings: [
            {
              code: "EXECUTION_WITHOUT_AUTHORIZATION",
              classification: "EXECUTION_VIOLATION",
              title: "Action without authorization reference",
              description: "Execution reference present but authorization missing from trace.",
              severity: "CRITICAL",
              justification: `actionId=${trace.actionId}`,
              executionRefs: [trace.actionId],
              decisionRefs: [trace.decisionId],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
  {
    ruleId: "outcome-evaluation-loop",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      const trace = input.trace;
      if (!trace?.actionId) return { passed: true };
      if (!trace.evaluationId) {
        return {
          passed: false,
          findings: [
            {
              code: "EXECUTION_NOT_EVALUATED",
              classification: "EVALUATION_GAP",
              title: "Executed action lacks evaluation",
              description: "Execution occurred but no evaluation reference in trace.",
              severity: "MEDIUM",
              justification: "evaluationId missing",
              executionRefs: [trace.actionId],
              outcomeRefs: trace.outcomeId ? [trace.outcomeId] : [],
              decisionRefs: [trace.decisionId],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
];

/** JipComply pattern */
export const jipComplyAuditRules: readonly AuditRuleEvaluator[] = [
  {
    ruleId: "temporal-rule-version",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      const expected = input.context?.expectedPolicyVersion as string | undefined;
      const trace = input.trace;
      if (!expected || !trace) return { passed: true };
      if (trace.policyVersion !== expected) {
        return {
          passed: false,
          findings: [
            {
              code: "WRONG_RULE_VERSION",
              classification: "TEMPORAL_VIOLATION",
              title: "Incorrect temporal rule version",
              description: "Decision used policy version different from required temporal version.",
              severity: "HIGH",
              justification: `expected=${expected}, actual=${trace.policyVersion}`,
              policyRefs: [
                { refType: "POLICY", id: trace.policyId },
                { refType: "POLICY_RULE", id: trace.policyVersion },
              ],
              decisionRefs: [trace.decisionId],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
  {
    ruleId: "mandatory-evidence-gates",
    version: "1.0.0",
    deterministic: true,
    evaluate(input) {
      const mandatory = input.context?.mandatoryEvidenceKinds as string[] | undefined;
      if (!mandatory?.length) return { passed: true };
      const kinds = (input.context?.presentEvidenceKinds as string[] | undefined) ?? [];
      const missing = mandatory.filter((k) => !kinds.includes(k));
      if (missing.length) {
        return {
          passed: false,
          findings: [
            {
              code: "MANDATORY_EVIDENCE_MISSING",
              classification: "EVIDENCE_GAP",
              title: "Mandatory evidence kinds missing",
              description: "Policy required evidence kinds not present in governed state.",
              severity: "HIGH",
              justification: `missing=${missing.join(",")}`,
              evidenceRefs: [...input.stateView.evidenceIds],
              decisionRefs: [...input.stateView.decisionIds],
            },
          ],
        };
      }
      return { passed: true };
    },
  },
];
