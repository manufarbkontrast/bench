import type Database from "better-sqlite3";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { directoryNames } from "./dirs.js";

export interface VaultNote {
  path: string;
  title: string;
  body: string;
}

export interface ClaudeFile {
  name: string;
  body: string;
  mtime: number;
}

export interface MemoryProject {
  dir: string;
  notes: ClaudeFile[];
}

interface RepoFile {
  name: "CLAUDE.md" | "AGENTS.md";
  body: string;
}

export interface Repo {
  name: string;
  files: RepoFile[];
}

interface NoteRow {
  path: string;
  title: string;
  body: string;
}

function ordinal(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function mdFileNames(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
}

function readClaudeFile(dir: string, name: string): ClaudeFile {
  const full = path.join(dir, name);
  return {
    name,
    body: readFileSync(full, "utf8"),
    mtime: Math.round(statSync(full).mtimeMs),
  };
}

function readFileIfPresent(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * kontext/ never imports the vault module - PROJECT.md's per-app boundary - so this is a plain
 * SELECT against the injected handle, the notes table's shape known by convention the same way
 * projekte's couple.ts reads it. Filtering by prefix happens in JS rather than SQL LIKE: LIKE
 * treats "_" as a single-character wildcard, and every prefix this app filters on
 * ("10_Profile/", "50_Workflow/") contains one.
 */
export function vaultNotesUnder(
  vaultDb: Database.Database,
  prefix: string,
): VaultNote[] {
  const rows = vaultDb
    .prepare("SELECT path, title, body FROM notes ORDER BY path")
    .all() as NoteRow[];
  return rows.filter((row) => row.path.startsWith(prefix));
}

/** The one note at an exact vault path, or null when it does not exist. */
export function vaultNoteAt(
  vaultDb: Database.Database,
  notePath: string,
): VaultNote | null {
  const row = vaultDb
    .prepare("SELECT path, title, body FROM notes WHERE path = ?")
    .get(notePath) as NoteRow | undefined;
  return row ?? null;
}

/** Every `.md` file directly in `<claudeDir>/rules`, sorted by name; `[]` when the dir is absent. */
export function readRules(claudeDir: string): ClaudeFile[] {
  const dir = path.join(claudeDir, "rules");
  return mdFileNames(dir)
    .toSorted(ordinal)
    .map((name) => readClaudeFile(dir, name));
}

/**
 * Every markdown note under a `memory` folder directly inside each `<claudeDir>/projects` entry.
 * `dir` is the project folder name Claude Code itself assigns - the working directory's path
 * with every "/" turned into "-" - rendered as-is rather than decoded back into a path: the
 * encoding is lossy (a literal "-" in the real path is indistinguishable from an encoded
 * separator), so decoding it would print something that only looks like a path without reliably
 * being one.
 */
export function readMemory(claudeDir: string): MemoryProject[] {
  const projectsDir = path.join(claudeDir, "projects");
  const projects: MemoryProject[] = [];
  for (const dirName of directoryNames(projectsDir)) {
    const memoryDir = path.join(projectsDir, dirName, "memory");
    if (!isDirectory(memoryDir)) continue;
    projects.push({
      dir: dirName,
      notes: mdFileNames(memoryDir)
        .toSorted(ordinal)
        .map((name) => readClaudeFile(memoryDir, name)),
    });
  }
  return projects.toSorted((a, b) => ordinal(a.dir, b.dir));
}

const REPO_FILE_NAMES = ["CLAUDE.md", "AGENTS.md"] as const;

/**
 * `CLAUDE.md`/`AGENTS.md` directly in each registered project's root. `projectPaths` is injected
 * (see KontextContext) so this module never imports projekte/db.ts. A project whose path cannot
 * be read at all - a stale row, a moved checkout - is skipped outright rather than listed with no
 * files, since an unreadable path says nothing about whether the files exist.
 */
export function readRepos(
  projectPaths: () => { name: string; path: string }[],
): Repo[] {
  const repos: Repo[] = [];
  for (const project of projectPaths()) {
    if (!isDirectory(project.path)) continue;
    const files: RepoFile[] = [];
    for (const name of REPO_FILE_NAMES) {
      const body = readFileIfPresent(path.join(project.path, name));
      if (body !== null) files.push({ name, body });
    }
    repos.push({ name: project.name, files });
  }
  return repos;
}

interface McpConfig {
  mcpServers?: Record<string, unknown>;
}

/**
 * On the real machine `claude.json` sits NEXT TO `~/.claude/`, not inside it - so a `claudeDir`
 * ending in `.claude` reads `<claudeDir>/../.claude.json` instead. The fixture claude-home is not
 * named `.claude`, so it takes the simpler `<claudeDir>/claude.json` branch.
 */
function mcpConfigPath(claudeDir: string): string {
  return path.basename(claudeDir) === ".claude"
    ? path.join(claudeDir, "..", ".claude.json")
    : path.join(claudeDir, "claude.json");
}

/**
 * Server names only. The parsed config - which may carry connection URLs, tokens or other
 * per-server secrets - never leaves this function; only `Object.keys` of its `mcpServers` does.
 */
export function readMcpServers(claudeDir: string): string[] {
  const text = readFileIfPresent(mcpConfigPath(claudeDir));
  if (text === null) return [];
  let parsed: McpConfig;
  try {
    parsed = JSON.parse(text) as McpConfig;
  } catch {
    return [];
  }
  return Object.keys(parsed.mcpServers ?? {});
}
