export type Priority = "highest" | "high" | "medium" | "low" | "lowest";

export interface Task {
  path: string;
  line: number;
  raw: string;
  text: string;
  done: boolean;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  priority: Priority | null;
  recurrence: string | null;
  doneAt: string | null;
  noteTitle: string;
  brand: string | null;
}

export interface TreeEntry {
  path: string;
  title: string;
  folder: string;
}

/** Where a task with no chosen note lands - the same default the server falls back to. */
export const TASK_INBOX = "00_Index/Task_Inbox.md";

export interface TodayView {
  overdue: Task[];
  dueToday: Task[];
  highPriority: Task[];
}

function isOpen(task: Task): boolean {
  return !task.done;
}

function ordinal(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/** Überfällig, Heute fällig and Hohe Priorität - the three lists the Heute tab renders. */
export function viewToday(tasks: Task[], today: string): TodayView {
  const open = tasks.filter(isOpen);
  return {
    overdue: open.filter((t) => t.due !== null && t.due < today),
    dueToday: open.filter((t) => t.due === today),
    highPriority: open.filter(
      (t) =>
        t.due === null && (t.priority === "highest" || t.priority === "high"),
    ),
  };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Due today through six days out, sorted by due date - the Woche tab's one list. */
export function viewWeek(tasks: Task[], today: string): Task[] {
  const end = addDays(today, 6);
  return tasks
    .filter(
      (t): t is Task & { due: string } =>
        isOpen(t) && t.due !== null && t.due >= today && t.due <= end,
    )
    .sort((a, b) => ordinal(a.due, b.due));
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

/** One group per note, alphabetical by title - the Projekt tab. */
export function groupByNote(tasks: Task[]): TaskGroup[] {
  const open = tasks.filter(isOpen);
  const byPath = new Map<string, TaskGroup>();
  for (const task of open) {
    const group = byPath.get(task.path) ?? {
      key: task.path,
      label: task.noteTitle,
      tasks: [],
    };
    group.tasks.push(task);
    byPath.set(task.path, group);
  }
  return [...byPath.values()].sort((a, b) => ordinal(a.label, b.label));
}

/** One group per brand, alphabetical, with the unbranded group - Ohne Marke - sorted last. The
    Marke tab. */
export function groupByBrand(tasks: Task[]): TaskGroup[] {
  const open = tasks.filter(isOpen);
  const byBrand = new Map<string | null, Task[]>();
  for (const task of open) {
    const group = byBrand.get(task.brand) ?? [];
    group.push(task);
    byBrand.set(task.brand, group);
  }
  const named = [...byBrand.keys()]
    .filter((brand): brand is string => brand !== null)
    .sort(ordinal);
  const order = byBrand.has(null) ? [...named, null] : named;
  return order.map((brand) => ({
    key: brand ?? "ohne-marke",
    label: brand ?? "Ohne Marke",
    tasks: byBrand.get(brand) ?? [],
  }));
}

/** Open tasks whose note carries no brand tag - the Unzugeordnet tab, shown alongside the Plaud
    panel. */
export function viewUnassigned(tasks: Task[]): Task[] {
  return tasks.filter((t) => isOpen(t) && t.brand === null);
}

/** The last 30 completed tasks, most recently finished first; a row with no doneAt sorts last. */
export function viewDone(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.done)
    .sort((a, b) => {
      if (a.doneAt === null) return b.doneAt === null ? 0 : 1;
      if (b.doneAt === null) return -1;
      return -ordinal(a.doneAt, b.doneAt);
    })
    .slice(0, 30);
}

/** The notes offered as a create-form target: the inbox plus every brand and project note. */
export function targetNotes(tree: TreeEntry[]): TreeEntry[] {
  return tree.filter(
    (entry) =>
      entry.path.startsWith("20_Brands/") ||
      entry.path.startsWith("30_Projekte/"),
  );
}

/** Where a Plaud item already landed, once imported. */
interface PlaudImported {
  targetPath: string;
  line: number;
}

/** The open vault task a Plaud item's Was overlaps with - the dedup hint's target. */
interface PlaudExisting {
  path: string;
  line: number;
  text: string;
}

export interface PlaudItem {
  rowHash: string;
  wer: string;
  was: string;
  bis: string;
  zeitmarke: string;
  imported: PlaudImported | null;
  existing: PlaudExisting | null;
}

export interface PlaudNote {
  file: string;
  title: string;
  date: string | null;
  source: string | null;
  items: PlaudItem[];
  openQuestions: string[];
  direct: string[];
  suggestedTarget: string;
}

export interface Issue {
  number: number;
  title: string;
  url: string;
  labels: string[];
}

export interface IssueRepo {
  label: string;
  issues: Issue[] | null;
}
