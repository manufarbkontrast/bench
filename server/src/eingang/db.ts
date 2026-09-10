import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * One row per spawned or internal job the runner (Task 4/5) starts - kind and args_json record
 * what was asked for, the rest records what happened. A row is inserted running and only
 * finishJob or reconcileRunning ever move it out of that state.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  args_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','done','failed','killed','timeout')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  exit_code INTEGER,
  log_path TEXT NOT NULL,
  pid INTEGER
);
`;

export type JobStatus = "running" | "done" | "failed" | "killed" | "timeout";

export interface JobRow {
  id: number;
  kind: string;
  argsJson: string;
  status: JobStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  logPath: string;
  pid: number | null;
}

interface JobDbRow {
  id: number;
  kind: string;
  args_json: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  exit_code: number | null;
  log_path: string;
  pid: number | null;
}

function toJobRow(row: JobDbRow): JobRow {
  return {
    id: row.id,
    kind: row.kind,
    argsJson: row.args_json,
    status: row.status as JobStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    logPath: row.log_path,
    pid: row.pid,
  };
}

/** A jobs table created before the pid column existed gets it added in place. No backfill: a row
    written before this change has no pid to record, and reconciles as gone. */
function migrate(db: Database.Database): void {
  const columns = (
    db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[]
  ).map((c) => c.name);
  if (!columns.includes("pid"))
    db.exec("ALTER TABLE jobs ADD COLUMN pid INTEGER");
}

/** Open (creating if needed) the jobs database and ensure the schema exists. */
export function openEingangDb(file: string): Database.Database {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export interface NewJob {
  kind: string;
  argsJson: string;
  startedAt: number;
  logPath: string;
}

/** Every job starts running; finishJob is the only way to a terminal status. Returns the new row's id. */
export function insertJob(db: Database.Database, job: NewJob): number {
  const result = db
    .prepare(
      `INSERT INTO jobs (kind, args_json, status, started_at, log_path)
       VALUES (?, ?, 'running', ?, ?)`,
    )
    .run(job.kind, job.argsJson, job.startedAt, job.logPath);
  return Number(result.lastInsertRowid);
}

export function finishJob(
  db: Database.Database,
  id: number,
  status: Exclude<JobStatus, "running">,
  exitCode: number | null,
): void {
  db.prepare(
    "UPDATE jobs SET status = ?, exit_code = ?, finished_at = ? WHERE id = ?",
  ).run(status, exitCode, Date.now(), id);
}

export function listJobs(db: Database.Database, limit: number): JobRow[] {
  return (
    db
      .prepare("SELECT * FROM jobs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as JobDbRow[]
  ).map(toJobRow);
}

export function getJob(db: Database.Database, id: number): JobRow | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
    JobDbRow | undefined;
  return row ? toJobRow(row) : null;
}

export function runningJobs(db: Database.Database): JobRow[] {
  return (
    db
      .prepare(
        "SELECT * FROM jobs WHERE status = 'running' ORDER BY started_at DESC",
      )
      .all() as JobDbRow[]
  ).map(toJobRow);
}

/**
 * A server killed mid-job leaves every "running" row stuck there - nothing else ever calls
 * finishJob for it. Called once at boot to tell each row's process apart from the pool of
 * unrelated ones a reused pid could name: a row with a pid `isAlive` still confirms is genuinely
 * running and is left untouched; everything else - a dead process, or an internal job's null pid,
 * which can never be alive - becomes "failed" with no exit code, same as before this reconciled.
 */
export function reconcileRunning(
  db: Database.Database,
  isAlive: (pid: number, startedAt: number) => boolean,
): void {
  for (const row of runningJobs(db)) {
    if (row.pid !== null && isAlive(row.pid, row.startedAt)) continue;
    finishJob(db, row.id, "failed", null);
  }
}
