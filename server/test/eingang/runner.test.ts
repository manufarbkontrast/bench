import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
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

// Only createWriteStream is overridden, and only for the one test that needs a stream it can
// break on demand - every other call goes straight through to the real implementation, so the
// rest of the suite still writes real log files. vi.mock is hoisted above these imports, so the
// createWriteStream imported below is already the mock.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, createWriteStream: vi.fn(actual.createWriteStream) };
});
const mockedCreateWriteStream = vi.mocked(createWriteStream);

const FAKE_JOB_PATH = fileURLToPath(
  new URL("../../src/eingang/fixture/fake-job.mjs", import.meta.url),
);
const HANG_HARD_PATH = fileURLToPath(
  new URL("../../src/eingang/fixture/hang-hard.mjs", import.meta.url),
);

const scratch = scratchDir("bench-eingang-runner-");
afterAll(scratch.cleanup);

const neverCalled: RunnerInternals["vault-reindex"] = () =>
  Promise.reject(new Error("this internal job was not meant to run"));

let n = 0;
/** A fresh jobs dir and an in-memory db per test, so job ids never collide across tests. */
function newRunner(
  overrides: Partial<RunnerInternals> = {},
  killEscalationMs?: number,
) {
  n += 1;
  const jobsDir = path.join(scratch.dir, `jobs-${n}`);
  const db = openEingangDb(":memory:");
  const runner = createRunner(
    db,
    jobsDir,
    {
      "vault-reindex": overrides["vault-reindex"] ?? neverCalled,
      "projekte-scan": overrides["projekte-scan"] ?? neverCalled,
    },
    killEscalationMs,
  );
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

/** Polls the log file instead of a fixed sleep, so the kill test only waits as long as the
    fixture actually takes to print its first line. */
async function waitForLogToContain(
  logPath: string,
  text: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(logPath) && readFileSync(logPath, "utf8").includes(text))
      return;
    if (Date.now() > deadline)
      throw new Error(`log ${logPath} never contained ${JSON.stringify(text)}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
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

  it("a spawn failure (missing binary) fails the job instead of crashing the server", async () => {
    const { db, runner } = newRunner();
    const plan: JobPlan = {
      kind: "spawn",
      argv: ["/no/such/bench-eingang-runner-test-binary", "plaud-sync"],
      cwd: scratch.dir,
    };

    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      { ...process.env },
      JOB_TIMEOUTS_MS["plaud-sync"],
    );
    // Reaching this line for every other test in the file is itself evidence the process is
    // still alive - an unhandled "error" event on the child would have crashed the whole
    // vitest worker rather than let this (or any later) test run.
    const finished = await waitForTerminal(db, started.id);

    expect(finished.status).toBe("failed");
    const log = readFileSync(finished.logPath, "utf8");
    expect(log).toContain("error:");
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
    await waitForLogToContain(started.logPath, "fake-job start plaud-sync");

    expect(runner.kill(started.id)).toBe("killed");

    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("killed");

    const log = readFileSync(finished.logPath, "utf8");
    expect(log).toContain("fake-job start plaud-sync");
  }, 10_000);

  it("kill() on a job that is not running returns not_running", () => {
    const { runner } = newRunner();
    expect(runner.kill(999_999)).toBe("not_running");
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

  it("kill() on a running internal job returns 'internal' and does not stop it", async () => {
    let resolveJob: (() => void) | undefined;
    const { db, runner } = newRunner({
      "vault-reindex": () =>
        new Promise<void>((resolve) => {
          resolveJob = resolve;
        }),
    });

    const started = runner.start(
      "vault-reindex",
      "{}",
      { kind: "internal", name: "vault-reindex" },
      {},
      JOB_TIMEOUTS_MS["vault-reindex"],
    );

    expect(runner.kill(started.id)).toBe("internal");
    expect(runner.isRunning("vault-reindex")).toBe(true);

    resolveJob?.();
    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("done");
  });
});

describe("createRunner - SIGKILL escalation", () => {
  // Proves the fixture itself is not vacuous: if hang-hard.mjs did honour SIGTERM, test (b) below
  // would pass even with escalateKill's SIGKILL never wired up, and the delivery would go
  // unproven.
  it("hang-hard.mjs really does ignore SIGTERM", async () => {
    const child = spawn(process.execPath, [HANG_HARD_PATH]);
    try {
      child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(child.exitCode).toBeNull();
    } finally {
      // In a finally so a failing assertion above cannot orphan a spinning child - this suite is
      // precisely the one that runs under the CPU load most likely to trip that assertion.
      child.kill("SIGKILL");
    }
  });

  it("kill() escalates to SIGKILL after the grace period, on a child that ignores SIGTERM", async () => {
    const { db, runner } = newRunner({}, 200);
    const plan: JobPlan = {
      kind: "spawn",
      argv: [process.execPath, HANG_HARD_PATH],
      cwd: scratch.dir,
    };

    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      { ...process.env },
      JOB_TIMEOUTS_MS["plaud-sync"],
    );
    await waitForLogToContain(started.logPath, "hang-hard: alive");

    expect(runner.kill(started.id)).toBe("killed");

    // A SIGTERM-ignoring child can only leave "running" once the grace period elapses and
    // escalateKill's SIGKILL actually lands - this is what proves delivery, not just the call.
    const finished = await waitForTerminal(db, started.id, 5000);
    expect(finished.status).toBe("killed");
  }, 10_000);
});

describe("createRunner - a broken log stream", () => {
  // A full disk (ENOSPC) or a permissions problem destroys the write stream mid-job on a real
  // machine, which is hard to force portably in a test. This stubs createWriteStream for one call
  // to hand the runner a stream it can break on demand, which is the same shape of failure the
  // real "error" event carries - only the source is faked, not the runner's reaction to it.
  it("is caught, not thrown, and the job still resolves failed", async () => {
    const { db, runner } = newRunner({
      // Never resolves - runInternal's own `void internals[name](log)...` (runner.ts) already
      // voids this handler's promise, and the stream error below ends the job through
      // settle.immediate before this promise could settle anyway, so nothing here awaits it.
      "vault-reindex": () => new Promise<void>(() => undefined),
    });

    let stream: PassThrough | undefined;
    mockedCreateWriteStream.mockImplementationOnce(() => {
      stream = new PassThrough();
      return stream as unknown as ReturnType<typeof createWriteStream>;
    });

    const started = runner.start(
      "vault-reindex",
      "{}",
      { kind: "internal", name: "vault-reindex" },
      {},
      JOB_TIMEOUTS_MS["vault-reindex"],
    );

    stream?.destroy(new Error("ENOSPC: no space left on device"));

    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("failed");
  });
});
