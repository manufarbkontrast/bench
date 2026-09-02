import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface InboxFile {
  dir: string;
  name: string;
  size: number;
  mtime: number;
  kind: "text" | "audio";
  status: "unverarbeitet" | "in_arbeit" | "notiz_vorhanden";
}

const AUDIO_EXTENSIONS = new Set([".m4a", ".mp3", ".wav"]);
const NAME_PATTERN = /transcript|transkript|besprechung/i;

/** The Plaud inbox's `_HIER-...` marker and any dotfile are never inbox material. */
function skipped(name: string): boolean {
  return name.startsWith(".") || name.startsWith("_");
}

function matches(name: string, ext: string): boolean {
  return NAME_PATTERN.test(name) || AUDIO_EXTENSIONS.has(ext);
}

/**
 * The eingang app does not import aufgaben modules - apps stay separate, per PROJECT.md's per-app
 * boundary - so this is a small, deliberate duplicate of the tolerant frontmatter scan
 * aufgaben/plaud.ts established: a note's own titel can carry its own ": " (e.g. "08-18
 * Besprechung: Q4-Planungslogik"), which a YAML parser rejects as an incomplete mapping. Scanning
 * each line up to its first ": " is what actually matches the source and needs no YAML semantics.
 */
export function quelleOf(noteText: string): string | null {
  const lines = noteText.split("\n");
  if (lines[0] !== "---") return null;
  const closing = lines.indexOf("---", 1);
  if (closing === -1) return null;
  for (const line of lines.slice(1, closing)) {
    const sep = line.indexOf(": ");
    if (sep === -1) continue;
    if (line.slice(0, sep) === "quelle") return line.slice(sep + 2).trim();
  }
  return null;
}

/** Names directly inside `dir`, files only, no recursion; [] when `dir` does not exist. */
function fileNames(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

/**
 * Every `quelle` a note in `notizenDir` names, computed once per `listInbox` call rather than
 * per candidate file - `listInbox` is the polled listing endpoint, and re-reading every note for
 * every inbox file makes the scan O(files x notes) instead of O(files + notes).
 */
function noteQuellen(notizenDir: string): Set<string> {
  const quellen = new Set<string>();
  for (const name of fileNames(notizenDir)) {
    if (!name.endsWith(".md")) continue;
    const text = readFileSync(path.join(notizenDir, name), "utf8");
    const quelle = quelleOf(text);
    if (quelle !== null) quellen.add(quelle);
  }
  return quellen;
}

/**
 * Archive and note both mean the same job already produced a result, so either wins over
 * inFlight - a job can be running for a file that a previous run already turned into a note.
 */
function statusOf(
  name: string,
  archivDir: string,
  quellen: Set<string>,
  inFlight: Set<string>,
): InboxFile["status"] {
  if (existsSync(path.join(archivDir, name))) return "notiz_vorhanden";
  if (quellen.has(name)) return "notiz_vorhanden";
  if (inFlight.has(name)) return "in_arbeit";
  return "unverarbeitet";
}

function inboxFile(
  dir: string,
  name: string,
  archivDir: string,
  quellen: Set<string>,
  inFlight: Set<string>,
): InboxFile {
  const ext = path.extname(name).toLowerCase();
  const stat = statSync(path.join(dir, name));
  return {
    dir,
    name,
    size: stat.size,
    mtime: Math.round(stat.mtimeMs),
    kind: AUDIO_EXTENSIONS.has(ext) ? "audio" : "text",
    status: statusOf(name, archivDir, quellen, inFlight),
  };
}

/**
 * Every matching file directly inside each watch dir, reconciled against the Plaud archive and
 * notes, newest first. `inFlight` holds the file names a running job is processing - the routes
 * compose it from the jobs table (Task 5); this module stays pure and takes it as data.
 */
export function listInbox(
  watchDirs: string[],
  plaud: { notizenDir: string; archivDir: string },
  inFlight: Set<string>,
): InboxFile[] {
  const quellen = noteQuellen(plaud.notizenDir);
  const files = watchDirs.flatMap((dir) =>
    fileNames(dir)
      .filter((name) => !skipped(name))
      .filter((name) => matches(name, path.extname(name).toLowerCase()))
      .map((name) => inboxFile(dir, name, plaud.archivDir, quellen, inFlight)),
  );
  return files.toSorted((a, b) => b.mtime - a.mtime);
}
