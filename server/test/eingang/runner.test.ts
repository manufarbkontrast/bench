import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { getJob, openEingangDb, type JobRow } from "../../src/eingang/db.js";
import {
  JOB_TIMEOUTS_MS,
  type JobKind,
  type JobPlan,
} from "../../src/eingang/jobs.js";
import {
  createRunner,
  type RunnerInternals,
} from "../../src/eingang/runner.js";
import { scratchDir } from "./tmp.js";

const FAKE_JOB_PATH = fileURLToPath(
  new URL("../../src/eingang/fixture/fake-job.mjs", import.meta.url),
);

const scratch = scratchDir("bench-eingang-runner-");
afterAll(scratch.cleanup);

const neverCalled: RunnerInternals["vault-reindex"] = () =>
  Promise.reject(new Error("this internal job was not meant to run"));

let n = 0;
/** A fresh jobs dir and an in-memory db per test, so job ids never collide across tests. */
function newRunner(overrides: Partial<RunnerInternals> = {}) {
  n += 1;
  const jobsDir = path.join(scratch.dir, `jobs-${n}`);
  const db = openEingangDb(":memory:");
  const runner = createRunner(db, jobsDir, {
    "vault-reindex": overrides["vault-reindex"] ?? neverCalled,
    "projekte-scan": overrides["projekte-scan"] ?? neverCalled,
  });
  return { db, jobsDir, runner };
}

function fakePlan(
  kind: JobKind,
  mode?: "fail" | "hang",
): {
  plan: JobPlan;
  env: NodeJS.ProcessEnv;
} {
  return {
    plan: {
      kind: "spawn",
      argv: [process.execPath, FAKE_JOB_PATH, kind],
      cwd: scratch.dir,
    },
    env: mode ? { ...process.env, BENCH_FAKE_JOB: mode } : { ...process.env },
  };
}

/**
 * The runner's public interface has no completion callback - start() returns while the job is
 * still running - so a test has to poll the row until it leaves "running". Generous because the
 * fixture's normal run alone takes three seconds.
 */
async function waitForTerminal(
  db: Parameters<typeof getJob>[0],
  id: number,
  timeoutMs = 10_000,
): Promise<JobRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = getJob(db, id);
    if (row && row.status !== "running") return row;
    if (Date.now() > deadline)
      throw new Error(
        `job ${id} did not leave "running" within ${timeoutMs}ms`,
      );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("createRunner - spawned jobs", () => {
  it("a completed run finishes done with exit 0 and the log capturing its output", async () => {
    const { db, runner } = newRunner();
    const { plan, env } = fakePlan("plaud-sync");

    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      env,
      JOB_TIMEOUTS_MS["plaud-sync"],
    );
    expect(started.status).toBe("running");

    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("done");
    expect(finished.exitCode).toBe(0);
    expect(finished.finishedAt).toEqual(expect.any(Number));

    const log = readFileSync(finished.logPath, "utf8");
    expect(log).toContain("fake-job start plaud-sync");
  }, 10_000); // The fixture's normal run alone takes three seconds.

  it("BENCH_FAKE_JOB=fail exits 2 and finishes failed", async () => {
    const { db, runner } = newRunner();
    const { plan, env } = fakePlan("plaud-sync", "fail");

    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      env,
      JOB_TIMEOUTS_MS["plaud-sync"],
    );
    const finished = await waitForTerminal(db, started.id);

    expect(finished.status).toBe("failed");
    expect(finished.exitCode).toBe(2);
  }, 10_000);

  it("kill() on a hanging job marks it killed and preserves the log up to the kill", async () => {
    const { db, runner } = newRunner();
    const { plan, env } = fakePlan("plaud-sync", "hang");

    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      env,
      JOB_TIMEOUTS_MS["plaud-sync"],
    );
    // Give the process a moment to print its start line before it is killed.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(runner.kill(started.id)).toBe(true);

    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("killed");

    const log = readFileSync(finished.logPath, "utf8");
    expect(log).toContain("fake-job start plaud-sync");
  }, 10_000);

  it("kill() on a job that is not running returns false", () => {
    const { runner } = newRunner();
    expect(runner.kill(999_999)).toBe(false);
  });

  it("a 1s timeout on a hanging job fires and marks it timeout", async () => {
    const { db, runner } = newRunner();
    const { plan, env } = fakePlan("plaud-sync", "hang");

    const started = runner.start("plaud-sync", "{}", plan, env, 1000);
    const finished = await waitForTerminal(db, started.id);

    expect(finished.status).toBe("timeout");
  }, 10_000);

  it("isRunning is true while the job is alive and false once it finishes", async () => {
    const { db, runner } = newRunner();
    const { plan, env } = fakePlan("plaud-sync");

    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      env,
      JOB_TIMEOUTS_MS["plaud-sync"],
    );
    expect(runner.isRunning("plaud-sync")).toBe(true);

    await waitForTerminal(db, started.id);
    expect(runner.isRunning("plaud-sync")).toBe(false);
  }, 10_000);
});

describe("createRunner - internal jobs", () => {
  it("streams timestamped log lines to the job's log file and finishes done", async () => {
    const { db, runner } = newRunner({
      "vault-reindex": (log) => {
        log("indexing");
        log("done indexing");
        return Promise.resolve();
      },
    });

    const started = runner.start(
      "vault-reindex",
      "{}",
      { kind: "internal", name: "vault-reindex" },
      {},
      JOB_TIMEOUTS_MS["vault-reindex"],
    );
    const finished = await waitForTerminal(db, started.id);

    expect(finished.status).toBe("done");
    const lines = readFileSync(finished.logPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\S+ indexing$/);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\S+ done indexing$/);
  });

  it("a rejected internal job finishes failed with the error logged", async () => {
    const { db, runner } = newRunner({
      "projekte-scan": () => Promise.reject(new Error("boom")),
    });

    const started = runner.start(
      "projekte-scan",
      "{}",
      { kind: "internal", name: "projekte-scan" },
      {},
      JOB_TIMEOUTS_MS["projekte-scan"],
    );
    const finished = await waitForTerminal(db, started.id);

    expect(finished.status).toBe("failed");
    const log = readFileSync(finished.logPath, "utf8");
    expect(log).toContain("boom");
  });
});
