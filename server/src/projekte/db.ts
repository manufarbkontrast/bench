import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * One row per git checkout or plain folder found under the configured roots - a denormalised
 * scan result, rebuilt whole on every scan rather than reconciled field by field.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('git', 'folder')),
  remote TEXT,
  remote_label TEXT,
  branch TEXT,
  last_commit_at INTEGER,
  last_commit_subject TEXT,
  dirty INTEGER NOT NULL DEFAULT 0,
  ahead INTEGER,
  behind INTEGER,
  note_path TEXT,
  brand TEXT,
  status TEXT,
  issues INTEGER,
  prs INTEGER,
  group_key TEXT NOT NULL,
  scanned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_key);
`;

export interface ProjectRow {
  path: string;
  name: string;
  kind: "git" | "folder";
  remote: string | null;
  remoteLabel: string | null;
  branch: string | null;
  lastCommitAt: number | null;
  lastCommitSubject: string | null;
  /** SQLite's 0 or 1, not a boolean - see crm/db.ts's Activity for the same convention. */
  dirty: number;
  ahead: number | null;
  behind: number | null;
  notePath: string | null;
  brand: string | null;
  status: string | null;
  issues: number | null;
  prs: number | null;
  groupKey: string;
  scannedAt: number;
}

interface ProjectDbRow {
  path: string;
  name: string;
  kind: string;
  remote: string | null;
  remote_label: string | null;
  branch: string | null;
  last_commit_at: number | null;
  last_commit_subject: string | null;
  dirty: number;
  ahead: number | null;
  behind: number | null;
  note_path: string | null;
  brand: string | null;
  status: string | null;
  issues: number | null;
  prs: number | null;
  group_key: string;
  scanned_at: number;
}

function toProjectRow(row: ProjectDbRow): ProjectRow {
  return {
    path: row.path,
    name: row.name,
    kind: row.kind as ProjectRow["kind"],
    remote: row.remote,
    remoteLabel: row.remote_label,
    branch: row.branch,
    lastCommitAt: row.last_commit_at,
    lastCommitSubject: row.last_commit_subject,
    dirty: row.dirty,
    ahead: row.ahead,
    behind: row.behind,
    notePath: row.note_path,
    brand: row.brand,
    status: row.status,
    issues: row.issues,
    prs: row.prs,
    groupKey: row.group_key,
    scannedAt: row.scanned_at,
  };
}

/** Open (creating if needed) the projects database and ensure the schema exists. */
export function openProjekteDb(file: string): Database.Database {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function listProjects(db: Database.Database): ProjectRow[] {
  return (
    db.prepare("SELECT * FROM projects ORDER BY path").all() as ProjectDbRow[]
  ).map(toProjectRow);
}

/** Every scan replaces the whole table - a project gone from the roots must also vanish here. */
export function replaceProjects(
  db: Database.Database,
  rows: ProjectRow[],
): void {
  const insert = db.prepare(
    `INSERT INTO projects (
      path, name, kind, remote, remote_label, branch, last_commit_at, last_commit_subject,
      dirty, ahead, behind, note_path, brand, status, issues, prs, group_key, scanned_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.exec("DELETE FROM projects");
    for (const row of rows)
      insert.run(
        row.path,
        row.name,
        row.kind,
        row.remote,
        row.remoteLabel,
        row.branch,
        row.lastCommitAt,
        row.lastCommitSubject,
        row.dirty,
        row.ahead,
        row.behind,
        row.notePath,
        row.brand,
        row.status,
        row.issues,
        row.prs,
        row.groupKey,
        row.scannedAt,
      );
  })();
}
