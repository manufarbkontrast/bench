import type { Info, Note, SearchHit, TreeEntry } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const q = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();

export const api = {
  info: () => get<Info>("/api/vault/info"),
  tree: () => get<TreeEntry[]>("/api/vault/tree"),
  note: (path: string) => get<Note>(`/api/vault/note?${q({ path })}`),
  search: (query: string) =>
    get<SearchHit[]>(`/api/vault/search?${q({ q: query })}`),
};
