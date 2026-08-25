export { checkpointForState, type RecoveryCheckpoint } from "../governor/states.js";
export type { GovernanceRun } from "../governor/runtime-state.js";

import type { RecoveryCheckpoint } from "../governor/states.js";

export function canResumeFromCheckpoint(
  checkpoint: RecoveryCheckpoint | null,
): boolean {
  return checkpoint !== null;
}
