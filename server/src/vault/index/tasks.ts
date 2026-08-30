import { stripCodeBlocks } from "./wikilinks.js";

// Not exported: only used as a field type below, so nothing outside this module needs the name.
type Priority = "highest" | "high" | "medium" | "low" | "lowest";

export interface ParsedTask {
  raw: string;
  text: string;
  done: boolean;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  priority: Priority | null;
  recurrence: string | null;
  doneAt: string | null;
}

const TASK = /^\s*[-*+] \[([ xX])\] (.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const FIELDS: { key: keyof ParsedTask; re: RegExp }[] = [
  { key: "due", re: new RegExp(`\\s*📅\\s*${DATE}`) },
  { key: "scheduled", re: new RegExp(`\\s*⏳\\s*${DATE}`) },
  { key: "start", re: new RegExp(`\\s*🛫\\s*${DATE}`) },
  { key: "doneAt", re: new RegExp(`\\s*✅\\s*${DATE}`) },
];
const PRIORITIES: [string, Priority][] = [
  ["🔺", "highest"],
  ["⏫", "high"],
  ["🔼", "medium"],
  ["🔽", "low"],
  ["⏬", "lowest"],
];
/**
 * Recurrence runs to the next emoji field or the end of the line. No leading `\s*`: a second
 * quantifier ahead of the capture is what sonarjs flags as super-linear, and it is not needed -
 * `exec` finds 🔁 wherever it sits, and the final whitespace collapse on `text` below cleans up
 * whatever is left behind either way.
 */
const RECURRENCE = /🔁([^📅⏳🛫✅🔺⏫🔼🔽⏬]+)/u;

/** One line in the Tasks-plugin grammar, or null when the line is not a task at all. */
export function parseTaskLine(line: string): ParsedTask | null {
  const m = TASK.exec(line);
  if (!m) return null;
  const fields: Record<
    "due" | "scheduled" | "start" | "doneAt",
    string | null
  > = {
    due: null,
    scheduled: null,
    start: null,
    doneAt: null,
  };
  let rest = m[2];
  for (const { key, re } of FIELDS) {
    const hit = re.exec(rest);
    if (hit) {
      fields[key as keyof typeof fields] = hit[1];
      rest = rest.replace(hit[0], "");
    }
  }
  const rec = RECURRENCE.exec(rest);
  const recurrence = rec ? rec[1].trim() : null;
  if (rec) rest = rest.replace(rec[0], "");
  const prio = PRIORITIES.find(([emoji]) => rest.includes(emoji));
  if (prio) rest = rest.replace(prio[0], "");
  return {
    raw: line,
    text: rest.replace(/\s+/g, " ").trim(),
    done: m[1] !== " ",
    ...fields,
    priority: prio ? prio[1] : null,
    recurrence,
  };
}

/** Every task in the prose, with its 1-based line number in the original body. */
export function extractTasks(body: string): (ParsedTask & { line: number })[] {
  return stripCodeBlocks(body)
    .split("\n")
    .flatMap((line, i) => {
      const task = parseTaskLine(line);
      return task ? [{ ...task, line: i + 1 }] : [];
    });
}
