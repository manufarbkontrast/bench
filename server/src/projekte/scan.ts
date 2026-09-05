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
  // A plain seen-Set would make a nested configured root a no-op when its parent is scanned
  // first (PROJECT_ROOTS=~/Downloads:~/Downloads/Projekte): the parent's walk already marks
  // Projekte as visited on its way past, several levels deep, so the nested root's own walk -
  // which needs to start counting from depth 0 - would short-circuit on that stale visit and
  // never reach a repo its own depth budget could otherwise find. Tracking the best (smallest)
  // depth a directory was reached at instead makes the walk order-independent: a root visiting a
  // directory shallower than before re-opens it.
  const best = new Map<string, number>();
  const foundPaths = new Set<string>();
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if ((best.get(dir) ?? Infinity) <= depth) return;
    best.set(dir, depth);
    if (existsSync(path.join(dir, ".git"))) {
      if (!foundPaths.has(dir)) {
        foundPaths.add(dir);
        found.push(dir);
      }
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
