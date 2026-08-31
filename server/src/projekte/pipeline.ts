import { existsSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { type Coupling, vaultCouplings } from "./couple.js";
import { replaceProjects, type ProjectRow } from "./db.js";
import { fetchCounts, type GhRunner } from "./gh.js";
import { readGitState, type GitState } from "./git.js";
import { githubLabel, groupKey, normalizeRemote } from "./remotes.js";
import { findRepos } from "./scan.js";

export interface ScanSummary {
  projects: number;
  repos: number;
  folders: number;
  duplicates: number;
  ms: number;
}

// Each state read spawns several git processes; unbounded parallelism over a large root would
// exhaust file descriptors, so states are read in fixed-size batches instead.
const GIT_STATE_BATCH = 8;

async function readStates(dirs: string[]): Promise<GitState[]> {
  const states: GitState[] = [];
  for (let i = 0; i < dirs.length; i += GIT_STATE_BATCH) {
    const batch = dirs.slice(i, i + GIT_STATE_BATCH);
    states.push(...(await Promise.all(batch.map(readGitState))));
  }
  return states;
}

function buildGitRow(
  dir: string,
  state: GitState,
  coupling: Coupling | undefined,
  now: number,
): ProjectRow {
  const normalized = state.remote ? normalizeRemote(state.remote) : null;
  return {
    path: dir,
    name: path.basename(dir),
    kind: "git",
    remote: state.remote,
    remoteLabel: normalized ? githubLabel(normalized) : null,
    branch: state.branch,
    lastCommitAt: state.lastCommitAt,
    lastCommitSubject: state.lastCommitSubject,
    dirty: state.dirty,
    ahead: state.ahead,
    behind: state.behind,
    notePath: coupling?.notePath ?? null,
    brand: coupling?.brand ?? null,
    status: coupling?.status ?? null,
    issues: null,
    prs: null,
    groupKey: groupKey(normalized, dir),
    scannedAt: now,
  };
}

function buildFolderRow(coupling: Coupling, now: number): ProjectRow {
  return {
    path: coupling.projectPath,
    name: path.basename(coupling.projectPath),
    kind: "folder",
    remote: null,
    remoteLabel: null,
    branch: null,
    lastCommitAt: null,
    lastCommitSubject: null,
    dirty: 0,
    ahead: null,
    behind: null,
    notePath: coupling.notePath,
    brand: coupling.brand,
    status: coupling.status,
    issues: null,
    prs: null,
    groupKey: groupKey(null, coupling.projectPath),
    scannedAt: now,
  };
}

/** One gh call per unique GitHub label, shared across every row (duplicates included) that carries it. */
async function attachGhCounts(
  rows: ProjectRow[],
  gh: GhRunner | "off",
): Promise<ProjectRow[]> {
  if (gh === "off") return rows;
  const labels = [
    ...new Set(
      rows.map((row) => row.remoteLabel).filter((l): l is string => l !== null),
    ),
  ];
  const counted = new Map(
    await Promise.all(
      labels.map(
        async (label) => [label, await fetchCounts(gh, label)] as const,
      ),
    ),
  );
  return rows.map((row) => {
    if (row.remoteLabel === null) return row;
    const counts = counted.get(row.remoteLabel);
    return counts ? { ...row, issues: counts.issues, prs: counts.prs } : row;
  });
}

function countDuplicates(rows: ProjectRow[]): number {
  const sizes = new Map<string, number>();
  for (const row of rows)
    sizes.set(row.groupKey, (sizes.get(row.groupKey) ?? 0) + 1);
  return rows.filter((row) => (sizes.get(row.groupKey) ?? 0) > 1).length;
}

/**
 * findRepos -> readGitState (batched) -> vault couplings -> rows -> gh counts -> one replace.
 * Every scan rebuilds the table whole; nothing here is incremental.
 */
export async function scanProjects(
  db: Database.Database,
  vaultDb: Database.Database,
  roots: string[],
  gh: GhRunner | "off",
): Promise<ScanSummary> {
  const start = Date.now();
  const dirs = findRepos(roots);
  const states = await readStates(dirs);
  const couplings = vaultCouplings(vaultDb);
  const byPath = new Map(
    couplings.map((c) => [c.projectPath.toLowerCase(), c]),
  );
  const now = Date.now();

  const gitRows = dirs.map((dir, i) =>
    buildGitRow(dir, states[i], byPath.get(dir.toLowerCase()), now),
  );
  const gitPaths = new Set(dirs.map((d) => d.toLowerCase()));
  const folderRows = couplings
    .filter(
      (c) =>
        !gitPaths.has(c.projectPath.toLowerCase()) && existsSync(c.projectPath),
    )
    .map((c) => buildFolderRow(c, now));

  const rows = await attachGhCounts([...gitRows, ...folderRows], gh);
  replaceProjects(db, rows);

  return {
    projects: rows.length,
    repos: gitRows.length,
    folders: folderRows.length,
    duplicates: countDuplicates(rows),
    ms: Date.now() - start,
  };
}
