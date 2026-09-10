import { watch, type FSWatcher } from "chokidar";
import path from "node:path";
import type Database from "better-sqlite3";
import { indexNote, removeNote, resolveLinks } from "./index/indexer.js";
import { isNotePath } from "./index/scan.js";

/**
 * Keep the index in step with the files. Chokidar reports absolute paths; the index speaks
 * vault-relative posix ones. awaitWriteFinish waits for an editor to finish writing, so a
 * half-saved note is never parsed.
 */
export function watchVault(
  db: Database.Database,
  vaultDir: string,
  onChange: () => void = () => undefined,
): FSWatcher {
  const rel = (file: string) =>
    path.relative(vaultDir, file).split(path.sep).join("/");
  const watcher = watch(vaultDir, {
    ignoreInitial: true,
    ignored: (file) =>
      rel(file)
        .split("/")
        .some((part) => part.startsWith(".") || part === "node_modules"),
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  const changed = (file: string) => {
    const relPath = rel(file);
    if (!isNotePath(relPath)) return;
    // A note already gone again by the time we read it is not a change worth announcing; the
    // unlink event that follows it does the rest.
    if (!indexNote(db, vaultDir, relPath)) return;
    resolveLinks(db);
    onChange();
  };
  const removed = (file: string) => {
    const relPath = rel(file);
    if (!isNotePath(relPath)) return;
    removeNote(db, relPath);
    resolveLinks(db);
    onChange();
  };
  watcher.on("add", changed).on("change", changed).on("unlink", removed);
  return watcher;
}
