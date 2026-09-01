import type { ListReply, ScanSummary } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `POST ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  list: () => get<ListReply>("/api/projekte/list"),
  scan: () =>
    post<{ summary: ScanSummary }>("/api/projekte/scan").then(
      (reply) => reply.summary,
    ),
};
