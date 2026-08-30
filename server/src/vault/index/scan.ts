import { readdirSync } from "node:fs";
import path from "node:path";

/** Obsidian's own folders and anything else hidden are not notes, whatever they contain. */
function skipped(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

function walk(dir: string, rel: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skipped(entry.name)) return [];
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return walk(path.join(dir, entry.name), relPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [relPath] : [];
  });
}

/**
 * Ordinal, not locale, comparison: default-locale collation treats `_` as near-ignorable, so
 * e.g. `_Brands_Overview.md` would sort next to `AEND.md` instead of before it, and the order
 * would depend on the machine's ICU data. Plain code-point order is what Obsidian shows too.
 */
function ordinal(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/** Every note under the vault as a vault-relative posix path, sorted. */
export function listNotes(vaultDir: string): string[] {
  return walk(vaultDir, "").sort(ordinal);
}

/** Whether a vault-relative path is a note the index should hold. */
export function isNotePath(relPath: string): boolean {
  const parts = relPath.split("/");
  return relPath.endsWith(".md") && !parts.slice(0, -1).some(skipped);
}
