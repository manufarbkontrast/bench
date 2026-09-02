import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The default 5s is wall-clock, and the parallel coverage run can starve a forked worker on
    // a slow or busy machine - a millisecond test then times out. No test here legitimately runs
    // long, so a generous limit hides nothing; a real hang still fails. Raised in step with the
    // watch suite's own 30s hang detector, so that detector's message can surface instead of
    // vitest's own timeout racing it.
    testTimeout: 40_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // The vault and Plaud fixtures are markdown, SVG and JSON data, not source - v8 tries to
      // parse every included file that no test imported and fails loudly on each one otherwise.
      exclude: [
        "src/index.ts",
        "src/vault/fixture/**",
        "src/aufgaben/fixture/**",
        "src/eingang/fixture/**",
      ],
      thresholds: { statements: 80 },
    },
  },
});
