import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const SKIP = new Set([
  "node_modules",
  "Library",
  "Applications",
  "Music",
  "Movies",
  "Pictures",
]);
/** Mirrors the vault scanner's rule, plus the macOS bulk folders a home-root scan must not enter. */
export function skippedDir(name: string): boolean {
  return name.startsWith(".") || SKIP.has(name);
}

const MAX_DEPTH = 3;

export function findRepos(roots: string[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (seen.has(dir)) return;
    seen.add(dir);
    if (existsSync(path.join(dir, ".git"))) {
      found.push(dir);
      return;
    }
    if (depth >= MAX_DEPTH) return;
    // A root the app does not control can hold unreadable directories; skipping one is the
    // expected outcome, not a failure of the scan.
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        skippedDir(entry.name)
      )
        continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  };
  for (const root of roots) {
    const resolved = path.resolve(root);
    if (existsSync(resolved)) walk(resolved, 0);
  }
  return [...found].sort((a, b) => Number(a > b) - Number(a < b));
}
