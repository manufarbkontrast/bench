import type Database from "better-sqlite3";
import { hasExcludedSegment } from "./tasks.js";

const MIN_WORD_LENGTH = 4;
const OVERLAP_THRESHOLD = 0.5;

interface OpenTaskRow {
  path: string;
  line: number;
  text: string;
}

/** Lowercased words of at least four letters - umlauts count as letters, everything else splits. */
function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-zäöüß]+/)
      .filter((word) => word.length >= MIN_WORD_LENGTH),
  );
}

function overlap(importWords: Set<string>, taskWords: Set<string>): number {
  let shared = 0;
  for (const word of importWords) if (taskWords.has(word)) shared += 1;
  return shared / importWords.size;
}

function byPathThenLine(a: OpenTaskRow, b: OpenTaskRow): number {
  if (a.path !== b.path)
    return Number(a.path > b.path) - Number(a.path < b.path);
  return a.line - b.line;
}

/**
 * The open task whose text shares the most significant words with `was`, when that share is at
 * least half of `was`'s own words - below that, null. A done task can never win: a Plaud item
 * already finished elsewhere should still get imported, not silently absorbed into a closed row.
 * A task under an EXCLUDED folder never wins either - the same housekeeping folders listTasks
 * drops from aufgaben's own task list are not work a dedup hint should point at.
 */
export function findExisting(
  vaultDb: Database.Database,
  was: string,
): { path: string; line: number; text: string } | null {
  const importWords = significantWords(was);
  const openTasks = (
    vaultDb
      .prepare("SELECT path, line, text FROM tasks WHERE done = 0")
      .all() as OpenTaskRow[]
  )
    .filter((task) => !hasExcludedSegment(task.path))
    .toSorted(byPathThenLine);

  let best: OpenTaskRow | null = null;
  let bestScore = 0;
  for (const task of openTasks) {
    const score = overlap(importWords, significantWords(task.text));
    if (score >= OVERLAP_THRESHOLD && score > bestScore) {
      best = task;
      bestScore = score;
    }
  }
  return best ? { path: best.path, line: best.line, text: best.text } : null;
}
