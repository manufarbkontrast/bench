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

/** Every note under the vault as a vault-relative posix path, sorted. */
export function listNotes(vaultDir: string): string[] {
  return walk(vaultDir, "").sort((a, b) => a.localeCompare(b));
}

/** Whether a vault-relative path is a note the index should hold. */
export function isNotePath(relPath: string): boolean {
  const parts = relPath.split("/");
  return relPath.endsWith(".md") && !parts.slice(0, -1).some(skipped);
}
