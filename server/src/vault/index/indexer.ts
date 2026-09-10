import { readFileSync, statSync, type Stats } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { projektOf, splitNote, tagsOf, titleOf } from "./frontmatter.js";
import { listNotes } from "./scan.js";
import { extractTasks } from "./tasks.js";
import { extractWikilinks } from "./wikilinks.js";

export interface IndexSummary {
  notes: number;
  links: number;
  tasks: number;
}

/**
 * The four codes that mean the filesystem moved under us rather than that we asked for the wrong
 * thing: the note was deleted, a folder on the way became a file, or it stopped being readable.
 * Anything else - EISDIR above all - is a bug that should surface as one.
 */
const NOTE_UNREADABLE = new Set(["ENOENT", "ENOTDIR", "EACCES", "EPERM"]);

function readNote(file: string): { text: string; stat: Stats } | null {
  try {
    return { text: readFileSync(file, "utf8"), stat: statSync(file) };
  } catch (e) {
    const { code } = e as NodeJS.ErrnoException;
    if (code !== undefined && NOTE_UNREADABLE.has(code)) return null;
    throw e;
  }
}

/**
 * Parse one file and replace everything the index holds about it. Links go in unresolved;
 * resolveLinks fills to_path once every note is known, because a link can point at a note
 * that is indexed later - or not at all.
 *
 * Both callers that index a single note race the filesystem: the watcher reads after chokidar's
 * event, indexAll reads after its own listing, and either file can be gone by then. Returns
 * whether the note was read, so a vanished one is skipped rather than taking the process - or,
 * inside indexAll's transaction, the whole initial index - down with it. Removing the row is the
 * unlink handler's job, not a failed read's.
 */
export function indexNote(
  db: Database.Database,
  vaultDir: string,
  relPath: string,
): boolean {
  const file = path.join(vaultDir, relPath);
  const read = readNote(file);
  if (read === null) return false;
  const { text, stat } = read;
  const { frontmatter, body } = splitNote(text);
  const dirname = path.posix.dirname(relPath);
  const folder = dirname === "." ? "" : dirname;
  const write = db.transaction(() => {
    db.prepare("DELETE FROM notes WHERE path = ?").run(relPath);
    db.prepare("DELETE FROM notes_fts WHERE path = ?").run(relPath);
    db.prepare(
      "INSERT INTO notes (path, title, folder, frontmatter, projekt, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      relPath,
      titleOf(relPath),
      folder,
      JSON.stringify(frontmatter),
      projektOf(frontmatter),
      body,
      Math.round(stat.mtimeMs),
      stat.size,
    );
    db.prepare(
      "INSERT INTO notes_fts (path, title, body) VALUES (?, ?, ?)",
    ).run(relPath, titleOf(relPath), body);
    writeLinks(db, relPath, body);
    writeTags(db, relPath, frontmatter);
    writeTasks(db, relPath, body);
  });
  write();
  return true;
}

function writeLinks(
  db: Database.Database,
  relPath: string,
  body: string,
): void {
  const link = db.prepare(
    "INSERT INTO links (from_path, target, heading, alias, embed) VALUES (?, ?, ?, ?, ?)",
  );
  for (const l of extractWikilinks(body))
    link.run(relPath, l.target, l.heading, l.alias, l.embed ? 1 : 0);
}

function writeTags(
  db: Database.Database,
  relPath: string,
  frontmatter: Record<string, unknown>,
): void {
  const tag = db.prepare("INSERT INTO tags (path, tag) VALUES (?, ?)");
  for (const t of tagsOf(frontmatter)) tag.run(relPath, t);
}

function writeTasks(
  db: Database.Database,
  relPath: string,
  body: string,
): void {
  const task = db.prepare(
    "INSERT INTO tasks (path, line, raw, text, done, due, scheduled, start, priority, recurrence, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const t of extractTasks(body))
    task.run(
      relPath,
      t.line,
      t.raw,
      t.text,
      t.done ? 1 : 0,
      t.due,
      t.scheduled,
      t.start,
      t.priority,
      t.recurrence,
      t.doneAt,
    );
}

export function removeNote(db: Database.Database, relPath: string): void {
  db.prepare("DELETE FROM notes WHERE path = ?").run(relPath);
  db.prepare("DELETE FROM notes_fts WHERE path = ?").run(relPath);
}

interface PathRow {
  path: string;
}

interface LinkTarget {
  rowid: number;
  from_path: string;
  target: string;
}

/**
 * Obsidian resolves a link by the exact vault path when one is given, otherwise by the note's
 * name - case-insensitively, with .md optional. When two notes share a name, the one in the
 * linking note's own folder wins, as it does in Obsidian's "shortest path" mode.
 */
function resolveTarget(
  target: string,
  fromPath: string,
  byPath: Map<string, string>,
  byName: Map<string, string[]>,
): string | null {
  const key = target.replace(/\.md$/i, "").toLowerCase();
  const exact = byPath.get(`${key}.md`);
  if (exact) return exact;
  const candidates = byName.get(path.posix.basename(key)) ?? [];
  if (candidates.length === 0) return null;
  const folder = path.posix.dirname(fromPath);
  return (
    candidates.find((c) => path.posix.dirname(c) === folder) ?? candidates[0]
  );
}

/** Fill to_path for every link from the notes currently indexed. Cheap enough to run whole. */
export function resolveLinks(db: Database.Database): void {
  const notes = db.prepare("SELECT path FROM notes").all() as PathRow[];
  const byPath = new Map(notes.map((n) => [n.path.toLowerCase(), n.path]));
  const byName = new Map<string, string[]>();
  for (const n of notes) {
    const name = path.posix.basename(n.path, ".md").toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), n.path]);
  }
  const links = db
    .prepare("SELECT rowid, from_path, target FROM links")
    .all() as LinkTarget[];
  const update = db.prepare("UPDATE links SET to_path = ? WHERE rowid = ?");
  db.transaction(() => {
    for (const l of links)
      update.run(resolveTarget(l.target, l.from_path, byPath, byName), l.rowid);
  })();
}

/** Index every note under the vault, forget the ones whose files are gone, resolve the links. */
export function indexAll(
  db: Database.Database,
  vaultDir: string,
): IndexSummary {
  const present = listNotes(vaultDir);
  const known = (db.prepare("SELECT path FROM notes").all() as PathRow[]).map(
    (n) => n.path,
  );
  const gone = known.filter((p) => !present.includes(p));
  db.transaction(() => {
    for (const p of gone) removeNote(db, p);
    for (const p of present) indexNote(db, vaultDir, p);
  })();
  resolveLinks(db);
  const c = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
  return { notes: c("notes"), links: c("links"), tasks: c("tasks") };
}
