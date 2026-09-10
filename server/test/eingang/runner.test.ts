import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  finishJob,
  getJob,
  insertJob,
  openEingangDb,
  type JobRow,
} from "../../src/eingang/db.js";
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
/** A fresh jobs dir and an in-memory db per test, so job ids never collide across tests.
    `isOurProcess` stands in for the real pid check - the orphan kill tests below drive every
    branch of kill() with a plain function, no real long-lived process required. */
function newRunner(
  overrides: Partial<RunnerInternals> = {},
  killEscalationMs?: number,
  isOurProcess?: (pid: number, startedAt: number) => boolean,
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
      "plaud-fetch": overrides["plaud-fetch"] ?? neverCalled,
    },
    killEscalationMs,
    isOurProcess,
  );
  return { db, jobsDir, runner };
}

let orphanLogN = 0;

/** Inserts a `running` row directly, bypassing start() - the shape a restart-orphaned job's row
    has: nothing in the runner's own in-flight map, only what the database itself says. */
function insertRunningRow(
  db: Parameters<typeof getJob>[0],
  pid: number | null,
  startedAt = Date.now(),
): number {
  orphanLogN += 1;
  const id = insertJob(db, {
    kind: "plaud-sync",
    argsJson: "{}",
    startedAt,
    logPath: path.join(scratch.dir, `orphan-${orphanLogN}.log`),
  });
  if (pid !== null)
    db.prepare("UPDATE jobs SET pid = ? WHERE id = ?").run(pid, id);
  return id;
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

  it("a spawned job's row carries the child's real pid once it starts", async () => {
    const { db, runner } = newRunner();
    const { plan, env } = fakePlan("plaud-sync");

    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      env,
      JOB_TIMEOUTS_MS["plaud-sync"],
    );

    expect(started.pid).toEqual(expect.any(Number));
    expect(started.pid).toBeGreaterThan(0);

    await waitForTerminal(db, started.id);
  }, 10_000);

  it("a spawn failure (missing binary) writes no pid and still reaches failed", async () => {
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
    expect(started.pid).toBeNull();

    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("failed");
    expect(finished.pid).toBeNull();
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
      { kind: "internal", name: "vault-reindex", args: {} },
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
      { kind: "internal", name: "projekte-scan", args: {} },
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
      { kind: "internal", name: "vault-reindex", args: {} },
      {},
      JOB_TIMEOUTS_MS["vault-reindex"],
    );

    expect(runner.kill(started.id)).toBe("internal");
    expect(runner.isRunning("vault-reindex")).toBe(true);

    resolveJob?.();
    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("done");
  });

  it("an internal job's row carries pid: null, since it has no child", async () => {
    const { db, runner } = newRunner({
      "vault-reindex": () => Promise.resolve(),
    });

    const started = runner.start(
      "vault-reindex",
      "{}",
      { kind: "internal", name: "vault-reindex", args: {} },
      {},
      JOB_TIMEOUTS_MS["vault-reindex"],
    );
    expect(started.pid).toBeNull();

    const finished = await waitForTerminal(db, started.id);
    expect(finished.pid).toBeNull();
  });

  it("hands an internal job its plan args", async () => {
    let seen: Record<string, unknown> | null = null;
    const { db, runner } = newRunner({
      "plaud-fetch": (log, args) => {
        seen = args;
        log("ok");
        return Promise.resolve();
      },
    });
    const job = runner.start(
      "plaud-fetch",
      JSON.stringify({ id: "abc" }),
      { kind: "internal", name: "plaud-fetch", args: { id: "abc" } },
      {},
      JOB_TIMEOUTS_MS["plaud-fetch"],
    );
    const finished = await waitForTerminal(db, job.id);
    expect(finished.status).toBe("done");
    expect(seen).toEqual({ id: "abc" });
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
      { kind: "internal", name: "vault-reindex", args: {} },
      {},
      JOB_TIMEOUTS_MS["vault-reindex"],
    );

    stream?.destroy(new Error("ENOSPC: no space left on device"));

    const finished = await waitForTerminal(db, started.id);
    expect(finished.status).toBe("failed");
  });
});

