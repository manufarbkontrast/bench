/** German summaries for a vault task: dates, priority, the muted meta line and the note link. */
import type { Priority, Task } from "./types";

const EM_DASH = "—";

const PRIORITY_LABEL: Record<Priority, string> = {
  highest: "Höchste",
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
  lowest: "Niedrigste",
};

export function priorityText(priority: Priority): string {
  return PRIORITY_LABEL[priority];
}

export function dateText(date: string | null): string {
  if (date === null) return EM_DASH;
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(y, m - 1, d),
  );
}

export function noteHref(path: string): string {
  return `/vault/n/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The muted meta line under a task's text: due, scheduled, priority and recurrence, each only
    when present, joined the way deltaText joins a checkout's change counts. */
export function metaText(task: Task): string | null {
  const parts = [
    task.due !== null ? `Fällig ${dateText(task.due)}` : null,
    task.scheduled !== null ? `Geplant ${dateText(task.scheduled)}` : null,
    task.priority !== null ? priorityText(task.priority) : null,
    task.recurrence !== null ? `Wiederholung: ${task.recurrence}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}
