import type Database from "better-sqlite3";
import path from "node:path";
import { expandTilde } from "../config.js";

export interface Handoff {
  slug: string;
  title: string; // the note's first H1, else the slug
  notePath: string;
  updated: string | null;
  repos: string[];
  zustand: string;
}

export interface HandoffsResult {
  handoffs: Handoff[];
  warnings: string[];
}

// Equality, not LIKE '50_Workflow/%': the underscore is a LIKE wildcard, and a sibling folder
// such as 50xWorkflow would match.
const HANDOFF_FOLDER = "50_Workflow/Handoffs";

interface NoteRow {
  path: string;
  frontmatter: string;
  body: string;
}

const isH1 = (line: string): boolean => line.startsWith("# ");
const isH2 = (line: string): boolean => line.startsWith("## ");

const FENCE = /^(```|~~~)/;

// Handoffs are free-form notes, not the fixed-shape machine output the scanner style below was
// borrowed from - a `## ` or `# ` line inside a fenced code block must not read as a real
// heading. Mirrors wikilinks.ts's stripCodeBlocks, blanking fenced lines rather than dropping
// them so line positions still line up with the original `lines` array; the import is forbidden,
// same as EXCLUDED_FOLDERS in stand.ts.
function maskFencedLines(lines: string[]): string[] {
  let inFence = false;
  return lines.map((line) => {
    if (FENCE.test(line.trim())) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  });
}

/** The body of `## Zustand`; absent, the first H2 section; absent, "". */
export function zustandSection(body: string): string {
  const lines = body.split("\n");
  const masked = maskFencedLines(lines);
  const zustand = masked.findIndex((line) => /^## Zustand\b/.test(line));
  const start = zustand === -1 ? masked.findIndex(isH2) : zustand;
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = masked.slice(start + 1).findIndex(isH2);
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

/** A project is named by its slug; a handoff's H1 is only ever a subtitle beneath it, so this
    reads that H1 verbatim rather than the note's own filename-derived title. Falls back to the
    slug when the body has none. Not exported: only vaultHandoffs below calls it, and both new
    cases are covered through that function in handoffs.test.ts. */
function handoffTitle(body: string, slug: string): string {
  const lines = body.split("\n");
  const index = maskFencedLines(lines).findIndex(isH1);
  return index === -1 ? slug : lines[index].slice(2).trim();
}

// gray-matter turns an unquoted date into a Date, which the index serialises as an ISO datetime;
// a quoted one stays a bare date. Both start with the ten characters this reads.
export function parseUpdated(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
}

function reposOf(
  frontmatter: Record<string, unknown>,
  file: string,
  warnings: string[],
): string[] {
  if (!Array.isArray(frontmatter.repos)) {
    if (frontmatter.repos !== undefined)
      warnings.push(`repos ist keine Liste in ${file}`);
    return [];
  }
  const repos: string[] = [];
  for (const entry of frontmatter.repos) {
    if (typeof entry === "string" && entry !== "")
      repos.push(path.resolve(expandTilde(entry)));
    else warnings.push(`Ungültiger repos-Eintrag in ${file}`);
  }
  return repos;
}

export function vaultHandoffs(vaultDb: Database.Database): HandoffsResult {
  const rows = vaultDb
    .prepare(
      "SELECT path, frontmatter, body FROM notes WHERE folder = ? ORDER BY path",
    )
    .all(HANDOFF_FOLDER) as NoteRow[];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const handoffs: Handoff[] = [];
  for (const row of rows) {
    const file = path.posix.basename(row.path);
    const frontmatter = JSON.parse(row.frontmatter) as Record<string, unknown>;
    const projekt = frontmatter.projekt;
    if (typeof projekt !== "string" || projekt.trim() === "") {
      warnings.push(`Handoff ohne projekt: ${file}`);
      continue;
    }
    const slug = projekt.trim().toLowerCase();
    // First note path wins, like couple.ts's dedupe of duplicate project paths.
    if (seen.has(slug)) {
      warnings.push(`Doppelter Slug ${slug}: ${file}`);
      continue;
    }
    seen.add(slug);
    handoffs.push({
      slug,
      title: handoffTitle(row.body, slug),
      notePath: row.path,
      updated: parseUpdated(frontmatter.updated),
      repos: reposOf(frontmatter, file, warnings),
      zustand: zustandSection(row.body),
    });
  }
  return { handoffs, warnings };
}
