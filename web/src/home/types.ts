/**
 * Local, narrow shapes for what the Cockpit reads from four siblings' APIs, and the small
 * filters each panel needs. Deliberately not imported from aufgaben, projekte, eingang or
 * zahlen - this document stays free of any import from a sibling app, so these are kept here
 * instead.
 */

export interface Task {
  path: string;
  line: number;
  text: string;
  done: boolean;
  due: string | null;
  doneAt: string | null;
}

export interface Project {
  path: string;
  name: string;
  dirty: number;
  ahead: number | null;
  behind: number | null;
  lastCommitAt: number | null;
}

/** Mirrors the `status` field of eingang's InboxFile - duplicated rather than imported, since
    this document never imports from a sibling app (see the file's own top comment), and the
    panel needs nothing else from the reply. */
export interface InboxFile {
  status: "unverarbeitet" | "in_arbeit" | "notiz_vorhanden";
}

/** Mirrors zahlen's Kpi (server/src/zahlen/summary.ts) - the same duplicate-rather-than-import
    rule as InboxFile above. */
export interface Kpi {
  kennzahl: string;
  vergleich: string;
  aktuell: string;
  veraenderung: string;
}

/** Mirrors zahlen's RunFolder, narrowed to what the run line needs - stichtag and modus, not the
    folder name the panel never links to. Not exported: ZahlenReply is the only shape a caller
    outside this document needs. */
interface Run {
  stichtag: string;
  modus: "zwischenstand" | "abschluss";
}

/** Mirrors GET /api/zahlen/last's reply (server/src/zahlen/routes.ts RunDetail), narrowed to
    what the panel renders - the run line, the KPI rows and the break-even bullets. */
export type ZahlenReply =
  { run: null } | { run: Run; kpis: Kpi[]; breakEven: string[] };

function ordinal(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/** Open tasks due before today, earliest first - the Überfällig panel. */
export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter(
      (t): t is Task & { due: string } =>
        !t.done && t.due !== null && t.due < today,
    )
    .sort((a, b) => ordinal(a.due, b.due));
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Open tasks due today through six days out, earliest first - the Diese-Woche panel. */
export function weekTasks(tasks: Task[], today: string): Task[] {
  const end = addDays(today, 6);
  return tasks
    .filter(
      (t): t is Task & { due: string } =>
        !t.done && t.due !== null && t.due >= today && t.due <= end,
    )
    .sort((a, b) => ordinal(a.due, b.due));
}

/** The last 5 completed tasks, most recently finished first; a row with no doneAt sorts last -
    the Zuletzt-erledigt panel. */
export function recentDone(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.done)
    .sort((a, b) => {
      if (a.doneAt === null) return b.doneAt === null ? 0 : 1;
      if (b.doneAt === null) return -1;
      return -ordinal(a.doneAt, b.doneAt);
    })
    .slice(0, 5);
}

/** Files still needing action - the Eingang panel's count. */
export function unverarbeitetCount(files: InboxFile[]): number {
  return files.filter((f) => f.status === "unverarbeitet").length;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Projects with an uncommitted or unsynced change, or a commit in the last week - the
    Projekte-in-Bewegung panel, most recently active first. */
export function movingProjects(projects: Project[], now: number): Project[] {
  return projects
    .filter(
      (p) =>
        p.dirty > 0 ||
        (p.ahead !== null && p.ahead > 0) ||
        (p.behind !== null && p.behind > 0) ||
        (p.lastCommitAt !== null && p.lastCommitAt >= now - WEEK_MS),
    )
    .sort((a, b) => (b.lastCommitAt ?? 0) - (a.lastCommitAt ?? 0));
}

const ZAHLEN_KENNZAHLEN = ["Umsatz gesamt", "Google-ROAS"];

/** The panel's two KPI rows, picked from the parsed table by exact Kennzahl match in this fixed
    order; a row the reply does not carry is omitted rather than padded - the Zahlen panel. */
export function zahlenKpis(kpis: Kpi[]): Kpi[] {
  return ZAHLEN_KENNZAHLEN.flatMap((name) => {
    const row = kpis.find((k) => k.kennzahl === name);
    return row === undefined ? [] : [row];
  });
}
