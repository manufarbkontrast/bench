/** Controlling run folders: listing, and resolving which one is "the last run". */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface RunFolder {
  folder: string;
  stichtag: string;
  modus: "zwischenstand" | "abschluss";
}

const RUN_FOLDER = /^(\d{4}-\d{2}-\d{2})-(zwischenstand|abschluss)$/;

/** Whether `name` matches the run-folder shape exactly - the fence routes.ts checks first. */
export function isRunFolderName(name: string): boolean {
  return RUN_FOLDER.test(name);
}

function parseRunFolderName(name: string): RunFolder | null {
  const match = RUN_FOLDER.exec(name);
  return match
    ? {
        folder: name,
        stichtag: match[1],
        modus: match[2] as "zwischenstand" | "abschluss",
      }
    : null;
}

function byFolderDescending(a: RunFolder, b: RunFolder): number {
  if (a.folder === b.folder) return 0;
  return a.folder < b.folder ? 1 : -1;
}

/** Subfolders of `dir` matching the run-folder shape, newest first by name; [] when unreadable. */
export function listRuns(dir: string): RunFolder[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const runs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseRunFolderName(entry.name))
    .filter((run): run is RunFolder => run !== null);
  return runs.toSorted(byFolderDescending);
}

interface LetzterLaufFile {
  ordner: unknown;
  bestellungen: unknown;
}

function readLetzterLauf(dir: string): LetzterLaufFile | null {
  try {
    const raw = readFileSync(path.join(dir, "letzter-lauf.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as LetzterLaufFile)
      : null;
  } catch {
    return null;
  }
}

/** `bestellungen` from `dir`'s letzter-lauf.json when the field is a number, else null. */
export function bestellungenFor(dir: string): number | null {
  const data = readLetzterLauf(dir);
  return data !== null && typeof data.bestellungen === "number"
    ? data.bestellungen
    : null;
}

/**
 * letzter-lauf.json's `ordner` is an absolute path written by the real skill on another machine -
 * the fixture in this repo carries an invented one that never exists here, and a real install's
 * own path is still not this process's to trust. Only the basename is used, and only once it is
 * confirmed to name a folder that actually exists in `dir` and still has the run-folder shape;
 * otherwise this falls back to the newest folder listRuns finds.
 */
export function lastRun(dir: string): RunFolder | null {
  const data = readLetzterLauf(dir);
  if (data !== null && typeof data.ordner === "string") {
    const name = path.basename(data.ordner);
    const run = parseRunFolderName(name);
    const target = path.join(dir, name);
    if (run !== null && existsSync(target) && statSync(target).isDirectory())
      return run;
  }
  const runs = listRuns(dir);
  return runs.length > 0 ? runs[0] : null;
}
