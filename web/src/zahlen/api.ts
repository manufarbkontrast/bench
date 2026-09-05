import type { LinksReply, RunFolder, RunReply } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

interface RunsReply {
  runs: RunFolder[];
}

/** The URL for one of a run's three files, allowlisted by server/src/zahlen/routes.ts - used
    directly as the Bericht iframe's src and as the two download links' href, never fetched here. */
export function fileUrl(folder: string, name: string): string {
  return `/api/zahlen/file?${new URLSearchParams({ folder, name }).toString()}`;
}

export const api = {
  last: () => get<RunReply>("/api/zahlen/last"),
  run: (folder: string) =>
    get<RunReply>(
      `/api/zahlen/run?${new URLSearchParams({ folder }).toString()}`,
    ),
  runs: () => get<RunsReply>("/api/zahlen/runs"),
  links: () => get<LinksReply>("/api/zahlen/links"),
};
