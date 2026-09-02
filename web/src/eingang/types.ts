export interface InboxFile {
  dir: string;
  name: string;
  size: number;
  mtime: number;
  kind: "text" | "audio";
  status: "unverarbeitet" | "in_arbeit" | "notiz_vorhanden";
}

export type EingangJobKind =
  | "plaud-sync"
  | "plaud-process"
  | "aufgaben-import"
  | "controlling"
  | "vault-reindex"
  | "projekte-scan";

export type JobStatus = "running" | "done" | "failed" | "killed" | "timeout";

/** Matches server/src/eingang/db.ts's JobRow exactly - kind stays a bare string there since the
    row can outlive a JobKind union the server might narrow later. */
export interface JobRow {
  id: number;
  kind: string;
  argsJson: string;
  status: JobStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  logPath: string;
}

export interface ScheduledRun {
  label: string;
  day: number | null;
  hour: number | null;
  minute: number | null;
}

/** The two kinds the runner runs in-process rather than as a spawned child
    (server/src/eingang/jobs.ts JobPlan "internal") - killing one always answers 409 "internal
    jobs cannot be cancelled", so the UI never offers a button that can only fail. */
const INTERNAL_KINDS: readonly string[] = ["vault-reindex", "projekte-scan"];

export function canCancel(kind: string): boolean {
  return !INTERNAL_KINDS.includes(kind);
}

function dirBasename(dir: string): string {
  const parts = dir.split(/[/\\]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? "";
}

/** Only a file the server's plaud-process fence can reach gets a working button: it demands a
    bare filename that resolves under <plaudHome>/inbox (server/src/eingang/jobs.ts
    planPlaudProcess), so a file elsewhere - already reconciled, or sitting in a second watch dir -
    needs Einsammeln first, which is what actually moves a file into that folder. */
export function isProcessable(file: InboxFile): boolean {
  return (
    file.kind === "text" &&
    file.status === "unverarbeitet" &&
    dirBasename(file.dir) === "inbox"
  );
}
