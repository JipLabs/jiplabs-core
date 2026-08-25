/**
 * Extensible capability identifiers.
 * Core treats capabilities as opaque stable namespaced strings.
 * Domains may introduce new capabilities without modifying Core source.
 */
export type CapabilityId = string;

/** Convenience constants — not an exhaustive or closed set. */
export const WellKnownCapability = {
  OBSERVE: "OBSERVE",
  FORM_HYPOTHESIS: "FORM_HYPOTHESIS",
  REGISTER_EXPERIMENT: "REGISTER_EXPERIMENT",
  EXECUTE_EXPERIMENT: "EXECUTE_EXPERIMENT",
  EVALUATE_EXPERIMENT: "EVALUATE_EXPERIMENT",
  PROPOSE_CHALLENGER: "PROPOSE_CHALLENGER",
  PROMOTE_MODEL: "PROMOTE_MODEL",
  DEMOTE_MODEL: "DEMOTE_MODEL",
  ROLLBACK_MODEL: "ROLLBACK_MODEL",
  ACQUIRE_DATA: "ACQUIRE_DATA",
  MODIFY_POLICY: "MODIFY_POLICY",
  OVERRIDE_DECISION: "OVERRIDE_DECISION",
  MODEL_GOVERNANCE: "MODEL_GOVERNANCE",
} as const satisfies Record<string, CapabilityId>;

/** @deprecated Use CapabilityId — retained for backward compatibility. */
export type AuthorityScope = CapabilityId;

export function isCapabilityId(value: string): value is CapabilityId {
  return value.trim().length > 0;
}
