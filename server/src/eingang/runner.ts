import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import {
  finishJob,
  getJob,
  insertJob,
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
 * `killed` - a SIGTERM was actually sent. `not_running` - the id is absent or already finished.
 * `internal` - the record has no child process this runner tracks, so it cannot be cancelled
 * through this call, only relabelled if it times out (see runInternal). True for vault-reindex and
 * projekte-scan, which run in-process with nothing to signal at all; plaud-fetch does spawn a
 * process (the Plaud MCP, over stdio), but that child belongs to plaud-mcp.ts's own session, not
 * to this runner, and a hung fetch is ended by that session's own 120-second timeout rather than
 * by anything here. The route layer maps `internal` to its own 409 rather than the runner deciding
 * what an unkillable job means for an HTTP caller.
 */
type KillOutcome = "killed" | "not_running" | "internal";

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
    if (!record) return "not_running";
    if (!record.child) return "internal";
    markEndReason(record, "killRequested");
    escalateKill(record.child, record, killEscalationMs);
    return "killed";
  }

  function isRunning(kind: JobKind): boolean {
    return [...inFlight.values()].some((record) => record.kind === kind);
  }

  return { start, kill, isRunning };
}
