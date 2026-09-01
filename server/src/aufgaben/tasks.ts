import type Database from "better-sqlite3";

/** The vault's own housekeeping folders - a task filed here is not user work to surface. */
export const EXCLUDED = new Set(["50_Workflow", "Templates", "90_Archive"]);

export interface AufgabenTask {
  path: string;
  line: number;
  raw: string;
  text: string;
  done: boolean;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  priority: string | null;
  recurrence: string | null;
  doneAt: string | null;
  noteTitle: string;
  brand: string | null;
}

interface TaskJoinRow {
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
  note_title: string;
}

interface BrandTagRow {
  path: string;
  tag: string;
}

const BRAND_PREFIX = "brand/";

/** The first `brand/` tag per note, in the order the frontmatter listed its tags. */
function firstBrandByPath(db: Database.Database): Map<string, string> {
  const rows = db
    .prepare(
      "SELECT path, tag FROM tags WHERE tag LIKE 'brand/%' ORDER BY rowid",
    )
    .all() as BrandTagRow[];
  const brands = new Map<string, string>();
  for (const row of rows) {
    if (!brands.has(row.path))
      brands.set(row.path, row.tag.slice(BRAND_PREFIX.length));
  }
  return brands;
}

function hasExcludedSegment(taskPath: string): boolean {
  return taskPath.split("/").some((segment) => EXCLUDED.has(segment));
}

function toAufgabenTask(row: TaskJoinRow, brand: string | null): AufgabenTask {
  return {
    path: row.path,
    line: row.line,
    raw: row.raw,
    text: row.text,
    done: row.done === 1,
    due: row.due,
    scheduled: row.scheduled,
    start: row.start,
    priority: row.priority,
    recurrence: row.recurrence,
    doneAt: row.done_at,
    noteTitle: row.note_title,
    brand,
  };
}

/**
 * Every vault task joined with its note's title and first brand tag, excluding anything filed
 * under an EXCLUDED folder - whichever path segment it sits at.
 */
export function listTasks(vaultDb: Database.Database): AufgabenTask[] {
  const rows = vaultDb
    .prepare(
      `SELECT tasks.path AS path, tasks.line AS line, tasks.raw AS raw, tasks.text AS text,
              tasks.done AS done, tasks.due AS due, tasks.scheduled AS scheduled,
              tasks.start AS start, tasks.priority AS priority, tasks.recurrence AS recurrence,
              tasks.done_at AS done_at, notes.title AS note_title
       FROM tasks
       JOIN notes ON notes.path = tasks.path
       ORDER BY tasks.path, tasks.line`,
    )
    .all() as TaskJoinRow[];
  const brands = firstBrandByPath(vaultDb);
  return rows
    .filter((row) => !hasExcludedSegment(row.path))
    .map((row) => toAufgabenTask(row, brands.get(row.path) ?? null));
}
