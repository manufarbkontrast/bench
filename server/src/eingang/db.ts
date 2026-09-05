import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * One row per spawned or internal job the runner (Task 4/5) starts - kind and args_json record
 * what was asked for, the rest records what happened. A row is inserted running and only
 * finishJob or failStaleRunning ever move it out of that state.
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
  log_path TEXT NOT NULL
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
  };
}

/** Open (creating if needed) the jobs database and ensure the schema exists. */
export function openEingangDb(file: string): Database.Database {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
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
 * A server killed mid-job leaves its row stuck at "running" forever - nothing else ever calls
 * finishJob for it. Called once at boot so a restart's job list reflects reality rather than a
 * job that will never finish.
 */
export function failStaleRunning(db: Database.Database): void {
  db.prepare(
    "UPDATE jobs SET status = 'failed', exit_code = NULL WHERE status = 'running'",
  ).run();
}
