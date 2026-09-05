import type { InboxFile, StandReply, Task, ZahlenReply } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** A missing session note (404) is expected - the vault may not have one yet - so it resolves to
    null rather than throwing. */
async function getOrNull<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const SESSION_NOTE_PATH = "00_Index/Session_Context.md";

interface SessionNote {
  body: string;
}

export const api = {
  tasks: () =>
    get<{ tasks: Task[] }>("/api/aufgaben/tasks").then((r) => r.tasks),
  stand: () => get<StandReply>("/api/projekte/stand"),
  inbox: () =>
    get<{ files: InboxFile[] }>("/api/eingang/inbox").then((r) => r.files),
  sessionNote: () =>
    getOrNull<SessionNote>(
      `/api/vault/note?${new URLSearchParams({ path: SESSION_NOTE_PATH })}`,
    ),
  zahlenLast: () => get<ZahlenReply>("/api/zahlen/last"),
};
