import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The default 5s is wall-clock, and the parallel coverage run can starve a forked worker on
    // a slow or busy machine - a millisecond test then times out. No test here legitimately runs
    // long, so a generous limit hides nothing; a real hang still fails.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // The vault fixture is markdown, SVG and JSON data, not source - v8 tries to parse every
      // included file that no test imported and fails loudly on each one otherwise.
      exclude: ["src/index.ts", "src/vault/fixture/**"],
      thresholds: { statements: 80 },
    },
  },
});
