import type Database from "better-sqlite3";
import path from "node:path";
import { expandTilde } from "../config.js";

export interface Handoff {
  slug: string;
  title: string;
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
  title: string;
  frontmatter: string;
  body: string;
}

const isH2 = (line: string): boolean => line.startsWith("## ");

/** The body of `## Zustand`; absent, the first H2 section; absent, "". */
export function zustandSection(body: string): string {
  const lines = body.split("\n");
  const zustand = lines.findIndex((line) => /^## Zustand\b/.test(line));
  const start = zustand === -1 ? lines.findIndex(isH2) : zustand;
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(isH2);
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
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
  if (!Array.isArray(frontmatter.repos)) return [];
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
      "SELECT path, title, frontmatter, body FROM notes WHERE folder = ? ORDER BY path",
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
      title: row.title,
      notePath: row.path,
      updated: parseUpdated(frontmatter.updated),
      repos: reposOf(frontmatter, file, warnings),
      zustand: zustandSection(row.body),
    });
  }
  return { handoffs, warnings };
}
