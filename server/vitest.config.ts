import { defaultExclude, defineConfig } from "vitest/config";

// watch.test.ts opens a real chokidar watcher and waits on its next fs event. Traced with
// timestamped file-based logging: the write always happens and the test's own 30s timer always
// fires within a few ms of on schedule, so the process's event loop is not stalled - but the
// chokidar/fsevents callback for that write is sometimes never delivered at all, not merely late.
// Root cause: OS-level scheduling starves the native fsevents callback under heavy CPU contention -
// reproduced with coverage off too, so it is not particular to this suite's instrumentation, and
// not a defect in the test or the watcher. Sequencing this one file alone removes the one source of
// contention this suite controls - the other 55 coverage-instrumented files competing for the same
// cores at the exact moment a freshly registered watcher needs the OS to schedule its first native
// event - but cannot remove contention from outside this run; see docs/PROCESS.md.
const WATCH_TEST = "test/vault/watch.test.ts";

export default defineConfig({
  test: {
    // The default 5s is wall-clock, and the parallel coverage run can starve a forked worker on
    // a slow or busy machine - a millisecond test then times out. No test here legitimately runs
    // long, so a generous limit hides nothing; a real hang still fails. Raised in step with the
    // watch suite's own 30s hang detector, so that detector's message can surface instead of
    // vitest's own timeout racing it.
    testTimeout: 40_000,
    // stand.ts's veraltet signal compares LOCAL calendar days, and stand.test.ts's day-boundary
    // cases only discriminate a correct localDay from a UTC-based one when local time differs
    // from UTC. The dev machine is Europe/Berlin; GitHub's runners are UTC with no TZ set (grep
    // confirms nothing in this repo pins one) - without this pin those tests pass against a wrong
    // implementation on the very runner that gates the merge. Verified in the installed vitest
    // 4.1.11 source (cli-api.CnMVyzaz.js): a worker's env is `{...process.env, ...options.env,
    // ...ctx.config.env, ...project.config.env}`, so this root-level value overrides the shell's
    // own TZ and reaches every project below (both "unit" and "watch") without repeating it in
    // each - and it equals the dev machine's zone, so no local behaviour changes.
    env: { TZ: "Europe/Berlin" },
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
        "src/kontext/fixture/**",
      ],
      thresholds: { statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [...defaultExclude, WATCH_TEST],
        },
      },
      {
        extends: true,
        test: {
          name: "watch",
          include: [WATCH_TEST],
          fileParallelism: false,
          // Scoped to this project only: the proven cause is OS-level scheduling starvation of
          // the fsevents callback under CPU contention, reproduced with coverage off, so the
          // retry covers the machine, not a defect in the test or the watcher - the sequencing
          // above already removed the suite's own contribution to that contention.
          retry: 1,
        },
      },
    ],
  },
});
