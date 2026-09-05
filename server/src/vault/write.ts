import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { splitNote } from "./index/frontmatter.js";
import { indexNote, resolveLinks } from "./index/indexer.js";

/** Where a task with no target note lands - created from the template below if it does not exist yet. */
export const TASK_INBOX = "00_Index/Task_Inbox.md";

const TASK_INBOX_TEMPLATE = `---
tags: [inbox, tasks]
---

# Task_Inbox

## Aufgaben
`;

const AUFGABEN_HEADING = "## Aufgaben";

// The Tasks-plugin's own checkbox and completion-date syntax - the two literals the toggle needs
// to read and write the grammar exactly as Obsidian's Tasks plugin writes it to disk.
const TASK_LINE = /^(\s*[-*+] \[)([ xX])(\] )(.*)$/;
// Same shape as index/tasks.ts's own doneAt field, and built the same way - a template literal
// rather than a regex literal, which is what keeps sonarjs from reading the two \s* as candidates
// for backtracking against each other. They cannot: ✅ has to sit between them either way.
const DONE_DATE = "\\d{4}-\\d{2}-\\d{2}";
const DONE_FIELD = new RegExp(`\\s*✅\\s*${DONE_DATE}`);

/** Today's date in the local calendar, not UTC - a task toggled near midnight gets the day the user is living in. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Flip one task line's checkbox, adding or removing the Tasks-plugin completion field. Null when raw is not a task line. */
export function toggledLine(raw: string, today: string): string | null {
  const m = TASK_LINE.exec(raw);
  if (!m) return null;
  if (m[2] === " ") return `${m[1]}x${m[3]}${m[4]} ✅ ${today}`;
  return `${m[1]} ${m[3]}${m[4].replace(DONE_FIELD, "")}`;
}

/**
 * tasks.line counts inside the frontmatter-stripped body extractTasks saw; the file carries the
 * frontmatter block above that body, so this is how many lines that block adds - computed with the
 * same splitNote the indexer used, which is what keeps the offset always in step with the table.
 */
function bodyOffset(text: string): number {
  const { body } = splitNote(text);
  return text.split("\n").length - body.split("\n").length;
}

function lineAt(lines: string[], n: number): string | null {
  return n >= 1 && n <= lines.length ? lines[n - 1] : null;
}

/**
 * Whether `file` resolves inside `vaultDir` once every symlink on the way is followed. A
 * vault-relative path can still land outside the vault if a folder in it - or the note itself -
 * is a symlink pointing elsewhere: decision 4 lets listing and reading follow such a link, since
 * it is local-first and user-planted, but the two write surfaces below must refuse it rather than
 * write through it. `file` need not exist yet - appendTask can create one - so this walks up to
 * the nearest existing ancestor before resolving, the same way a shell would.
 *
 * A dangling symlink (target missing) cannot be resolved by that same walk either, so this
 * approves it once its containing folder is - what actually keeps such a write contained is
 * `atomicWrite`'s `rename` landing on the link's own directory entry rather than a target it
 * cannot reach, and `readFileSync`'s ENOENT wherever a missing target is not otherwise tolerated,
 * not this function.
 */
function resolvesInsideVault(vaultDir: string, file: string): boolean {
  const vaultReal = realpathSync(vaultDir);
  let existing = file;
  const tail: string[] = [];
  while (!existsSync(existing)) {
    tail.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  const real = path.join(realpathSync(existing), ...tail);
  return real === vaultReal || real.startsWith(vaultReal + path.sep);
}

function atomicWrite(file: string, content: string): void {
  const tmp = path.join(
    path.dirname(file),
    `.bench-write-${path.basename(file)}`,
  );
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

export type WriteResult =
  | { ok: true; line: number; raw: string }
  | { ok: false; current: string | null; escapesVault?: true };

/**
 * Toggle the task at `line` (body-relative, as stored in the tasks table) if its current text on
 * disk still matches `raw` - otherwise the file moved on since the caller read it, and the write
 * is refused. Either way the note is reindexed before returning, so a caller who lost the race
 * sees the file as it is now on its next fetch, not the one it started with.
 *
 * Six parameters: vaultDir, db, relPath, line and raw each stand for something distinct the
 * caller has to supply, and `today` on top makes the toggle testable without faking the clock.
 */
// eslint-disable-next-line max-params
export function toggleTask(
  vaultDir: string,
  db: Database.Database,
  relPath: string,
  line: number,
  raw: string,
  today: string = todayISO(),
): WriteResult {
  const file = path.join(vaultDir, relPath);
  if (!resolvesInsideVault(vaultDir, file))
    return { ok: false, current: null, escapesVault: true };
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const fileLine = bodyOffset(text) + line;
  const current = lineAt(lines, fileLine);
  if (current !== raw) {
    indexNote(db, vaultDir, relPath);
    resolveLinks(db);
    return { ok: false, current };
  }
  const updated = toggledLine(raw, today);
  if (updated === null)
    throw new Error(`${relPath}:${fileLine} is not a task line`);
  const newLines = lines.map((l, i) => (i === fileLine - 1 ? updated : l));
  atomicWrite(file, newLines.join("\n"));
  indexNote(db, vaultDir, relPath);
  resolveLinks(db);
  return { ok: true, line, raw: updated };
}

/**
 * Insert `taskLine` under the note's `## Aufgaben` heading, after the section's last non-empty
 * line - a section runs to the next `## ` heading or end of file. Appends the heading itself, plus
 * the line, when the note has none yet. `line` is the 1-based file line the task landed on.
 */
function insertUnderHeading(
  text: string,
  taskLine: string,
): { newText: string; line: number } {
  const lines = text.split("\n");
  const headingIndex = lines.findIndex((l) => l.trim() === AUFGABEN_HEADING);
  if (headingIndex === -1) {
    const newText = `${text}\n${AUFGABEN_HEADING}\n${taskLine}`;
    return { newText, line: newText.split("\n").length };
  }
  let sectionEnd = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      sectionEnd = i;
      break;
    }
  }
  let insertAt = headingIndex + 1;
  for (let i = headingIndex + 1; i < sectionEnd; i++) {
    if (lines[i].trim() !== "") insertAt = i + 1;
  }
  const newLines = [
    ...lines.slice(0, insertAt),
    taskLine,
    ...lines.slice(insertAt),
  ];
  return { newText: newLines.join("\n"), line: insertAt + 1 };
}

/** The note's text if it exists, else the Task_Inbox template when that is the missing target. */
function initialText(file: string, targetPath: string): string {
  if (existsSync(file)) return readFileSync(file, "utf8");
  if (targetPath === TASK_INBOX) return TASK_INBOX_TEMPLATE;
  return readFileSync(file, "utf8");
}

export type AppendResult =
  { ok: true; line: number; raw: string } | { ok: false };

/**
 * Append one task line to a note, creating `TASK_INBOX` from its template first when that is the
 * target and it does not exist yet. `targetPath` must already be resolved and validated by the
 * caller - see the dot-segment guard in routes/files.ts - except for staying inside the vault
 * once symlinks resolve, which is this function's own job under decision 4.
 */
export function appendTask(
  vaultDir: string,
  db: Database.Database,
  targetPath: string,
  taskLine: string,
): AppendResult {
  const file = path.join(vaultDir, targetPath);
  if (!resolvesInsideVault(vaultDir, file)) return { ok: false };
  const text = initialText(file, targetPath);
  const { newText, line } = insertUnderHeading(text, taskLine);
  atomicWrite(file, newText);
  indexNote(db, vaultDir, targetPath);
  resolveLinks(db);
  return { ok: true, line, raw: taskLine };
}
