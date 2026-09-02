import type { EingangJobKind, InboxFile, JobRow, ScheduledRun } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** A failed POST carries the response status, so a caller can tell a conflict (409) - a job
    already running - apart from every other failure without parsing the message. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new HttpError(
      res.status,
      detail.error ?? `POST ${url} failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

interface InboxReply {
  source: "configured" | "sample";
  files: InboxFile[];
}

interface StartJobReply {
  job: { id: number; status: string };
}

interface JobReply {
  job: JobRow;
}

interface JobsReply {
  jobs: JobRow[];
}

interface JobLogReply {
  job: JobRow;
  log: string;
}

interface ScheduleReply {
  runs: ScheduledRun[];
}

export const api = {
  inbox: () => get<InboxReply>("/api/eingang/inbox"),
  startJob: (kind: EingangJobKind, args?: Record<string, unknown>) =>
    post<StartJobReply>("/api/eingang/jobs", args ? { kind, args } : { kind }),
  jobs: () => get<JobsReply>("/api/eingang/jobs"),
  job: (id: number) => get<JobLogReply>(`/api/eingang/jobs/${String(id)}`),
  killJob: (id: number) =>
    post<JobReply>(`/api/eingang/jobs/${String(id)}/kill`, {}),
  schedule: () => get<ScheduleReply>("/api/eingang/schedule"),
};
