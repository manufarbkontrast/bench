import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { scanFrontmatter } from "../shared/frontmatter.js";

export interface PlaudItem {
  rowHash: string;
  wer: string;
  was: string;
  bis: string;
  zeitmarke: string;
}

export interface PlaudNote {
  file: string;
  title: string;
  date: string | null;
  source: string | null;
  items: PlaudItem[];
  openQuestions: string[];
  direct: string[];
}

function firstHeading(lines: string[]): string | null {
  for (const line of lines) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return null;
}

/** The lines strictly between an exact `## <name>` heading and the next `## ` heading, or []. */
function sectionLines(lines: string[], name: string): string[] {
  const heading = `## ${name}`;
  const start = lines.indexOf(heading);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

/** A pipe-delimited row's cells, trimmed, with the empty leading/trailing split dropped. */
function tableCells(line: string): string[] {
  const cells = line.split("|").map((cell) => cell.trim());
  const start = cells[0] === "" ? 1 : 0;
  const end = cells[cells.length - 1] === "" ? cells.length - 1 : cells.length;
  return cells.slice(start, end);
}

const SEPARATOR_CELL = /^:?-+:?$/;

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

function stripBackticks(cell: string): string {
  return cell.startsWith("`") && cell.endsWith("`") && cell.length >= 2
    ? cell.slice(1, -1)
    : cell;
}

function rowHash(wer: string, was: string, bis: string): string {
  return createHash("sha256").update(`${wer}|${was}|${bis}`).digest("hex");
}

function parseItems(lines: string[]): PlaudItem[] {
  const items: PlaudItem[] = [];
  let sawHeader = false;
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cells = tableCells(line);
    if (isSeparatorRow(cells)) continue;
    if (!sawHeader) {
      sawHeader = true;
      continue;
    }
    if (cells.length < 4) continue;
    const [wer, was, bis, zeitmarkeRaw] = cells;
    items.push({
      rowHash: rowHash(wer, was, bis),
      wer,
      was,
      bis,
      zeitmarke: stripBackticks(zeitmarkeRaw),
    });
  }
  return items;
}

function bullets(lines: string[]): string[] {
  return lines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

/** A processed Plaud note - title/date/source from frontmatter, and its three tracked sections. */
export function parsePlaudNote(file: string, text: string): PlaudNote {
  const { fields, body } = scanFrontmatter(text);
  const lines = body.split("\n");
  return {
    file,
    title: fields.get("titel") ?? firstHeading(lines) ?? file,
    date: fields.get("datum") ?? null,
    source: fields.get("quelle") ?? null,
    items: parseItems(sectionLines(lines, "Arbeitsaufträge")),
    openQuestions: bullets(sectionLines(lines, "Offene Fragen")),
    direct: bullets(sectionLines(lines, "Direkt erledigbar")),
  };
}

function byNameDescending(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/** `.md` basenames in `dir`, newest first by the date-prefixed naming convention. */
export function listPlaudNotes(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith(".md")).sort(byNameDescending);
}
