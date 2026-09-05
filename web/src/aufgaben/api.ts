import type { IssueRepo, PlaudNote, Task, TreeEntry } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** A failed PATCH or POST carries the response status, so a caller can tell a conflict (409)
    apart from every other failure without parsing the message. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function send<T>(
  method: "PATCH" | "POST",
  url: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new HttpError(
      res.status,
      detail.error ?? `${method} ${url} failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

interface ToggleReply {
  line: number;
  raw: string;
}

interface CreateReply {
  path: string;
  line: number;
  raw: string;
}

export interface CreateBody {
  path?: string;
  text: string;
  due?: string;
  priority?: string;
}

interface PlaudReply {
  source: "configured" | "sample";
  notes: PlaudNote[];
}

interface ImportReply {
  targetPath: string;
  line: number;
  raw: string;
}

interface IssuesReply {
  source: "gh" | "off";
  repos: IssueRepo[];
}

export const api = {
  tasks: () =>
    get<{ tasks: Task[] }>("/api/aufgaben/tasks").then((r) => r.tasks),
  tree: () => get<TreeEntry[]>("/api/vault/tree"),
  toggle: (path: string, line: number, raw: string) =>
    send<ToggleReply>("PATCH", "/api/vault/tasks", { path, line, raw }),
  create: (body: CreateBody) =>
    send<CreateReply>("POST", "/api/vault/tasks", body),
  plaud: () => get<PlaudReply>("/api/aufgaben/plaud"),
  importItem: (file: string, rowHash: string, targetPath: string) =>
    send<ImportReply>("POST", "/api/aufgaben/import", {
      file,
      rowHash,
      targetPath,
    }),
  issues: () => get<IssuesReply>("/api/aufgaben/issues"),
};
