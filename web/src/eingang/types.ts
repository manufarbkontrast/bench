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
  | "projekte-scan"
  | "plaud-fetch";

export type JobStatus = "running" | "done" | "failed" | "killed" | "timeout";

const EINGANG_JOB_KINDS = [
  "plaud-sync",
  "plaud-process",
  "aufgaben-import",
  "controlling",
  "vault-reindex",
  "projekte-scan",
  "plaud-fetch",
] as const satisfies readonly EingangJobKind[];

/** The literal union of members `EINGANG_JOB_KINDS` actually lists. `satisfies` above already
    makes the compiler reject a listed member that is not an EingangJobKind (soundness); this
    type exists only so format.test.ts can pin the other direction with `expectTypeOf` - every
    EingangJobKind member is actually listed (completeness) - without exporting the array itself. */
export type ListedEingangJobKind = (typeof EINGANG_JOB_KINDS)[number];

/** Narrows a job row's bare `kind` string to the known union - a job started before a kind was
    retired, or one this build genuinely does not know, still has to render something, so this
    stays a runtime check rather than a type assertion. `EINGANG_JOB_KINDS` staying in step with
    EingangJobKind is now half compiler-enforced: `satisfies` catches a listed member the union
    does not have, and format.test.ts's `expectTypeOf<EingangJobKind>().toEqualTypeOf<
    ListedEingangJobKind>()` catches a union member the array fails to list - both checked by
    `tsc` (npm run typecheck / check), since vitest's own typecheck runner is not enabled here and
    `vitest run` alone executes expectTypeOf as a no-op. server/src/eingang/jobs.ts's JOB_KINDS
    still tracks its own, separate JobKind union by hand; format.ts's
    Record<EingangJobKind, ...> label map is what forces a compile error there when a new member
    is added without a label. */
export function isEingangJobKind(kind: string): kind is EingangJobKind {
  return (EINGANG_JOB_KINDS as readonly string[]).includes(kind);
}

/** Matches server/src/eingang/db.ts's JobRow, plus the `verwaist` flag every jobs route adds on
    top (server/src/eingang/routes.ts's withVerwaist) - kind stays a bare string there since the
    row can outlive a JobKind union the server might narrow later. `verwaist` is not a database
    column: it is computed per request from whether the runner's own in-flight map still holds the
    row's id, so do not go looking for it in db.ts's schema. */
export interface JobRow {
  id: number;
  kind: string;
  argsJson: string;
  status: JobStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  logPath: string;
  pid: number | null;
  verwaist: boolean;
}

export interface ScheduledRun {
  label: string;
  day: number | null;
  hour: number | null;
  minute: number | null;
}

/** The three kinds the runner runs in-process rather than as a spawned child
    (server/src/eingang/jobs.ts JobPlan "internal") - killing one always answers 409 "internal
    jobs cannot be cancelled", so the UI never offers a button that can only fail. */
const INTERNAL_KINDS: readonly string[] = [
  "vault-reindex",
  "projekte-scan",
  "plaud-fetch",
];

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

/** Where a Plaud listing came from - every source but "mcp" and "sample" answers an empty
    recording list (server's plaud route), so the panel shows a source line in place of rows. */
export type PlaudSource =
  "mcp" | "sample" | "off" | "unauthenticated" | "unreachable";

export type RecordingStatus =
  "neu" | "wird_geholt" | "im_eingang" | "im_archiv" | "notiz_vorhanden";

export interface Recording {
  id: string;
  titel: string;
  start: string; // "YYYY-MM-DDTHH:MM:SS", local, no zone
  dauer: number; // milliseconds
  status: RecordingStatus;
}

export interface PlaudReply {
  source: PlaudSource;
  recordings: Recording[];
  nextPage: number | null;
}
