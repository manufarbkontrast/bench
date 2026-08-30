import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The index of one Obsidian vault. Every row here is derived from the markdown files and can be
 * rebuilt from them; the vault itself is never written by this app. Paths are vault-relative,
 * posix-separated, with the .md extension.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder TEXT NOT NULL,
  frontmatter TEXT NOT NULL DEFAULT '{}',
  body TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);

CREATE TABLE IF NOT EXISTS links (
  from_path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  target TEXT NOT NULL,
  heading TEXT,
  alias TEXT,
  embed INTEGER NOT NULL DEFAULT 0,
  to_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_path);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_path);

CREATE TABLE IF NOT EXISTS tags (
  path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  tag TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS tasks (
  path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  line INTEGER NOT NULL,
  raw TEXT NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL,
  due TEXT,
  scheduled TEXT,
  start TEXT,
  priority TEXT,
  recurrence TEXT,
  done_at TEXT,
  PRIMARY KEY (path, line)
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;

/** @public row shape of `notes`; consumed by the scanner and routes arriving in later tasks. */
export interface NoteRow {
  path: string;
  title: string;
  folder: string;
  frontmatter: string;
  body: string;
  mtime: number;
  size: number;
}

export interface LinkRow {
  from_path: string;
  target: string;
  heading: string | null;
  alias: string | null;
  embed: number;
  to_path: string | null;
}

/** @public row shape of `tags`; consumed by the scanner and routes arriving in later tasks. */
export interface TagRow {
  path: string;
  tag: string;
}

export interface TaskRow {
  path: string;
  line: number;
  raw: string;
  text: string;
  done: number;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  priority: string | null;
  recurrence: string | null;
  done_at: string | null;
}

/** Open (creating if needed) the index database and ensure the schema exists. */
export function openDb(dbPath: string): Database.Database {
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
