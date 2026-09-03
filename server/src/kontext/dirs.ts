import { readdirSync } from "node:fs";

/** Subdirectory names directly inside `dir`, in readdir order; `[]` when `dir` is unreadable. */
export function directoryNames(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((e) => e.name);
}
