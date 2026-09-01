/**
 * Local, narrow shapes for what the Cockpit reads from three siblings' APIs, and the small
 * filters each panel needs. Deliberately not imported from vault, aufgaben or projekte - this
 * document stays free of any import from a sibling app, so these are kept here instead.
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
