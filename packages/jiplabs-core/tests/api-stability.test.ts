import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CORE_API_CHANNEL,
  CORE_EXPERIMENTAL_EXPORTS,
  CORE_RELEASE_LINE,
  coreApiStability,
  isCoreExperimentalExport,
} from "../src/index.js";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function extractPublicExports(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/export (?:type )?\{([^}]+)\}/g)) {
    for (const part of match[1]!.split(",")) {
      const token = part.trim();
      if (!token) continue;
      const name = token.includes(" as ")
        ? token.split(" as ").pop()!.trim()
        : token.replace(/^type\s+/, "").split(/\s+/).pop()!.replace(/,$/, "");
      if (name && name !== "type") names.add(name);
    }
  }
  return [...names].sort();
}

describe("CORE-STAB-01 API stability classification", () => {
  const publicExports = extractPublicExports(
    readFileSync(join(srcRoot, "index.ts"), "utf8"),
  );

  it("publishes the stable 1.0 channel metadata", () => {
    expect(CORE_RELEASE_LINE).toBe("1.0");
    expect(CORE_API_CHANNEL).toBe("stable");
  });

  it("classifies every public root export", () => {
    expect(publicExports.length).toBeGreaterThan(200);
    for (const name of publicExports) {
      const stability = coreApiStability(name);
      expect(stability === "STABLE_1_0" || stability === "EXPERIMENTAL").toBe(true);
    }
  });

  it("every experimental name is actually exported from the root", () => {
    for (const name of CORE_EXPERIMENTAL_EXPORTS) {
      expect(publicExports, `missing experimental export ${name}`).toContain(name);
    }
  });

  it("stable 1.0 integration APIs are not experimental", () => {
    for (const name of [
      "evaluateDomainDecisionAuthorization",
      "GovernorKernel",
      "buildDecisionTrace",
      "reconstructDecisionFromSnapshot",
      "createDecisionProposal",
      "createEvidence",
      "createAuthorityGrant",
      "createPolicyVersion",
    ]) {
      expect(isCoreExperimentalExport(name)).toBe(false);
      expect(publicExports).toContain(name);
    }
  });

  it("CORE-03 and CORE-04 names are experimental", () => {
    expect(isCoreExperimentalExport("EvaluationCorpus")).toBe(true);
    expect(isCoreExperimentalExport("GovernedComponentRegistry")).toBe(true);
    expect(isCoreExperimentalExport("createFallbackRelationship")).toBe(true);
    expect(isCoreExperimentalExport("createReplacementProposal")).toBe(true);
  });
});
