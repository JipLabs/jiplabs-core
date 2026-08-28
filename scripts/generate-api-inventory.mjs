import { readFileSync, writeFileSync } from "node:fs";

const index = readFileSync("packages/jiplabs-core/src/index.ts", "utf8");
const names = new Set();
for (const m of index.matchAll(/export (?:type )?\{([^}]+)\}/g)) {
  for (const p of m[1].split(",")) {
    const t = p.trim();
    if (!t) continue;
    const name = t.includes(" as ")
      ? t.split(" as ").pop().trim()
      : t.replace(/^type\s+/, "").split(/\s+/).pop().replace(/,$/, "");
    if (name && name !== "type") names.add(name);
  }
}

const expSrc = readFileSync("packages/jiplabs-core/src/api-stability.ts", "utf8");
const expSet = new Set(
  [...expSrc.matchAll(/"([A-Za-z0-9_]+)"/g)]
    .map((m) => m[1])
    .filter((n) => !["1.0", "rc", "stable", "STABLE_1_0", "EXPERIMENTAL"].includes(n)),
);

const all = [...names].sort();
const experimental = all.filter((n) => expSet.has(n));
const stable = all.filter((n) => !expSet.has(n));
const missing = [...expSet].filter((n) => !names.has(n));

function cat(n) {
  const s = n.toLowerCase();
  if (
    n.startsWith("CORE_") ||
    n.includes("Experimental") ||
    n.includes("ApiStability") ||
    n === "coreApiStability" ||
    n === "isCoreExperimentalExport"
  ) {
    return "stability-metadata";
  }
  if (s.includes("actor")) return "actor";
  if (s.includes("authorit") || s.includes("grant") || s.includes("capability")) return "authority";
  if (s.includes("policy") || s.includes("gate") || s.includes("autonomy") || s.includes("failurebehavior")) {
    return "policy";
  }
  if (s.includes("evidence") || s.includes("observation")) return "evidence";
  if (s.includes("proposal") || s.includes("decision")) return "decision";
  if (s.includes("action") || s.includes("execut") || s.includes("claim") || s.includes("governedaction")) {
    return "authorization-execution";
  }
  if (
    s.includes("outcome") ||
    n === "Evaluation" ||
    n === "createEvaluation" ||
    n.includes("CoreEvaluation") ||
    s.includes("disposition") ||
    s.includes("verdict")
  ) {
    return "outcome-evaluation";
  }
  if (
    s.includes("rollback") ||
    s.includes("override") ||
    s.includes("challenge") ||
    s.includes("amendment") ||
    s.includes("revocation")
  ) {
    return "override-rollback";
  }
  if (s.includes("ledger") || s.includes("trace") || s.includes("event")) return "ledger-trace";
  if (
    s.includes("governor") ||
    s.includes("kernel") ||
    s.includes("checkpoint") ||
    s.includes("fingerprint") ||
    s.includes("idempotency") ||
    s.includes("transition") ||
    s.includes("recovery") ||
    n.includes("GovernanceRun") ||
    n.includes("KernelState") ||
    n.includes("ExecutionAttempt")
  ) {
    return "kernel-runtime";
  }
  if (
    s.includes("sqlite") ||
    s.includes("persist") ||
    s.includes("replay") ||
    s.includes("schema") ||
    s.includes("storage") ||
    s.includes("integrity") ||
    s.includes("migration")
  ) {
    return "durable-storage";
  }
  if (s.includes("domain") || s.includes("adapter")) return "domain-adapter";
  if (s.includes("error")) return "errors";
  if (
    s.includes("envelope") ||
    s.includes("timestamp") ||
    s.includes("json") ||
    s.includes("provenance") ||
    s.includes("iso") ||
    s.includes("compareiso") ||
    n === "Ref" ||
    n === "ResourceRef" ||
    n === "SubjectRef" ||
    n === "EntityEnvelope"
  ) {
    return "schema";
  }
  return "other";
}

let md = `# Public API inventory — @jiplabs/core 1.0.0

Classification: every root export is either \`STABLE_1_0\` or \`EXPERIMENTAL\`. None are internalized or removed in 1.0.0.

| Counts | |
|---|---|
| STABLE_1_0 | ${stable.length} |
| EXPERIMENTAL | ${experimental.length} |
| Total root exports | ${all.length} |

Export path: \`@jiplabs/core\`. Experimental aliases also: \`@jiplabs/core/experimental\`.

Intended 1.0 status matches the classification. Consumers: JipComply and Quinté Lab use the authorize-only stable subset; they also touch experimental corpus/registry only as in-memory bootstrap.

## STABLE_1_0

| Symbol | Category | 1.0 status |
|---|---|---|
`;

for (const n of stable) {
  md += `| \`${n}\` | ${cat(n)} | STABLE_1_0 |\n`;
}

md += `
## EXPERIMENTAL

| Symbol | Area | 1.0 status |
|---|---|---|
`;

for (const n of experimental) {
  const area = /eval|corpus|baseline|regression|learning|candidate|suite|target/i.test(n)
    ? "CORE-03-corpus"
    : "CORE-04-registry";
  md += `| \`${n}\` | ${area} | EXPERIMENTAL |\n`;
}

if (missing.length) {
  md += `\nWARNING — experimental list names missing from barrel: ${missing.join(", ")}\n`;
}

writeFileSync("docs/API-INVENTORY.md", md);
console.log({
  stable: stable.length,
  experimental: experimental.length,
  total: all.length,
  missing,
});
