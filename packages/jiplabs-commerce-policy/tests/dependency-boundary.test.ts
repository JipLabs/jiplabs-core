import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const coreSrc = join(repoRoot, "packages", "jiplabs-core", "src");
const commerceSrc = join(here, "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".json")) out.push(full);
  }
  return out;
}

describe("dependency boundary", () => {
  it("@jiplabs/core does not import @jiplabs/commerce-policy or product packages", () => {
    const forbidden = [
      "@jiplabs/commerce-policy",
      "jiplabs-account",
      "quinte-lab",
      "jipcomply",
      "jipoffice",
      "jipcontract",
    ];
    for (const file of walk(coreSrc)) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const needle of forbidden) {
        expect(text, file).not.toContain(needle);
      }
    }
  });

  it("@jiplabs/commerce-policy depends on @jiplabs/core and not the reverse", () => {
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["@jiplabs/core"]).toBe("workspace:^1.2.0");

    const corePkg = JSON.parse(
      readFileSync(
        join(repoRoot, "packages", "jiplabs-core", "package.json"),
        "utf8",
      ),
    ) as { dependencies?: Record<string, string> };
    expect(corePkg.dependencies?.["@jiplabs/commerce-policy"]).toBeUndefined();

    let importsCore = false;
    for (const file of walk(commerceSrc)) {
      const text = readFileSync(file, "utf8");
      if (text.includes('from "@jiplabs/core"')) importsCore = true;
    }
    expect(importsCore).toBe(true);
  });
});
