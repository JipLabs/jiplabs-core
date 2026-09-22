import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@jiplabs/core": join(
        dirname(fileURLToPath(import.meta.url)),
        "../jiplabs-core/src/index.ts",
      ),
    },
  },
});
