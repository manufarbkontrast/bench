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

/** Mirrors GET /api/projekte/stand's ProjektStand (server/src/projekte/stand.ts), narrowed to
    what the Cockpit's handoff row renders - not the repos or notePath, which the panel never
    shows. A project is named by its slug (the row's own text), so `title` - the handoff's H1,
    only ever a subtitle in the Projekte app's own card - is not read here and stays out. */
export interface HandoffRow {
  slug: string;
  updated: string | null;
  missingRepos: string[];
  signals: {
    veraltet: boolean;
    dirtyRepos: number;
    offeneTasks: number;
    plaudNotizen: number;
  };
}

/** Mirrors StandReply, minus `warnings` - the panel has nowhere to show them. */
export interface StandReply {
  projekte: HandoffRow[];
  ohneProjekt: Project[];
}

/** Handoffs shown before the panel folds the rest into "… und n weitere". */
export const HANDOFF_ROWS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two YYYY-MM-DD strings, today minus updated; null without a date. Both
    sides go through Date.UTC of their parsed parts, so a viewer's own offset never enters it -
    the same trick server/src/projekte/stand.ts's localDay uses in the other direction. */
function ageDays(updated: string | null, today: string): number | null {
  if (updated === null) return null;
  const [uy, um, ud] = updated.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(uy, um - 1, ud)) / DAY_MS,
  );
}

function ageText(days: number | null): string {
  if (days === null) return "Datum fehlt";
  if (days === 0) return "heute";
  if (days === 1) return "vor 1 Tag";
  return `vor ${String(days)} Tagen`;
}

/** The same wording as web/src/projekte/stand.ts's standHints, written again here rather than
    imported - this document never imports from a sibling app (see the top comment). */
function handoffHints(row: HandoffRow): string[] {
  const hints: string[] = [];
  if (row.signals.veraltet) hints.push("Stand veraltet");
  if (row.signals.dirtyRepos === 1) hints.push("1 Repo ungesichert");
  else if (row.signals.dirtyRepos > 1)
    hints.push(`${String(row.signals.dirtyRepos)} Repos ungesichert`);
  if (row.signals.offeneTasks === 1) hints.push("1 offene Aufgabe");
  else if (row.signals.offeneTasks > 1)
    hints.push(`${String(row.signals.offeneTasks)} offene Aufgaben`);
  if (row.signals.plaudNotizen === 1) hints.push("1 Plaud-Notiz seit Handoff");
  else if (row.signals.plaudNotizen > 1)
    hints.push(
      `${String(row.signals.plaudNotizen)} Plaud-Notizen seit Handoff`,
    );
  for (const name of row.missingRepos)
    hints.push(`Repo nicht gefunden: ${name}`);
  return hints;
}

/** A handoff row's meta line - age first, then the same staleness/dirty-repo/open-task/
    Plaud-note/missing hints the Projekte app's own Stand card shows, joined the same way. */
export function handoffMeta(row: HandoffRow, today: string): string {
  return [ageText(ageDays(row.updated, today)), ...handoffHints(row)].join(
    " · ",
  );
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
