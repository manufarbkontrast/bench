/** German summaries for an inbox file: size in KB/MB and the medium date - Aufgaben's format.ts
    duplicated deliberately rather than imported, per PROJECT.md's per-app boundary. */
import { isEingangJobKind } from "./types";
import type {
  EingangJobKind,
  InboxFile,
  JobRow,
  JobStatus,
  ScheduledRun,
} from "./types";

const KB = 1024;
const MB = KB * 1024;

export const EM_DASH = "—";

const NUMBER = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function sizeText(bytes: number): string {
  if (bytes >= MB) return `${NUMBER.format(bytes / MB)} MB`;
  return `${NUMBER.format(bytes / KB)} KB`;
}

export function dateText(mtime: number): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(mtime),
  );
}

/** The muted meta line under a file's name: size and mtime, joined the way Aufgaben's metaText
    joins a task's dates. */
export function fileMetaText(file: InboxFile): string {
  return `${sizeText(file.size)} · ${dateText(file.mtime)}`;
}

interface JobArgs {
  file?: string;
  modus?: string;
}

/** argsJson is always what routes.ts wrote with JSON.stringify(args) for this same kind, so no
    validation is needed reading it back. */
function jobArgs(job: Pick<JobRow, "argsJson">): JobArgs {
  return JSON.parse(job.argsJson) as JobArgs;
}

/** One labeler per known kind, keyed by the EingangJobKind union itself - Record forces every
    member to have an entry, so adding a kind to the union without adding its label here is a
    compile error (TS2739 "missing property"), not a silent fallback to the raw slug. This is
    what jobKindLabel's default branch used to be: a switch with `default: return job.kind`
    compiles for a new, unlabeled kind too, since this tsconfig does not set noImplicitReturns -
    the missing-key check on this object literal is what actually catches it. */
const KNOWN_KIND_LABEL: Record<EingangJobKind, (args: JobArgs) => string> = {
  "plaud-sync": () => "Einsammeln",
  // The runner never starts these two kinds without a file arg (jobs.ts planPlaudProcess /
  // planAufgabenImport), so the union member TypeScript cannot narrow away is one this string
  // always carries.
  "plaud-process": (args) => `Verarbeiten: ${args.file!}`,
  "aufgaben-import": (args) => `Aufgaben-Import: ${args.file!}`,
  controlling: (args) => `Controlling (${args.modus!})`,
  "vault-reindex": () => "Vault-Reindex",
  "projekte-scan": () => "Projekte-Scan",
};

/** The job's row in the Jobs table and the LogView header both read this - one place for what a
    kind plus its args means to a person. A kind this build does not recognise (retired, or from
    a future server) renders as its own raw slug rather than throwing. */
export function jobKindLabel(job: Pick<JobRow, "kind" | "argsJson">): string {
  if (!isEingangJobKind(job.kind)) return job.kind;
  return KNOWN_KIND_LABEL[job.kind](jobArgs(job));
}

const STATUS_LABEL: Record<JobStatus, string> = {
  running: "Läuft",
  done: "Fertig",
  failed: "Fehlgeschlagen",
  killed: "Abgebrochen",
  timeout: "Zeitüberschreitung",
};

export function jobStatusLabel(status: JobStatus): string {
  return STATUS_LABEL[status];
}

export function dateTimeText(ms: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

/** Minutes:seconds since the job started, against finishedAt once there is one and against
    `now` (passed in rather than read from Date.now() here, so a caller with a fixed clock stays
    deterministic) while it still runs. */
export function durationText(
  job: Pick<JobRow, "startedAt" | "finishedAt">,
  now: number,
): string {
  const end = job.finishedAt ?? now;
  const totalSeconds = Math.max(0, Math.floor((end - job.startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function twoDigits(n: number | null): string {
  return n === null ? EM_DASH : String(n).padStart(2, "0");
}

export function scheduledRunText(run: ScheduledRun): string {
  const day = run.day === null ? EM_DASH : String(run.day);
  return `${run.label} ${EM_DASH} Tag ${day}, ${twoDigits(run.hour)}:${twoDigits(run.minute)} Uhr`;
}
