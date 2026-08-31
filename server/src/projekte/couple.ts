import type Database from "better-sqlite3";
import path from "node:path";
import { expandTilde } from "../config.js";

export interface Coupling {
  notePath: string;
  projectPath: string;
  brand: string | null;
  status: string | null;
}

interface NoteRow {
  path: string;
  frontmatter: string;
}

interface TagRow {
  tag: string;
}

function ordinal(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

function tagWithPrefix(tags: string[], prefix: string): string | null {
  const found = tags.find((t) => t.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

/**
 * One coupling per note whose frontmatter names a project path - the vault side of the
 * path/brand/status convention a later pipeline matches against scanned repos. Sorted by
 * notePath so a dedupe against duplicate project paths deterministically keeps the first.
 */
export function vaultCouplings(vaultDb: Database.Database): Coupling[] {
  const notes = vaultDb
    .prepare("SELECT path, frontmatter FROM notes")
    .all() as NoteRow[];
  const tagsFor = vaultDb.prepare("SELECT tag FROM tags WHERE path = ?");
  const couplings: Coupling[] = [];
  for (const note of notes) {
    const frontmatter = JSON.parse(note.frontmatter) as Record<string, unknown>;
    if (typeof frontmatter.path !== "string" || frontmatter.path === "")
      continue;
    const tags = (tagsFor.all(note.path) as TagRow[]).map((t) => t.tag);
    couplings.push({
      notePath: note.path,
      projectPath: path.resolve(expandTilde(frontmatter.path)),
      brand: tagWithPrefix(tags, "brand/"),
      status: tagWithPrefix(tags, "status/"),
    });
  }
  return couplings.sort((a, b) => ordinal(a.notePath, b.notePath));
}
