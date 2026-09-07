import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { isOurProcess as isOurProcessDefault } from "./alive.js";
import {
  finishJob,
  getJob,
  insertJob,
  runningJobs,
  type JobRow,
  type JobStatus,
} from "./db.js";
import type { InternalName, JobKind, JobPlan } from "./jobs.js";

type InternalJobFn = (
  log: (line: string) => void,
  args: Record<string, unknown>,
) => Promise<void>;

export type RunnerInternals = Record<InternalName, InternalJobFn>;

/**
 * `killed` - a SIGTERM was actually sent, whether to a job this process started or to a
 * restart-orphaned one it only found in the database (see `kill` below). `not_running` - the id is
 * absent, already finished, or - for a row with no in-flight record - a pid `isOurProcess` cannot
 * confirm as the job's own child right now. `internal` - the record has no child process this
 * runner tracks, so it cannot be cancelled through this call, only relabelled if it times out (see
 * runInternal). True for vault-reindex and projekte-scan, which run in-process with nothing to
 * signal at all; plaud-fetch does spawn a process (the Plaud MCP, over stdio), but that child
 * belongs to plaud-mcp.ts's own session, not to this runner, and a hung fetch is ended by that
 * session's own 120-second timeout rather than by anything here. The route layer maps `internal`
 * to its own 409 rather than the runner deciding what an unkillable job means for an HTTP caller.
 */
type KillOutcome = "killed" | "not_running" | "internal";

/** The pid-liveness check kill()'s orphan path needs - just (pid, startedAt) => boolean, the same
    shape isOurProcess itself has once its own optional ps override is dropped, so a test can drive
    every branch with a plain function and no real long-lived process. */
type PidIsAlive = (pid: number, startedAt: number) => boolean;

export interface Runner {
  start(
    kind: JobKind,
    argsJson: string,
    plan: JobPlan,
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ): JobRow;
  kill(id: number): KillOutcome;
  isRunning(kind: JobKind): boolean;
  /** True only for an id this runner's own start() put in its in-flight map - never restored by
      the database, never true again once the job settles. A `running` row for which this answers
      false is exactly a restart orphan (SPEC decision 2): the process, if still alive, belongs to
      an earlier instance of this same server. */
  isInFlight(id: number): boolean;
}

// A child that ignores SIGTERM would otherwise wedge the runner forever - this is the grace
// period before escalating to SIGKILL.
const KILL_ESCALATION_MS = 5000;

type EndReason = "killRequested" | "timedOut" | null;

/**
 * Everything the runner needs to finish a job once it starts: the child process (spawn jobs
 * only), the timers that could still fire against it, and why it is being ended, if a kill or a
 * timeout has already been requested. This is the one sanctioned mutable record in the module -
 * a running process and its pending timers are inherently stateful, and rebuilding a new record
 * on every event would only move the mutation into the Map itself.
 */
interface InFlightJob {
  kind: JobKind;
  child: ChildProcess | null;
  timers: NodeJS.Timeout[];
  why: EndReason;
}

function statusForExit(
  why: EndReason,
  exitCode: number | null,
): Exclude<JobStatus, "running"> {
  if (why === "killRequested") return "killed";
  if (why === "timedOut") return "timeout";
  return exitCode === 0 ? "done" : "failed";
}

/** First cause wins - a timeout that fires after kill() already requested termination (or the
    reverse) must not flip the eventual status a second time. */
function markEndReason(
  record: InFlightJob,
  why: Exclude<EndReason, null>,
): void {
  record.why ??= why;
}

function clearTimers(record: InFlightJob): void {
  for (const timer of record.timers) clearTimeout(timer);
  record.timers = [];
}

function escalateKill(
  child: ChildProcess,
  record: InFlightJob,
  killEscalationMs: number,
): void {
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => {
    child.kill("SIGKILL");
  }, killEscalationMs);
  record.timers.push(killTimer);
}

/** process.kill throws ESRCH when the pid is already gone - an expected race for a process this
    runner does not own and cannot wait on (the verification just before this call, or the grace
    period before the SIGKILL escalation, both give it a window to exit on its own), not a bug
    worth crashing the runner over. Anything else is not expected and is left to throw. */
