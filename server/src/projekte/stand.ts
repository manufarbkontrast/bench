import type Database from "better-sqlite3";
import path from "node:path";
import type { ProjectRow } from "./db.js";
import { type Handoff, vaultHandoffs } from "./handoffs.js";

export interface Signals {
  veraltet: boolean;
  dirtyRepos: number;
  offeneTasks: number;
}

export interface ProjektStand {
  slug: string;
  title: string;
  notePath: string;
  updated: string | null;
  zustand: string;
  repos: ProjectRow[];
  missingRepos: string[];
  signals: Signals;
}

export interface StandReply {
  projekte: ProjektStand[];
  ohneProjekt: ProjectRow[];
  warnings: string[];
}

// Mirrors server/src/aufgaben/tasks.ts's EXCLUDED by hand - the two apps never import each other,
// and a checkbox inside a handoff must not count against its own project.
const EXCLUDED_FOLDERS = new Set(["50_Workflow", "Templates", "90_Archive"]);

interface TaskRow {
  path: string;
  frontmatter: string;
}

export function localDay(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function openTaskCounts(vaultDb: Database.Database): Map<string, number> {
  const rows = vaultDb
    .prepare(
      "SELECT t.path AS path, n.frontmatter AS frontmatter FROM tasks t JOIN notes n ON n.path = t.path WHERE t.done = 0",
    )
    .all() as TaskRow[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.path.split("/").some((segment) => EXCLUDED_FOLDERS.has(segment)))
      continue;
    const projekt = (JSON.parse(row.frontmatter) as Record<string, unknown>)
      .projekt;
    if (typeof projekt !== "string") continue;
    const slug = projekt.trim().toLowerCase();
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

function newestCommit(repos: ProjectRow[]): number | null {
  return repos.reduce<number | null>(
    (max, r) =>
      r.lastCommitAt !== null && (max === null || r.lastCommitAt > max)
        ? r.lastCommitAt
        : max,
    null,
  );
}

function signalsFor(
  handoff: Handoff,
  repos: ProjectRow[],
  tasks: Map<string, number>,
): Signals {
  const newest = newestCommit(repos);
  return {
    veraltet:
      handoff.updated !== null &&
      newest !== null &&
      handoff.updated < localDay(newest),
    dirtyRepos: repos.filter((r) => r.dirty > 0).length,
    offeneTasks: tasks.get(handoff.slug) ?? 0,
  };
}

function byStaleness(a: ProjektStand, b: ProjektStand): number {
  const veraltet = Number(b.signals.veraltet) - Number(a.signals.veraltet);
  if (veraltet !== 0) return veraltet;
  if (a.updated === null && b.updated === null) return 0;
  if (a.updated === null) return 1;
  if (b.updated === null) return -1;
  return a.updated < b.updated ? -1 : Number(a.updated > b.updated);
}

export function projektStand(
  vaultDb: Database.Database,
  rows: ProjectRow[],
): StandReply {
  const { handoffs, warnings } = vaultHandoffs(vaultDb);
  const byPath = new Map(rows.map((r) => [r.path.toLowerCase(), r] as const));
  const tasks = openTaskCounts(vaultDb);
  const claimed = new Set<string>();
  const projekte = handoffs.map((handoff) => {
    const repos = handoff.repos.flatMap(
      (p) => byPath.get(p.toLowerCase()) ?? [],
    );
    for (const r of repos) claimed.add(r.path);
    const missingRepos = handoff.repos
      .filter((p) => !byPath.has(p.toLowerCase()))
      .map((p) => path.basename(p));
    return {
      ...handoff,
      repos,
      missingRepos,
      signals: signalsFor(handoff, repos, tasks),
    };
  });
  return {
    projekte: projekte.toSorted(byStaleness),
    ohneProjekt: rows.filter((r) => !claimed.has(r.path)),
    warnings,
  };
}
