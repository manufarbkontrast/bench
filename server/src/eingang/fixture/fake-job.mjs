#!/usr/bin/env node
// Stands in for a real spawned job in tests and under sample data (see jobs.ts's fakeSpawn) - no
// dependencies, since it has to run on whatever Node the test runner already has. Three modes,
// picked by BENCH_FAKE_JOB: a normal 3s run, an immediate failure, or a hang for the kill and
// timeout tests to exercise.

const kind = process.argv[2] ?? "unknown";
const mode = process.env.BENCH_FAKE_JOB;

console.log(`fake-job start ${kind}`);

if (mode === "fail") {
  process.exit(2);
}

if (mode === "hang") {
  // Keeps the event loop alive without doing anything - only a signal from the runner ends this.
  setInterval(() => undefined, 1000);
} else {
  let tick = 0;
  const interval = setInterval(() => {
    tick += 1;
    console.log(`fake-job tick ${tick}`);
    if (tick >= 3) {
      clearInterval(interval);
      process.exit(0);
    }
  }, 1000);
}