function signalOrphan(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

/** kill()'s fallback for a `running` row with no in-flight record: this runner holds no
    ChildProcess for it, so there is no "close" event to settle the row from - the caller marks it
    killed as soon as the signal is sent. The SIGKILL escalation re-verifies the pid at the moment
    it is about to fire rather than trusting the check kill() made a whole killEscalationMs ago:
    the pid can have exited and been handed to an unrelated process in between. */
function escalateOrphanKill(
  pid: number,
  startedAt: number,
  isOurProcess: PidIsAlive,
  killEscalationMs: number,
): void {
  signalOrphan(pid, "SIGTERM");
  setTimeout(() => {
    if (isOurProcess(pid, startedAt)) signalOrphan(pid, "SIGKILL");
  }, killEscalationMs);
}

type Settle = (
  status: Exclude<JobStatus, "running">,
  exitCode: number | null,
) => void;

/**
 * Shared between runSpawn and runInternal: whichever finishes a job first wins, since both a
 * spawn/promise outcome and a broken log stream can each try to settle the same job. `viaLog`
 * flushes the log before finishing - the normal path, used once the stream is known to still be
 * healthy. `immediate` skips the stream - for when the stream itself is what just failed, so
 * writing to it or waiting on it can no longer be trusted.
 */
function createLogSettler(
  record: InFlightJob,
  out: WriteStream,
  onSettle: Settle,
): { viaLog: Settle; immediate: Settle } {
  let settled = false;
  return {
    viaLog(status, exitCode) {
      if (settled) return;
      settled = true;
      clearTimers(record);
      out.end(() => {
        onSettle(status, exitCode);
      });
    },
    immediate(status, exitCode) {
      if (settled) return;
      settled = true;
      clearTimers(record);
      onSettle(status, exitCode);
    },
  };
}

export function createRunner(
  db: Database.Database,
  jobsDir: string,
  internals: RunnerInternals,
  killEscalationMs = KILL_ESCALATION_MS,
  isOurProcess: PidIsAlive = isOurProcessDefault,
): Runner {
  mkdirSync(jobsDir, { recursive: true });

  const inFlight = new Map<number, InFlightJob>();

  // A job's log path is named after its own database id, so the id has to exist first: the row
  // is inserted with a placeholder and corrected once insertJob hands back the real one.
  function setLogPath(id: number, logPath: string): void {
    db.prepare("UPDATE jobs SET log_path = ? WHERE id = ?").run(logPath, id);
  }

  function setPid(id: number, pid: number): void {
    db.prepare("UPDATE jobs SET pid = ? WHERE id = ?").run(pid, id);
  }

  function finish(
    id: number,
    status: Exclude<JobStatus, "running">,
    exitCode: number | null,
  ): void {
    inFlight.delete(id);
    finishJob(db, id, status, exitCode);
  }

  function runSpawn(spawnJob: {
    id: number;
    plan: Extract<JobPlan, { kind: "spawn" }>;
    env: NodeJS.ProcessEnv;
    logPath: string;
    timeoutMs: number;
    record: InFlightJob;
  }): void {
    const { id, plan, env, logPath, timeoutMs, record } = spawnJob;
    const out = createWriteStream(logPath);
    const settle = createLogSettler(record, out, (status, exitCode) =>
      finish(id, status, exitCode),
    );

    const [command, ...args] = plan.argv;
    const child = spawn(command, args, {
      cwd: plan.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    record.child = child;
    // spawn() leaves pid undefined when the spawn itself fails (e.g. ENOENT) - the "error"
    // handler below settles the job in that case, so there is never a pid to record.
    if (typeof child.pid === "number") setPid(id, child.pid);
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });

    // A full disk or a permissions problem breaks the log file itself, throwing through the same
    // unhandled-"error" path a spawn failure would. The stream is already broken, so this settles
    // directly rather than through out.end(), and kills the child best-effort since nothing else
    // will observe it afterward.
    out.on("error", () => {
      child.kill("SIGTERM");
      settle.immediate("failed", null);
    });

    const timeoutTimer = setTimeout(() => {
      markEndReason(record, "timedOut");
      escalateKill(child, record, killEscalationMs);
    }, timeoutMs);
    record.timers.push(timeoutTimer);

    // A missing binary (ENOENT) or any other spawn failure emits "error", not "close" - without a
    // handler here it throws and takes the whole process down, and even caught, close would never
    // fire, leaving the row stuck "running" with its timers still armed.
    child.on("error", (err) => {
      out.write(`error: ${err.message}\n`);
      settle.viaLog("failed", null);
    });

    // "close", not "exit" - close fires only once stdout/stderr have finished draining into the
    // log file, so every line the process wrote is already there by the time status resolves.
    child.on("close", (code) => {
      settle.viaLog(statusForExit(record.why, code), code);
    });
  }

  function runInternal(internalJob: {
    id: number;
    name: keyof RunnerInternals;
    args: Record<string, unknown>;
    logPath: string;
    timeoutMs: number;
    record: InFlightJob;
  }): void {
    const { id, name, args, logPath, timeoutMs, record } = internalJob;
    const out = createWriteStream(logPath);
    const settle = createLogSettler(record, out, (status, exitCode) =>
      finish(id, status, exitCode),
    );
    const log = (line: string): void => {
      out.write(`${new Date().toISOString()} ${line}\n`);
    };

    // Same reasoning as the spawn path: a broken log file must not crash the server. This runner
    // tracks no child process for an internal job (plaud-fetch's own MCP child belongs to
    // plaud-mcp.ts's session, not to this record), so this only ends the row - the internal
    // function keeps running in the background, but its own eventual settle becomes a no-op via
    // the settler's guard.
    out.on("error", () => {
      settle.immediate("failed", null);
    });

    // This runner has no process of its own to signal here, so a timeout cannot cut an internal
    // job short through this timer - it can only relabel the eventual outcome once the function
    // does settle. (plaud-fetch's own child is cut short by its session's own timeout instead, see
    // KillOutcome's docstring above.)
    const timeoutTimer = setTimeout(() => {
      markEndReason(record, "timedOut");
    }, timeoutMs);
    record.timers.push(timeoutTimer);

    void internals[name](log, args)
      .then(() => {
        settle.viaLog(record.why === "timedOut" ? "timeout" : "done", 0);
      })
      .catch((error: unknown) => {
        log(`error: ${error instanceof Error ? error.message : String(error)}`);
        settle.viaLog(record.why === "timedOut" ? "timeout" : "failed", null);
      });
  }

  function start(
    kind: JobKind,
    argsJson: string,
    plan: JobPlan,
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ): JobRow {
    const startedAt = Date.now();
    const id = insertJob(db, { kind, argsJson, startedAt, logPath: "" });
    const logPath = path.join(jobsDir, `${id}.log`);
    setLogPath(id, logPath);

    const record: InFlightJob = { kind, child: null, timers: [], why: null };
    inFlight.set(id, record);

    if (plan.kind === "spawn")
      runSpawn({ id, plan, env, logPath, timeoutMs, record });
    else
      runInternal({
        id,
        name: plan.name,
        args: plan.args,
        logPath,
        timeoutMs,
        record,
      });

    return getJob(db, id)!;
  }

  function kill(id: number): KillOutcome {
    const record = inFlight.get(id);
    if (record) {
      if (!record.child) return "internal";
      markEndReason(record, "killRequested");
      escalateKill(record.child, record, killEscalationMs);
      return "killed";
    }

    // The in-flight map is empty on every boot, so an id absent from it is either a job already
    // finished or a restart-orphaned child still alive on the machine. Verification runs right
    // here, at the moment of the click - the boot reconciliation's verdict is stale by now, and a
    // false "alive" would let a stranger's process be signalled (SPEC decision 4/6).
    const row = getJob(db, id);
    if (!row) return "not_running";
    if (row.status !== "running") return "not_running";

    // A `running` row this process never started, whose pid cannot be confirmed as its own child,
    // is exactly what reconcileRunning fails at the next boot - so reach that verdict here, at the
    // click, rather than leaving the row `running`. reconcileRunning is called once, at boot, so
    // nothing else would: the row would fence every future job of its kind through isRunning() for
    // the life of the server, and this button - the only one on it - would keep answering 409
    // without changing anything.
    if (row.pid === null || !isOurProcess(row.pid, row.startedAt)) {
      finishJob(db, id, "failed", null);
      return "not_running";
    }

    escalateOrphanKill(row.pid, row.startedAt, isOurProcess, killEscalationMs);
    finishJob(db, id, "killed", null);
    return "killed";
  }

  // The in-flight map alone is empty on every boot, so a restart-orphaned job of this kind would
  // otherwise be invisible to the fence and a second run could start beside it. The database read
  // is what makes this restart-proof; the map is kept too so a job caught mid-insert (the row
  // exists, the map entry not yet set - see start()) still fences correctly within one tick.
  function isRunning(kind: JobKind): boolean {
    if ([...inFlight.values()].some((record) => record.kind === kind))
      return true;
    return runningJobs(db).some((row) => row.kind === kind);
  }

  function isInFlight(id: number): boolean {
    return inFlight.has(id);
  }

  return { start, kill, isRunning, isInFlight };
}
