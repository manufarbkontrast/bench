import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The import ledger: one row per Plaud table row that has already been turned into a vault task,
 * keyed on the source note and that row's content hash - the same rowHash parsePlaudNote computes
 * - so a second run of the same import never double-creates the task.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS task_imports (
  source_file TEXT NOT NULL,
  row_hash TEXT NOT NULL,
  target_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (source_file, row_hash)
);
`;

export interface ImportRow {
  sourceFile: string;
  rowHash: string;
  targetPath: string;
  line: number;
  importedAt: number;
}

interface ImportDbRow {
  source_file: string;
  row_hash: string;
  target_path: string;
  line: number;
  imported_at: number;
}

function toImportRow(row: ImportDbRow): ImportRow {
  return {
    sourceFile: row.source_file,
    rowHash: row.row_hash,
    targetPath: row.target_path,
    line: row.line,
    importedAt: row.imported_at,
  };
}

/** Open (creating if needed) the import ledger database and ensure the schema exists. */
export function openAufgabenDb(file: string): Database.Database {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

/** Records one imported row. The primary key is the guard against a repeat import: it throws. */
export function recordImport(db: Database.Database, row: ImportRow): void {
  db.prepare(
    `INSERT INTO task_imports (source_file, row_hash, target_path, line, imported_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(row.sourceFile, row.rowHash, row.targetPath, row.line, row.importedAt);
}

export function findImport(
  db: Database.Database,
  sourceFile: string,
  rowHash: string,
): ImportRow | null {
  const row = db
    .prepare(
      "SELECT * FROM task_imports WHERE source_file = ? AND row_hash = ?",
    )
    .get(sourceFile, rowHash) as ImportDbRow | undefined;
  return row ? toImportRow(row) : null;
}

export function listImports(
  db: Database.Database,
  sourceFile: string,
): ImportRow[] {
  return (
    db
      .prepare(
        "SELECT * FROM task_imports WHERE source_file = ? ORDER BY row_hash",
      )
      .all(sourceFile) as ImportDbRow[]
  ).map(toImportRow);
}
