import { sha256Canonical, type IsoTimestamp, type SubjectRef } from "@jiplabs/core";

export const COMMERCIAL_JURISDICTION_POLICY_ID = "commercial-jurisdiction" as const;

export const CommercialReasonCode = {
  JURISDICTION_RESTRICTED: "JURISDICTION_RESTRICTED",
  REGIONAL_RESTRICTION: "REGIONAL_RESTRICTION",
  PROVIDER_RESTRICTION: "PROVIDER_RESTRICTION",
  INSUFFICIENT_CONTEXT: "INSUFFICIENT_CONTEXT",
  CONFLICTING_CONTEXT: "CONFLICTING_CONTEXT",
  POLICY_REVIEW_REQUIRED: "POLICY_REVIEW_REQUIRED",
  INVALID_CONTEXT: "INVALID_CONTEXT",
} as const;

export type CommercialReasonCode =
  (typeof CommercialReasonCode)[keyof typeof CommercialReasonCode];

export type CommercialCountrySignalKind =
  | "RESIDENCE"
  | "ORGANISATION"
  | "BILLING"
  | "SERVICE_JURISDICTION";

export type CommercialCountrySignal = {
  readonly kind: CommercialCountrySignalKind;
  readonly country: string;
};

export type CommercialEligibilityContext = {
  readonly subject?: SubjectRef;
  readonly contextRef?: string;
  readonly residenceCountry?: string;
  readonly organisationCountry?: string;
  readonly billingCountry?: string;
  readonly serviceJurisdiction?: string;
  readonly countrySignals?: readonly CommercialCountrySignal[];
  readonly paymentContext?: {
    readonly provider?: string;
    readonly present: boolean;
  };
  readonly evidenceRefs?: readonly string[];
};

export type CommercialJurisdictionPolicyDefinition = {
  readonly policyId: typeof COMMERCIAL_JURISDICTION_POLICY_ID;
  readonly policyVersion: string;
  readonly restrictedCountries: readonly string[];
  readonly reviewCountries: readonly string[];
};

export function normalizeCountryCode(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  if (!value) return null;
  if (!/^[A-Z]{2}$/.test(value)) return null;
  return value;
}

export function commercialJurisdictionContentHash(
  definition: CommercialJurisdictionPolicyDefinition,
): string {
  return sha256Canonical({
    policyId: definition.policyId,
    policyVersion: definition.policyVersion,
    restrictedCountries: [...definition.restrictedCountries].map((c) =>
      c.toUpperCase(),
    ).sort(),
    reviewCountries: [...definition.reviewCountries].map((c) =>
      c.toUpperCase(),
    ).sort(),
  });
}

export type CollectedCountrySignals = {
  readonly byKind: Readonly<Record<CommercialCountrySignalKind, readonly string[]>>;
  readonly consideredSignalKinds: readonly CommercialCountrySignalKind[];
  readonly allCountries: readonly string[];
  readonly invalidValues: readonly string[];
  readonly conflictingKinds: readonly CommercialCountrySignalKind[];
};

const SIGNAL_KINDS: readonly CommercialCountrySignalKind[] = [
  "RESIDENCE",
  "ORGANISATION",
  "BILLING",
  "SERVICE_JURISDICTION",
];

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

export function collectCountrySignals(
  context: CommercialEligibilityContext,
): CollectedCountrySignals {
  const buckets: Record<CommercialCountrySignalKind, string[]> = {
    RESIDENCE: [],
    ORGANISATION: [],
    BILLING: [],
    SERVICE_JURISDICTION: [],
  };
  const invalidValues: string[] = [];

  const named: readonly [CommercialCountrySignalKind, string | undefined][] = [
    ["RESIDENCE", context.residenceCountry],
    ["ORGANISATION", context.organisationCountry],
    ["BILLING", context.billingCountry],
    ["SERVICE_JURISDICTION", context.serviceJurisdiction],
  ];
  for (const [kind, raw] of named) {
    if (raw === undefined) continue;
    const normalized = normalizeCountryCode(raw);
    if (normalized) pushUnique(buckets[kind], normalized);
    else invalidValues.push(raw);
  }
  for (const signal of context.countrySignals ?? []) {
    const normalized = normalizeCountryCode(signal.country);
    if (normalized) pushUnique(buckets[signal.kind], normalized);
    else invalidValues.push(signal.country);
  }

  const conflictingKinds = SIGNAL_KINDS.filter(
    (kind) => buckets[kind].length > 1,
  );
  const consideredSignalKinds = SIGNAL_KINDS.filter(
    (kind) => buckets[kind].length > 0,
  );
  const allCountries: string[] = [];
  for (const kind of SIGNAL_KINDS) {
    for (const country of buckets[kind]) {
      pushUnique(allCountries, country);
    }
  }

  return {
    byKind: {
      RESIDENCE: Object.freeze([...buckets.RESIDENCE]),
      ORGANISATION: Object.freeze([...buckets.ORGANISATION]),
      BILLING: Object.freeze([...buckets.BILLING]),
      SERVICE_JURISDICTION: Object.freeze([...buckets.SERVICE_JURISDICTION]),
    },
    consideredSignalKinds: Object.freeze([...consideredSignalKinds]),
    allCountries: Object.freeze(allCountries),
    invalidValues: Object.freeze([...invalidValues]),
    conflictingKinds: Object.freeze([...conflictingKinds]),
  };
}

export function hasRequiredCountryContext(
  collected: CollectedCountrySignals,
): boolean {
  return (
    collected.byKind.RESIDENCE.length > 0 ||
    collected.byKind.ORGANISATION.length > 0
  );
}

export function billingRequiredAndMissing(
  context: CommercialEligibilityContext,
  collected: CollectedCountrySignals,
): boolean {
  return Boolean(context.paymentContext?.present) && collected.byKind.BILLING.length === 0;
}

/** Opaque context identifier for audit — hashes signals, not extra PII. */
export function commercialContextFingerprint(
  context: CommercialEligibilityContext,
  collected: CollectedCountrySignals,
  evaluatedAt: IsoTimestamp,
): string {
  return sha256Canonical({
    subject: context.subject ?? null,
    contextRef: context.contextRef ?? null,
    byKind: collected.byKind,
    invalidValues: collected.invalidValues,
    paymentProvider: context.paymentContext?.provider ?? null,
    paymentPresent: context.paymentContext?.present ?? null,
    evaluatedAt,
  });
}
