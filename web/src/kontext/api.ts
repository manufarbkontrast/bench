import type {
  McpReply,
  MemoryReply,
  ProfilReply,
  RegelnReply,
  ReposReply,
  SkillsReply,
  StandReply,
} from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `GET ${url} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  profil: () => get<ProfilReply>("/api/kontext/profil"),
  regeln: () => get<RegelnReply>("/api/kontext/regeln"),
  stand: () => get<StandReply>("/api/kontext/stand"),
  memory: () => get<MemoryReply>("/api/kontext/memory"),
  repos: () => get<ReposReply>("/api/kontext/repos"),
  skills: () => get<SkillsReply>("/api/kontext/skills"),
  mcp: () => get<McpReply>("/api/kontext/mcp"),
};
