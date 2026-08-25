import { envelope, freezeDeep, requireNonEmpty } from "../envelope.js";
import type { EntityEnvelope, IsoTimestamp, Provenance } from "../schema.js";

export type ActorType =
  | "SYSTEM_AGENT"
  | "DOMAIN_GOVERNOR"
  | "EXECUTOR"
  | "EVALUATOR"
  | "HUMAN"
  | "EXTERNAL_SYSTEM";

/**
 * Durable actor identity. Scopes here are identity scopes (what the actor
 * may be granted authority for), never implicit global authority.
 */
export type Actor = EntityEnvelope & {
  readonly type: ActorType;
  readonly code: string;
  readonly scopes: readonly string[];
  readonly displayName?: string;
  readonly active: boolean;
};

const ACTOR_TYPES: readonly ActorType[] = [
  "SYSTEM_AGENT",
  "DOMAIN_GOVERNOR",
  "EXECUTOR",
  "EVALUATOR",
  "HUMAN",
  "EXTERNAL_SYSTEM",
];

export function createActor(input: {
  readonly id: string;
  readonly type: ActorType;
  readonly code: string;
  readonly scopes: readonly string[];
  readonly createdAt: IsoTimestamp;
  readonly recordedAt?: IsoTimestamp;
  readonly provenance: Provenance;
  readonly displayName?: string;
  readonly active?: boolean;
}): Actor {
  if (!ACTOR_TYPES.includes(input.type)) {
    throw new Error(`invalid actor type: ${String(input.type)}`);
  }
  return freezeDeep({
    ...envelope(input),
    type: input.type,
    code: requireNonEmpty(input.code, "code"),
    scopes: Object.freeze([...input.scopes]),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    active: input.active ?? true,
  });
}