describe("createRunner - kill() on an orphan (no in-flight record)", () => {
  // process.kill is a different function from ChildProcess.kill: the in-flight kill tests above
  // signal through a real child's own .kill(), never through the global process.kill, so spying
  // on it here cannot affect them.
  function spyOnProcessKill() {
    return vi.spyOn(process, "kill").mockImplementation(() => true);
  }

  // escalateOrphanKill's timer belongs to no in-flight record, so nothing cancels it, and unref
  // does not stop it firing inside a worker whose event loop other tests keep alive. It therefore
  // outlives the test that armed it, with that test's process.kill spy already restored - and it
  // really did call the REAL process.kill(424242, "SIGKILL") five seconds after two tests here had
  // ended, invisible only because macOS caps PID_MAX at 99999 while Linux CI's pid_max is
  // 4194304. So every test below that sends a SIGTERM uses a short grace period, and all but one
  // pair it with a verifier that confirms the pid once - for kill()'s own check - and refuses from
  // then on, so the escalation branch never reaches a pid this suite invented. The exception is
  // the test that exists to prove the escalation does fire: it verifies true throughout and is
  // safe instead by awaiting the grace period with its spy still installed, so the SIGKILL lands
  // on the spy rather than on the machine. Its own comment says so at the call site.
  const ORPHAN_ESCALATION_MS = 50;

  function verifiesOnce() {
    let calls = 0;
    return vi.fn(() => {
      calls += 1;
      return calls === 1;
    });
  }

  it("signals a verified orphan pid, marks the row killed, and returns killed", () => {
    const { db, runner } = newRunner({}, ORPHAN_ESCALATION_MS, verifiesOnce());
    const id = insertRunningRow(db, 424_242);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.kill(id)).toBe("killed");
      expect(killSpy).toHaveBeenCalledExactlyOnceWith(424_242, "SIGTERM");

      const row = getJob(db, id)!;
      expect(row.status).toBe("killed");
      expect(row.exitCode).toBeNull();
    } finally {
      killSpy.mockRestore();
    }
  });

  it("returns not_running and sends no signal when verification fails - the pid protects a stranger's process", () => {
    const { db, runner } = newRunner({}, undefined, () => false);
    const id = insertRunningRow(db, 424_243);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.kill(id)).toBe("not_running");
      expect(killSpy).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
    }
  });

  // reconcileRunning runs once, at boot. An orphan confirmed alive there and dead a minute later
  // is reclassified by nothing, so without this the row stays "running" for the life of the
  // server: isRunning(kind) keeps refusing every start of that kind, and the one button that
  // could clear it answers 409 and changes nothing.
  it("finishes a running row whose pid no longer verifies, so its kind is startable again", () => {
    const { db, runner } = newRunner({}, undefined, () => false);
    const id = insertRunningRow(db, 424_245);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.isRunning("plaud-sync")).toBe(true);
      expect(runner.kill(id)).toBe("not_running");
      expect(killSpy).not.toHaveBeenCalled();

      const row = getJob(db, id)!;
      expect(row.status).toBe("failed");
      expect(row.exitCode).toBeNull();
      expect(row.finishedAt).not.toBeNull();
      expect(runner.isRunning("plaud-sync")).toBe(false);
    } finally {
      killSpy.mockRestore();
    }
  });

  it("returns not_running and finishes a running row with a null pid, sending no signal", () => {
    // isOurProcess answers true here on purpose: the null-pid check must short-circuit before it
    // is ever consulted. A null pid can never be verified, which is the same verdict
    // reconcileRunning reaches for it at boot.
    const { db, runner } = newRunner({}, undefined, () => true);
    const id = insertRunningRow(db, null);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.kill(id)).toBe("not_running");
      expect(killSpy).not.toHaveBeenCalled();
      expect(getJob(db, id)!.status).toBe("failed");
    } finally {
      killSpy.mockRestore();
    }
  });

  it("returns not_running and leaves a row that already finished alone", () => {
    const { db, runner } = newRunner({}, undefined, () => true);
    const id = insertRunningRow(db, 424_244);
    finishJob(db, id, "done", 0);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.kill(id)).toBe("not_running");
      expect(killSpy).not.toHaveBeenCalled();
      // Only a "running" row is reclassified - a terminal status is never overwritten.
      expect(getJob(db, id)!.status).toBe("done");
    } finally {
      killSpy.mockRestore();
    }
  });

  it("returns not_running and sends no signal for a missing id", () => {
    const { runner } = newRunner({}, undefined, () => true);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.kill(999_999)).toBe("not_running");
      expect(killSpy).not.toHaveBeenCalled();
    } finally {
      killSpy.mockRestore();
    }
  });

  it("does not escalate to SIGKILL once re-verification now answers false", async () => {
    // true for the immediate check kill() makes, false for the one the escalation timer repeats.
    const isOurProcess = verifiesOnce();
    const { db, runner } = newRunner({}, ORPHAN_ESCALATION_MS, isOurProcess);
    const id = insertRunningRow(db, 555_555);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.kill(id)).toBe("killed");
      expect(killSpy).toHaveBeenCalledExactlyOnceWith(555_555, "SIGTERM");

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(isOurProcess).toHaveBeenCalledTimes(2);
      expect(killSpy).toHaveBeenCalledOnce(); // still only the SIGTERM - no SIGKILL followed
    } finally {
      killSpy.mockRestore();
    }
  });

  // The one test that does take the SIGKILL branch, and it waits the grace period out with the
  // spy still installed - so the signal is observed here rather than escaping into a later test.
  it("escalates to SIGKILL after the grace period when re-verification is still true", async () => {
    const { db, runner } = newRunner({}, ORPHAN_ESCALATION_MS, () => true);
    const id = insertRunningRow(db, 555_556);
    const killSpy = spyOnProcessKill();

    try {
      expect(runner.kill(id)).toBe("killed");
      expect(killSpy).toHaveBeenCalledExactlyOnceWith(555_556, "SIGTERM");

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(killSpy).toHaveBeenCalledTimes(2);
      expect(killSpy).toHaveBeenNthCalledWith(2, 555_556, "SIGKILL");
    } finally {
      killSpy.mockRestore();
    }
  });

  it("does not throw when process.kill reports the pid already gone (ESRCH)", () => {
    const { db, runner } = newRunner({}, ORPHAN_ESCALATION_MS, verifiesOnce());
    const id = insertRunningRow(db, 555_557);
    const esrch = Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw esrch;
    });

    try {
      expect(() => runner.kill(id)).not.toThrow();
      expect(getJob(db, id)!.status).toBe("killed");
    } finally {
      killSpy.mockRestore();
    }
  });
});

describe("createRunner - isRunning and isInFlight consult the database", () => {
  it("isRunning is true for a kind whose row is running in the database alone (an empty in-flight map), and false again once that row is no longer running", () => {
    const { db, runner } = newRunner();
    const id = insertRunningRow(db, null);

    expect(runner.isRunning("plaud-sync")).toBe(true);

    finishJob(db, id, "failed", null);
    expect(runner.isRunning("plaud-sync")).toBe(false);
  });

  it("isInFlight is false for a database-only running row and true for a job this runner actually started", async () => {
    const { db, runner } = newRunner();
    const orphanId = insertRunningRow(db, null);
    expect(runner.isInFlight(orphanId)).toBe(false);

    const { plan, env } = fakePlan("plaud-sync");
    const started = runner.start(
      "plaud-sync",
      "{}",
      plan,
      env,
      JOB_TIMEOUTS_MS["plaud-sync"],
    );
    expect(runner.isInFlight(started.id)).toBe(true);

    await waitForTerminal(db, started.id);
    expect(runner.isInFlight(started.id)).toBe(false);
  }, 10_000);
});
