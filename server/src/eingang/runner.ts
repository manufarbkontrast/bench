import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import {
  finishJob,
  getJob,
  insertJob,
  type JobRow,
  type JobStatus,
} from "./db.js";
import type { JobKind, JobPlan } from "./jobs.js";

type InternalJobFn = (log: (line: string) => void) => Promise<void>;

export interface RunnerInternals {
  "vault-reindex": InternalJobFn;
  "projekte-scan": InternalJobFn;
}

export interface Runner {
  start(
    kind: JobKind,
    argsJson: string,
    plan: JobPlan,
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ): JobRow;
  kill(id: number): boolean;
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

function escalateKill(child: ChildProcess, record: InFlightJob): void {
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => {
    child.kill("SIGKILL");
  }, KILL_ESCALATION_MS);
  record.timers.push(killTimer);
}

export function createRunner(
  db: Database.Database,
  jobsDir: string,
  internals: RunnerInternals,
): Runner {
  mkdirSync(jobsDir, { recursive: true });

  const inFlight = new Map<number, InFlightJob>();

  // A job's log path is named after its own database id, so the id has to exist first: the row
  // is inserted with a placeholder and corrected once insertJob hands back the real one.
  function setLogPath(id: number, logPath: string): void {
    db.prepare("UPDATE jobs SET log_path = ? WHERE id = ?").run(logPath, id);
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
    const [command, ...args] = plan.argv;
    const child = spawn(command, args, {
      cwd: plan.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    record.child = child;
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });

    const timeoutTimer = setTimeout(() => {
      markEndReason(record, "timedOut");
      escalateKill(child, record);
    }, timeoutMs);
    record.timers.push(timeoutTimer);

    // "close", not "exit" - close fires only once stdout/stderr have finished draining into the
    // log file, so every line the process wrote is already there by the time status resolves.
    child.on("close", (code) => {
      clearTimers(record);
      out.end(() => {
        finish(id, statusForExit(record.why, code), code);
      });
    });
  }

  function runInternal(
    id: number,
    name: keyof RunnerInternals,
    logPath: string,
    timeoutMs: number,
    record: InFlightJob,
  ): void {
    const out = createWriteStream(logPath);
    const log = (line: string): void => {
      out.write(`${new Date().toISOString()} ${line}\n`);
    };

    // There is no process to signal here, so a timeout cannot cut an internal job short - it can
    // only relabel the eventual outcome once the function does settle.
    const timeoutTimer = setTimeout(() => {
      markEndReason(record, "timedOut");
    }, timeoutMs);
    record.timers.push(timeoutTimer);

    void internals[name](log)
      .then(() => {
        clearTimers(record);
        out.end(() => {
          finish(id, record.why === "timedOut" ? "timeout" : "done", 0);
        });
      })
      .catch((error: unknown) => {
        clearTimers(record);
        log(`error: ${error instanceof Error ? error.message : String(error)}`);
        out.end(() => {
          finish(id, record.why === "timedOut" ? "timeout" : "failed", null);
        });
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
    else runInternal(id, plan.name, logPath, timeoutMs, record);

    return getJob(db, id)!;
  }

  function kill(id: number): boolean {
    const record = inFlight.get(id);
    if (!record?.child) return false;
    markEndReason(record, "killRequested");
    escalateKill(record.child, record);
    return true;
  }

  function isRunning(kind: JobKind): boolean {
    return [...inFlight.values()].some((record) => record.kind === kind);
  }

  return { start, kill, isRunning };
}
