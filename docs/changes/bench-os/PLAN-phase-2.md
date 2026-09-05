# Bench OS Phase 2 - Projekte - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Projekte app that scans the configured roots for git checkouts, reads their state,
groups duplicates by remote, couples each project to its vault note through `path:` frontmatter,
shows issue and PR counts via `gh`, and presents a table, a board by brand and status, a detail
panel and warnings - read-only toward every source.

**Architecture:** `server/src/projekte/` owns a rebuildable index in `data/projekte.sqlite`,
filled by a scan pipeline: directory walk over `PROJECT_ROOTS` → git state via `simple-git` →
remote normalisation and duplicate grouping → vault coupling (the documented second read of the
vault index, after `aufgaben`) → `gh` counts. The web app at `/projekte` follows the Vault app's
shape: own HTML entry, own styles, `BrowserRouter basename="/projekte"`. Without `PROJECT_ROOTS`
the server builds a synthetic sample workshop with `git init` under its data directory - the same
builder serves the unit tests and every e2e worker.

**Tech Stack:** Express 5, better-sqlite3 12, `simple-git` (the one new dependency, server
workspace), the `gh` CLI as a local process, Vite 8 + React 19 + react-router 8.

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every shell.
- TypeScript `6.0.3` exactly; better-sqlite3 `12`; do not touch either. The only new dependency is
  `simple-git` (server): `npm install simple-git -w server`. If vitest then fails with "Cannot
  find native binding": `rm -rf node_modules web/node_modules server/node_modules
package-lock.json && npm install` (CONTROLS.md). If it fails with an ABI/dlopen error:
  `npm rebuild better-sqlite3`.
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task
  touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or the fixtures. Coverage
  ≥ 80 % statements per workspace; nothing is loosened. Every command runs in the foreground with
  a generous timeout - never backgrounded. If a coverage run flakes on an unrelated test under
  external CPU load, retry with `--maxWorkers=2` (an operational flag, never a config change).
- Focused tests: `cd server && npx vitest run test/projekte` / `cd web && npx vitest run
src/projekte` - never `npx vitest run -w <workspace>` (`-w` is vitest's watch flag).
- ESLint limits: 500 lines a file, 200 a function, complexity 15, depth 4, 5 parameters. No
  `any`. No emoji in code, comments or commits. Comments say why. No super-linear regexes -
  prefer hand-rolled scanners (see `web/src/vault/markdown.ts` for the house pattern).
- Immutable data: build new objects, never mutate (test scaffolding may hold a `let`).
- **Read-only toward the sources.** Nothing under `server/src/projekte/` writes into any
  repository or under any configured root. `git` is only ever invoked for reads (`status`, `log`,
  `remote`); `gh` only for `api` queries. `data/projekte.sqlite` is a cache and fully rebuildable.
  The one place the code runs writing git commands is the sample builder, which writes only under
  the server's own data directory.
- `gh` never runs in tests or e2e: unit tests inject a fake runner; the e2e servers set
  `BENCH_GH=off`. Real `gh` runs only on a developer machine during a live scan and in Task 10.
- Machine paths never appear in tracked files. Fixture and sample repositories are built by code
  at runtime (under a temp dir or `data/`), never committed. Sample content uses invented names,
  `bench@example.com` as the git identity, English commit subjects.
- German UI strings exactly as written in the tasks; identifiers, comments, docs and commits
  English. Commit messages: Conventional Commits, one line, imperative. Never push. Branch
  `bench-os-phase-2`, cut from `bench-os-phase-0`.
- Scanner ignore rules: any directory whose name starts with `.`, plus `node_modules`, `Library`,
  `Applications`, `Music`, `Movies`, `Pictures`; symlinked directories are never followed; the
  walk never descends into a found repository; depth cap 3 below each root.
- The vault read is the second documented exception to "one database per app" (the first is
  `aufgaben`, Phase 3): `projekte` reads `vault.sqlite` through the handle `index.ts` already
  holds - it never opens the vault database itself and never reads `VAULT_DIR` directly.

---

### Task 0: Setup

Controller work, no subagent: branch `bench-os-phase-2` exists (cut from `bench-os-phase-0` at
bde9442), this plan is committed as `docs: the phase 2 plan`, the SDD ledger is initialised at
`.superpowers/sdd/PLAN-phase-2/progress.md`.

---

### Task 1: PROJECT_ROOTS configuration and the sample workshop

**Files:**

- Modify: `server/src/config.ts`
- Create: `server/src/projekte/locate.ts`
- Create: `server/src/projekte/sample.ts`
- Modify: `.env.example`
- Modify: `e2e/fixtures.ts`
- Test: `server/test/config.test.ts` (extend), `server/test/projekte/locate.test.ts`,
  `server/test/projekte/sample.test.ts`
- Create: `server/test/projekte/tmp.ts` (shared temp-dir helper)

**Interfaces:**

- Consumes: `Config`, `loadConfig`, `describeSources` from `server/src/config.ts`.
- Produces: `Config.projectRoots: string[]` (tilde-expanded, may name missing dirs);
  `expandTilde(p: string): string` exported from `config.ts`;
  `locateProjects(config: Config, sampleDir: string): { roots: string[]; source: "configured" | "sample"; missing: string[] }`;
  `buildSampleProjects(dir: string): string` (idempotent, returns `dir`). Later tasks rely on
  the sample's exact shape below.

**The sample workshop** (all names invented; `.origins/` starts with a dot so the scanner never
lists the bare repo itself):

| Path under the sample dir                        | Kind                              | State                                                               |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------- |
| `.origins/leuchtfeuer.git`                       | bare origin                       | holds commits A, B                                                  |
| `werkstatt/leuchtfeuer`                          | clone, `origin` → the bare repo   | branch `main`, ahead 1 (commit C unpushed), dirty 1 (unstaged edit) |
| `archiv/leuchtfeuer-alt`                         | second clone of the same origin   | behind 1 (reset to A), clean → the duplicate pair                   |
| `werkstatt/treibgut`                             | `git init`, no remote, one commit | the "Kein Remote" case                                              |
| `atelier/strandgut`                              | plain folder, one text file       | only ever listed via a vault coupling                               |
| `.cache/hidden` and `werkstatt/node_modules/dep` | git repos the scanner must skip   | decoys                                                              |

- [ ] **Step 1: Failing tests.** In `server/test/projekte/tmp.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A per-suite scratch directory, removed in afterAll. */
export function scratchDir(prefix: string): {
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
```

`server/test/projekte/sample.test.ts` (builds once in `beforeAll`, asserts with
`execFileSync("git", ...)` directly):

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSampleProjects } from "../../src/projekte/sample";
import { scratchDir } from "./tmp";

const scratch = scratchDir("bench-sample-");
let dir: string;
beforeAll(() => {
  dir = buildSampleProjects(path.join(scratch.dir, "sample"));
});
afterAll(scratch.cleanup);

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("buildSampleProjects", () => {
  it("creates the workshop once and is idempotent", () => {
    expect(buildSampleProjects(dir)).toBe(dir);
    expect(existsSync(path.join(dir, "werkstatt", "leuchtfeuer", ".git"))).toBe(
      true,
    );
  });
  it("leaves leuchtfeuer one ahead and dirty on main", () => {
    const repo = path.join(dir, "werkstatt", "leuchtfeuer");
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(git(repo, "rev-list", "--count", "origin/main..HEAD")).toBe("1");
    expect(git(repo, "status", "--porcelain")).not.toBe("");
  });
  it("leaves the alt clone one behind and clean", () => {
    const repo = path.join(dir, "archiv", "leuchtfeuer-alt");
    expect(git(repo, "rev-list", "--count", "HEAD..origin/main")).toBe("1");
    expect(git(repo, "status", "--porcelain")).toBe("");
  });
  it("gives treibgut a commit but no remote", () => {
    const repo = path.join(dir, "werkstatt", "treibgut");
    expect(git(repo, "remote")).toBe("");
    expect(git(repo, "rev-list", "--count", "HEAD")).toBe("1");
  });
  it("plants the decoys and the plain folder", () => {
    expect(existsSync(path.join(dir, ".cache", "hidden", ".git"))).toBe(true);
    expect(
      existsSync(path.join(dir, "werkstatt", "node_modules", "dep", ".git")),
    ).toBe(true);
    expect(
      existsSync(path.join(dir, "atelier", "strandgut", "notizen.txt")),
    ).toBe(true);
  });
});
```

`server/test/projekte/locate.test.ts`:

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { locateProjects } from "../../src/projekte/locate";
import { scratchDir } from "./tmp";

const scratch = scratchDir("bench-locate-");
afterAll(scratch.cleanup);

describe("locateProjects", () => {
  it("keeps existing configured roots and names the missing ones", () => {
    const real = path.join(scratch.dir, "real");
    mkdirSync(real, { recursive: true });
    const missing = path.join(scratch.dir, "missing");
    const located = locateProjects(
      { projectRoots: [real, missing] },
      path.join(scratch.dir, "sample-a"),
    );
    expect(located).toEqual({
      roots: [real],
      source: "configured",
      missing: [missing],
    });
  });
  it("builds the sample when nothing is configured", () => {
    const sampleDir = path.join(scratch.dir, "sample-b");
    const located = locateProjects({ projectRoots: [] }, sampleDir);
    expect(located.source).toBe("sample");
    expect(located.roots).toEqual([sampleDir]);
    expect(located.missing).toEqual([]);
  });
});
```

Extend `server/test/config.test.ts` with three cases: `PROJECT_ROOTS` unset → `projectRoots: []`;
`PROJECT_ROOTS="~/a: /tmp/b :"` → two entries, tilde expanded to `os.homedir()/a`, whitespace
trimmed, empties dropped; `describeSources` includes `Projekte: not configured` when empty and
`Projekte: <n> roots` when set (the log names a count, not the machine paths - the startup log is
fine either way, but the test stays path-free).

- [ ] **Step 2: Run the new suites, watch them fail** (`cd server && npx vitest run
test/projekte test/config.test.ts`).

- [ ] **Step 3: Implement.** `server/src/config.ts` - add to the interface and factory (Config
      gains a required `projectRoots: string[]`; `locate.test` above already constructs a partial - use
      `Pick<Config, "projectRoots">` in `locateProjects`'s signature so the test object is exact):

```ts
import os from "node:os";

export function expandTilde(p: string): string {
  return p === "~" || p.startsWith("~/")
    ? path.join(os.homedir(), p.slice(1))
    : p;
}

function rootsFrom(value: string | undefined): string[] {
  return (value ?? "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(expandTilde);
}
```

`configFrom` returns `{ vaultDir: optional(env.VAULT_DIR), projectRoots: rootsFrom(env.PROJECT_ROOTS) }`.
`describeSources` appends `` `Projekte: ${config.projectRoots.length === 0 ? "not configured" : `${config.projectRoots.length} roots`}` ``.

`server/src/projekte/locate.ts`:

```ts
import { existsSync } from "node:fs";
import type { Config } from "../config";
import { buildSampleProjects } from "./sample";

export interface LocatedProjects {
  roots: string[];
  source: "configured" | "sample";
  missing: string[];
}

/**
 * Configured roots that exist win; with none usable the server builds its synthetic workshop so
 * `npm start` without a .env still shows a living app - the same pattern as the sample vault.
 */
export function locateProjects(
  config: Pick<Config, "projectRoots">,
  sampleDir: string,
): LocatedProjects {
  const roots = config.projectRoots.filter((root) => existsSync(root));
  const missing = config.projectRoots.filter((root) => !existsSync(root));
  if (roots.length > 0) return { roots, source: "configured", missing };
  return { roots: [buildSampleProjects(sampleDir)], source: "sample", missing };
}
```

`server/src/projekte/sample.ts`:

```ts
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Global and system git config stay out so the build is identical on every machine. */
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.email=bench@example.com",
      "-c",
      "user.name=Bench",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, env: GIT_ENV, stdio: "ignore" },
  );
}

function commit(
  cwd: string,
  file: string,
  content: string,
  message: string,
): void {
  writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", message);
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--initial-branch=main", ".");
}

/**
 * A deterministic miniature of the real machine: a duplicate pair sharing one origin (ahead and
 * dirty on one side, behind on the other), a repo with no remote, a plain working folder, and
 * two decoys the scanner must skip. Idempotent: an existing directory is trusted as built.
 */
export function buildSampleProjects(dir: string): string {
  if (existsSync(dir)) return dir;
  const origin = path.join(dir, ".origins", "leuchtfeuer.git");
  mkdirSync(origin, { recursive: true });
  git(origin, "init", "--bare", "--initial-branch=main", ".");

  const feuer = path.join(dir, "werkstatt", "leuchtfeuer");
  initRepo(feuer);
  git(feuer, "remote", "add", "origin", origin);
  commit(feuer, "README.md", "# Leuchtfeuer\n", "feat: first light");
  commit(feuer, "tower.txt", "stone\n", "feat: raise the tower");
  git(feuer, "push", "-u", "origin", "main");

  const archiv = path.join(dir, "archiv");
  mkdirSync(archiv, { recursive: true });
  git(archiv, "clone", origin, "leuchtfeuer-alt");
  git(path.join(archiv, "leuchtfeuer-alt"), "reset", "--hard", "HEAD~1");

  commit(feuer, "lamp.txt", "oil\n", "feat: hang the lamp");
  appendFileSync(path.join(feuer, "tower.txt"), "brick\n");

  const treibgut = path.join(dir, "werkstatt", "treibgut");
  initRepo(treibgut);
  commit(treibgut, "notes.md", "flotsam\n", "feat: collect flotsam");

  const strandgut = path.join(dir, "atelier", "strandgut");
  mkdirSync(strandgut, { recursive: true });
  writeFileSync(path.join(strandgut, "notizen.txt"), "sand\n");

  initRepo(path.join(dir, ".cache", "hidden"));
  initRepo(path.join(dir, "werkstatt", "node_modules", "dep"));
  return dir;
}
```

`.env.example` - append below `VAULT_DIR`:

```
# Colon-separated roots the Projekte app scans for git checkouts, e.g. ~/Downloads:~/Projects
PROJECT_ROOTS=
```

`e2e/fixtures.ts`: the per-worker server env gains `BENCH_GH: "off"` (and nothing else -
`PROJECT_ROOTS` stays unset so each worker builds its own sample under its `DATA_DIR`).

- [ ] **Step 4: Suites green** (same command as Step 2), then `npm run format && npm run check
&& npm run e2e`.
- [ ] **Step 5: Commit** - `feat: project roots configuration with a built sample workshop`

---

### Task 2: The projekte database and the roots scanner

**Files:**

- Create: `server/src/projekte/db.ts`, `server/src/projekte/scan.ts`
- Test: `server/test/projekte/db.test.ts`, `server/test/projekte/scan.test.ts`

**Interfaces:**

- Consumes: `buildSampleProjects`, `scratchDir` from Task 1.
- Produces: `openProjekteDb(file: string): Database` (better-sqlite3, WAL, schema below);
  `ProjectRow` (the row type, exported); `findRepos(roots: string[]): string[]` (absolute,
  resolved, sorted, deduplicated - overlapping roots like `~/Downloads` and
  `~/Downloads/Projekte` yield each repo once); `skippedDir(name: string): boolean`.

**Schema** (`projects`; no foreign keys - the row is a denormalised scan result):

```sql
CREATE TABLE IF NOT EXISTS projects (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('git', 'folder')),
  remote TEXT,
  remote_label TEXT,
  branch TEXT,
  last_commit_at INTEGER,
  last_commit_subject TEXT,
  dirty INTEGER NOT NULL DEFAULT 0,
  ahead INTEGER,
  behind INTEGER,
  note_path TEXT,
  brand TEXT,
  status TEXT,
  issues INTEGER,
  prs INTEGER,
  group_key TEXT NOT NULL,
  scanned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_key);
```

`ProjectRow` mirrors it in camelCase exactly as the vault's row types do (`db.ts` maps in its
`listProjects(db)` helper; also export `replaceProjects(db, rows: ProjectRow[])` running DELETE +
INSERT inside one transaction).

- [ ] **Step 1: Failing tests.** `db.test.ts`: open in a scratch file, `replaceProjects` with two
      rows then one row → `listProjects` returns exactly the latest set, camelCase fields round-trip
      (including `null` remote and counts). `scan.test.ts` (sample built once in `beforeAll`):

```ts
it("finds the three git checkouts and nothing else", () => {
  const found = findRepos([dir]);
  const names = found.map((p) => path.basename(p)).sort();
  expect(names).toEqual(["leuchtfeuer", "leuchtfeuer-alt", "treibgut"]);
});
it("returns each repo once for overlapping roots", () => {
  const found = findRepos([dir, path.join(dir, "werkstatt")]);
  expect(found.filter((p) => p.endsWith("leuchtfeuer")).length).toBe(1);
});
it("skips dot names, node_modules and the macOS bulk folders", () => {
  for (const name of [".cache", "node_modules", "Library", "Applications"])
    expect(skippedDir(name)).toBe(true);
  expect(skippedDir("werkstatt")).toBe(false);
});
it("copes with an unreadable root", () => {
  expect(findRepos([path.join(dir, "does-not-exist")])).toEqual([]);
});
```

- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement.** `scan.ts`:

```ts
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const SKIP = new Set([
  "node_modules",
  "Library",
  "Applications",
  "Music",
  "Movies",
  "Pictures",
]);
/** Mirrors the vault scanner's rule, plus the macOS bulk folders a home-root scan must not enter. */
export function skippedDir(name: string): boolean {
  return name.startsWith(".") || SKIP.has(name);
}

const MAX_DEPTH = 3;

export function findRepos(roots: string[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (seen.has(dir)) return;
    seen.add(dir);
    if (existsSync(path.join(dir, ".git"))) {
      found.push(dir);
      return;
    }
    if (depth >= MAX_DEPTH) return;
    // A root the app does not control can hold unreadable directories; skipping one is the
    // expected outcome, not a failure of the scan.
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        skippedDir(entry.name)
      )
        continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  };
  for (const root of roots) {
    const resolved = path.resolve(root);
    if (existsSync(resolved)) walk(resolved, 0);
  }
  return [...found].sort((a, b) => Number(a > b) - Number(a < b));
}
```

`db.ts` follows `server/src/vault/db.ts`'s conventions (WAL, `openProjekteDb`, row mapping).

- [ ] **Step 4: Suites green, then the full gate.**
- [ ] **Step 5: Commit** - `feat: scan the project roots for git checkouts`

---

### Task 3: Git state, remote normalisation and duplicate grouping

**Files:**

- Create: `server/src/projekte/git.ts`, `server/src/projekte/remotes.ts`
- Test: `server/test/projekte/git.test.ts`, `server/test/projekte/remotes.test.ts`
- Modify: `server/package.json` (`npm install simple-git -w server`)

**Interfaces:**

- Produces: `GitState { branch: string | null; remote: string | null; lastCommitAt: number | null; lastCommitSubject: string | null; dirty: number; ahead: number | null; behind: number | null }`;
  `readGitState(dir: string): Promise<GitState>`; `normalizeRemote(url: string): string`;
  `githubLabel(normalized: string): string | null`; `groupKey(remote: string | null, dir: string): string`.

- [ ] **Step 1: Failing tests.** `remotes.test.ts` is pure:

```ts
it.each([
  ["git@github.com:Owner/Repo.git", "github.com/owner/repo"], // allow-secret: git remote fixture, not a real address
  ["https://github.com/owner/repo", "github.com/owner/repo"],
  ["ssh://git@github.com/Owner/Repo/", "github.com/owner/repo"], // allow-secret: git remote fixture, not a real address
  ["https://gitlab.com/a/b.git", "gitlab.com/a/b"],
  [
    "/Users/someone/origins/leuchtfeuer.git",
    "/users/someone/origins/leuchtfeuer",
  ],
])("normalizes %s", (raw, expected) => {
  expect(normalizeRemote(raw)).toBe(expected);
});
it("labels only GitHub remotes", () => {
  expect(githubLabel("github.com/owner/repo")).toBe("owner/repo");
  expect(githubLabel("gitlab.com/a/b")).toBeNull();
});
it("falls back to the lowercased basename for remoteless repos", () => {
  expect(groupKey(null, "/roots/Werkstatt/Treibgut")).toBe("name:treibgut");
  expect(groupKey("github.com/o/r", "/x")).toBe("github.com/o/r");
});
```

`git.test.ts` reads the sample (async tests): leuchtfeuer → branch `main`, dirty 1, ahead 1,
behind 0, remote ends `/leuchtfeuer.git`, `lastCommitSubject` `feat: hang the lamp`,
`lastCommitAt` a finite number; leuchtfeuer-alt → dirty 0, ahead 0, behind 1; treibgut → remote
null, ahead/behind null (no upstream); a freshly `git init`ed empty repo in the scratch dir →
`lastCommitAt` null, dirty 0, does not throw.

- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement.** `remotes.ts` (hand-rolled, no regex):

```ts
export function normalizeRemote(url: string): string {
  let rest = url.trim();
  for (const proto of ["ssh://", "git://", "https://", "http://"])
    if (rest.startsWith(proto)) rest = rest.slice(proto.length);
  const at = rest.indexOf("@");
  if (at !== -1) rest = rest.slice(at + 1);
  const colon = rest.indexOf(":");
  const slash = rest.indexOf("/");
  // scp-style host:path becomes host/path; a colon after the first slash is part of the path
  if (colon !== -1 && (slash === -1 || colon < slash))
    rest = `${rest.slice(0, colon)}/${rest.slice(colon + 1)}`;
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  if (rest.toLowerCase().endsWith(".git")) rest = rest.slice(0, -4);
  return rest.toLowerCase();
}

export function githubLabel(normalized: string): string | null {
  if (!normalized.startsWith("github.com/")) return null;
  return normalized.slice("github.com/".length);
}

export function groupKey(remote: string | null, dir: string): string {
  return remote ?? `name:${path.basename(dir).toLowerCase()}`;
}
```

`git.ts` via `simple-git`:

```ts
import { simpleGit } from "simple-git";

export async function readGitState(dir: string): Promise<GitState> {
  const git = simpleGit(dir);
  const status = await git.status();
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
  let lastCommitAt: number | null = null;
  let lastCommitSubject: string | null = null;
  try {
    const latest = (await git.log({ maxCount: 1 })).latest;
    if (latest) {
      lastCommitAt = Date.parse(latest.date);
      lastCommitSubject = latest.message;
    }
  } catch {
    // an unborn HEAD (fresh init, no commit) has no log; every other field still reads
  }
  return {
    branch: status.current,
    remote: origin?.refs.fetch ?? null,
    dirty: status.files.length,
    ahead: status.tracking ? status.ahead : null,
    behind: status.tracking ? status.behind : null,
    lastCommitAt,
    lastCommitSubject,
  };
}
```

- [ ] **Step 4: Suites green, full gate** (no e2e needed - server-only, no app wiring yet; run it
      anyway if `package-lock.json` changed, which it did: the dependency).
- [ ] **Step 5: Commit** - `feat: read git state and group checkouts by remote`

---

### Task 4: Vault coupling

**Files:**

- Create: `server/src/projekte/couple.ts`
- Test: `server/test/projekte/couple.test.ts`

**Interfaces:**

- Consumes: the vault schema (`notes.path`, `notes.frontmatter` JSON text, `tags(path, tag)`),
  `openVaultDb` from `server/src/vault/db.ts` (tests build a scratch vault db and INSERT rows
  directly - no filesystem vault needed); `expandTilde` from `config.ts`.
- Produces: `Coupling { notePath: string; projectPath: string; brand: string | null; status: string | null }`;
  `vaultCouplings(vaultDb: Database): Coupling[]` - one entry per note whose frontmatter has a
  non-empty string `path`, tilde-expanded and `path.resolve`d; `brand` = the first tag starting
  `brand/` with the prefix stripped, `status` likewise for `status/`; sorted by `notePath` so the
  first note wins a later dedupe.

**The convention this reads** (from the user's vault): project notes carry
`path: ~/Downloads/<Repo>` in frontmatter and tags like `brand/<name>`, `status/active`. A plain
folder named by a note is a project of kind `folder`; matching is by lowercased resolved path
(macOS filesystems are case-insensitive).

- [ ] **Step 1: Failing tests** - build a vault db in a scratch file, insert three notes (one
      with `path: ~/x/repo` and tags `brand/nordlicht` + `status/active`, one with `path` empty, one
      without `path`) plus a fourth with `path: /abs/other` and no tags; assert: two couplings, tilde
      expanded against `os.homedir()`, brand/status extracted and stripped, missing tags null, sorted.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement** - a `SELECT path, frontmatter FROM notes` scan; `JSON.parse` per row
      (the indexer wrote the JSON, so a parse failure is a bug worth throwing on); tags via a prepared
      `SELECT tag FROM tags WHERE path = ?`.
- [ ] **Step 4: Suites green, full gate.**
- [ ] **Step 5: Commit** - `feat: couple projects to their vault notes`

---

### Task 5: gh counts, the scan pipeline and the API

**Files:**

- Create: `server/src/projekte/gh.ts`, `server/src/projekte/pipeline.ts`,
  `server/src/projekte/routes.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts`
- Modify: `server/test/crm/app.ts`-style harnesses: `server/test/vault/app.ts`,
  `server/test/rolodex/app.ts` and the crm one - wherever a `Dbs` object is built, it gains
  `projekte` (see below)
- Test: `server/test/projekte/gh.test.ts`, `server/test/projekte/pipeline.test.ts`,
  `server/test/projekte/routes.test.ts`, plus a shared `server/test/projekte/app.ts` harness

**Interfaces:**

- Consumes: everything from Tasks 1-4.
- Produces:
  - `GhRunner = (args: string[]) => Promise<string>`; `realGh: GhRunner` (execFile `gh`, 15 s
    timeout); `fetchCounts(run: GhRunner, label: string): Promise<{ issues: number; prs: number } | null>`
    - null on ANY failure (offline, not logged in, repo gone): unknown counts never fail a scan.
  - `scanProjects(db, vaultDb, roots: string[], gh: GhRunner | "off"): Promise<ScanSummary>` with
    `ScanSummary { projects: number; repos: number; folders: number; duplicates: number; ms: number }`.
  - `ProjekteContext { db: Database; roots: string[]; source: "configured" | "sample"; gh: GhRunner | "off" }`
    - the member `Dbs.projekte`, mirroring `Dbs.vault`'s context shape.
  - Routes under `/api/projekte`: `GET /list` → `{ scannedAt: number | null, summary, projects: ProjectRow[] }`
    (runs a first scan when the table is empty, so the UI never shows a permanently empty state);
    `POST /scan` → `{ summary }` (full rebuild); `GET /project?path=<abs>` → `{ project, duplicates: ProjectRow[], }`
    or 404. List rows additionally carry `isDuplicate: boolean` (group size > 1) and
    `sameName: boolean` (another project shares the lowercased name under a different group_key).
- The gh GraphQL call, exactly:

```ts
const QUERY =
  "query($o:String!,$n:String!){repository(owner:$o,name:$n){issues(states:OPEN){totalCount}pullRequests(states:OPEN){totalCount}}}";
// run(["api", "graphql", "-f", `query=${QUERY}`, "-F", `o=${owner}`, "-F", `n=${name}`])
```

**Pipeline order:** findRepos → `readGitState` over all dirs with a small concurrency helper
(batches of 8 - each state read spawns git processes); couplings from the vault db; rows built
(couplings matched by lowercased resolved path; couplings pointing at an existing directory that
is not a scanned repo become `kind: 'folder'` rows with only name/path/coupling filled);
`fetchCounts` once per unique GitHub label, results shared across duplicates, skipped entirely
when `gh === "off"`; one `replaceProjects` transaction; summary returned and logged by the
caller.

- [ ] **Step 1: Failing tests.** `gh.test.ts`: a fake runner returning a canned GraphQL body →
      `{ issues: 115, prs: 3 }`; a runner that throws → null; a runner returning junk JSON → null;
      `fetchCounts` is never called for a null label (type-level, no test needed - keep the signature
      taking the label string). `pipeline.test.ts` (sample + scratch vault db with one note whose
      `path` points at `atelier/strandgut` and one at `werkstatt/leuchtfeuer`): after
      `scanProjects(db, vaultDb, [dir], "off")` - 4 projects (3 git + 1 folder), leuchtfeuer coupled
      (brand/status from the note), strandgut `kind: 'folder'`, the duplicate pair shares a `group_key`
      and `duplicates: 2`, treibgut's group starts `name:`, all `issues`/`prs` null, `ms` finite; a
      second scan replaces rather than appends (row count stable). With a fake gh runner instead of
      "off": the two GitHub-labelled... the sample's origin is a filesystem path, so no label exists -
      assert instead that the fake runner was never called (`expect(calls).toBe(0)`), which pins the
      "only GitHub remotes are asked" rule. `routes.test.ts` via the harness (supertest like the vault
      route tests): `GET /api/projekte/list` on an empty table triggers a scan and returns 4 projects
      with `isDuplicate` true exactly twice; `POST /api/projekte/scan` returns a summary; `GET
/project?path=` unknown → 404; known → row plus its one duplicate.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement**, following `server/src/vault/routes/` for router and error shape and
      `server/src/index.ts`'s vault wiring for the server side: open `data/projekte.sqlite`, call
      `locateProjects(config, path.join(dataDir, "sample-projekte"))`, build the context with
      `gh: process.env.BENCH_GH === "off" ? "off" : realGh`, log one startup line
      (`Projekte: <n> roots (<source>), index empty until first scan` or with the row count). **No scan
      at startup** - the first `/list` pays it, so boot stays fast.
- [ ] **Step 4: Suites green, full gate including e2e** (app.ts/index.ts changed).
- [ ] **Step 5: Commit** - `feat: the projekte API with gh counts and a rebuildable scan`

---

### Task 6: The Projekte app shell and the table

**Files:**

- Create: `web/projekte/index.html`, `web/src/projekte/{main.tsx,App.tsx,api.ts,types.ts,format.ts,styles.css}`,
  `web/src/projekte/components/{ProjectsTable.tsx,WarningBadges.tsx}`
- Modify: `web/vite.config.ts` (rollupOptions.input `projekte`, appFallback APPS),
  `web/src/shared/AppIcons.tsx` (IconProjekte), `web/src/shared/BenchNav.tsx` (AppKey +
  APPS entry between Vault and CRM), `web/src/home/App.tsx` (card + lede), `server/src/app.ts`
  APPS already done in Task 5 - verify both lists agree
- Test: `web/src/projekte/App.test.tsx`, `web/src/projekte/format.test.ts`,
  `web/src/projekte/components/ProjectsTable.test.tsx`, extend `web/src/home/App.test.tsx` and
  `web/src/shared/BenchNav.test.tsx`

**Interfaces:**

- Consumes: `GET /api/projekte/list`, `POST /api/projekte/scan` from Task 5; `initTheme`,
  `BenchNav` from shared.
- Produces: `Project` type in `types.ts` mirroring the API row (camelCase, plus `isDuplicate`,
  `sameName`); `api.list(): Promise<ListReply>`, `api.scan(): Promise<ScanSummary>` following
  `web/src/vault/api.ts`'s fetch pattern; `deltaText(dirty, ahead, behind): string` and
  `dateText(ms: number | null): string` in `format.ts`.

**German strings, exact:** document title and h1 `Projekte`; button `Neu scannen`, while running
`Scannt …`; view toggle `Tabelle` / `Board` (Board arrives in Task 7 - render the toggle now,
disabled `Board` with `title="Kommt gleich"` is NOT wanted: render only `Tabelle` until Task 7
adds the toggle); summary line `` `${projects} Projekte · ${repos} Repos · ${duplicates} Dubletten` ``
plus ` · zuletzt ${dateText(scannedAt)}` when scanned; empty states `Noch nicht gescannt.` and
`Keine Projekte gefunden.`; table headers `Projekt`, `Marke`, `Status`, `Branch`,
`Letzter Commit`, `Änderungen`, `Issues`, `PRs`, `Notiz`, `Hinweise`; badges `Dublette`,
`Mögliche Dublette`, `Kein Remote`, `Ohne Git`; em dash `—` for absent values;
`deltaText`: parts `` `${dirty} geändert` ``, `` `${ahead} voraus` ``, `` `${behind} zurück` ``
joined with `·`, all-zero → `sauber`, null ahead/behind omitted; `dateText`:
`Intl.DateTimeFormat("de-DE", { dateStyle: "medium" })`, null → `—`. The note link's text is the
note's title-like basename; it links to `` `/vault/n/${notePath.split("/").map(encodeURIComponent).join("/")}` ``
as a plain `<a>` (a different document - never a router Link).

**Layout:** the Vault app's chrome pattern - `<BenchNav active="projekte" />`, a `main.projekte`
with a header row (h1, summary line, actions right: `Neu scannen`), the table below. Table rows:
name (strong) with the path muted beneath, then the columns above; rows sorted by
`lastCommitAt` desc, nulls last; a row is a `<button>`-free `<tr>` for now (detail arrives in
Task 7). Styles: token discipline exactly as `web/src/vault/styles.css` (every colour a variable
with a dark value, `color-scheme`, the 47 px strip offset, `--accent: #ff5c00` stays put in both
themes with the same comment convention).

- [ ] **Step 1: Failing tests.** `format.test.ts`: the `deltaText`/`dateText` cases above,
      including `deltaText(0, null, null)` → `sauber` and `deltaText(2, 1, 0)` →
      `2 geändert · 1 voraus`. `ProjectsTable.test.tsx` (rows passed as props): renders name, branch,
      delta, badges (`Dublette` when `isDuplicate`, `Mögliche Dublette` when `sameName` and not
      `isDuplicate`, `Kein Remote` for kind git without remote, `Ohne Git` for folders); null issues →
      `—`; note cell links into `/vault/n/…` with encoded segments. `App.test.tsx` (mock `api`): shows
      the summary line and rows after load; `Neu scannen` calls `api.scan` then `api.list` again;
      while scanning the button reads `Scannt …` and is disabled. Home/BenchNav tests: the launcher
      shows a `Projekte` card and the lede reads `Vier Apps, ein Server, ein Rechner.` (prefix); the
      nav lists Start, Vault, Projekte, CRM, Rolodex in that order.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement.** IconProjekte (match the AppIcons file's existing component shape):

```tsx
<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="2"
  strokeLinecap="round"
  strokeLinejoin="round"
  aria-hidden="true"
>
  <path d="M4 4h6v10H4z" />
  <path d="M14 4h6v6h-6z" />
  <path d="M14 14h6v6h-6z" />
  <path d="M4 18h6" />
</svg>
```

The launcher lede keeps its existing second sentence - only `Drei` becomes `Vier`. The home card
copy: title `Projekte`, line `Repos und Arbeitsordner: Stand, Dubletten, Notizen.`

- [ ] **Step 4: Suites green, full gate including e2e** (the smoke/theme specs may need their
      app lists extended - if `e2e/smoke.spec.ts` or `theme.spec.ts` enumerate documents, add
      `/projekte/`; that is part of this task, not Task 8).
- [ ] **Step 5: Commit** - `feat: the Projekte app with the scan table`

---

### Task 7: Board, warnings and the detail panel

**Files:**

- Create: `web/src/projekte/components/{Board.tsx,Detail.tsx}`
- Modify: `web/src/projekte/App.tsx` (view toggle, selection state), `web/src/projekte/styles.css`
- Test: `web/src/projekte/components/Board.test.tsx`, `web/src/projekte/components/Detail.test.tsx`,
  extend `App.test.tsx`

**Interfaces:**

- Consumes: `Project` rows, `GET /api/projekte/project?path=` via `api.project(path)` (add to
  `api.ts`).
- Produces: `<Board projects onSelect />`, `<Detail project duplicates onClose />`.

**Board semantics:** sections per Marke (brand), `Ohne Marke` last; inside a section one column
per status in the order the data yields sorted ascending, `Unzugeordnet` (status null) last;
cards show name, delta line, badges. **Detail:** a side panel (right, like a drawer but plain -
no transform animation, it is either mounted or not) listing every field with its German label
(`Pfad`, `Branch`, `Letzter Commit`, `Änderungen`, `Issues`, `PRs`, `Marke`, `Status`), links
`In GitHub öffnen` (only for GitHub remotes, `https://github.com/<label>`), `Notiz im Vault`
(only when coupled), a `Duplikate` list naming the other paths in the group, close button
`Schließen`. View toggle: two buttons `Tabelle` / `Board`, the active one marked via
`aria-pressed`; selection opens the detail from either view; Escape closes it.

- [ ] **Step 1: Failing tests** - Board: groups two brands plus `Ohne Marke`, `Unzugeordnet`
      column last, card click calls `onSelect`; Detail: renders fields, GitHub link only with a label,
      note link only when coupled, duplicate paths listed, Escape and `Schließen` both call `onClose`;
      App: toggle switches views (`aria-pressed` moves), selecting a row loads and shows the detail.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e.**
- [ ] **Step 5: Commit** - `feat: board by brand and status with warnings and a detail panel`

---

### Task 8: The Projekte e2e suite

**Files:**

- Create: `e2e/projekte/{table.spec.ts,board.spec.ts,scan.spec.ts}`
- Modify: `e2e/fixtures.ts` (a worker-scoped `projectsDir` fixture exposing
  `<workerData>/sample-projekte` - derived from the same DATA_DIR the server got, not recomputed)

**Interfaces:** Consumes the running per-worker server (sample mode: `PROJECT_ROOTS` unset,
`BENCH_GH: "off"`), `test`/`expect` from `../fixtures` only.

- [ ] **Step 1: table.spec.ts** - open `/projekte/`; the first visit triggers the lazy scan, so
      assert with generous polling: rows for `leuchtfeuer`, `leuchtfeuer-alt`, `treibgut` appear;
      `leuchtfeuer`'s row shows `1 geändert · 1 voraus` and a `Dublette` badge; `treibgut` shows
      `Kein Remote`; issues cells read `—` (gh off). **board.spec.ts** - switch to `Board`; with the
      sample uncoupled everything sits under `Ohne Marke` / `Unzugeordnet`; a card click opens the
      detail; `Schließen` closes it; the detail of `leuchtfeuer` lists `leuchtfeuer-alt` under
      `Duplikate`. **scan.spec.ts** - `git init` a new repo `werkstatt/neuzugang` with one commit into
      `projectsDir` via `execFileSync` in the test (same `-c user.email=bench@example.com` flags as the
      sample builder), click `Neu scannen`, expect the `neuzugang` row to appear without a reload -
      this is the "one scan finds it" criterion in miniature. No `waitForTimeout` anywhere; poll on
      visible rows.
- [ ] **Step 2: Run the suite** (`npx playwright test e2e/projekte --retries=0`, then the full
      `npm run e2e`), fix flakiness at the root (an unmet wait, never a sleep).
- [ ] **Step 3: Full gate.** **Step 4: Commit** - `test: the Projekte browser suite over a built sample`

---

### Task 9: Documentation and the four-app sweep

**Files:**

- Create: `docs/projekte/REQUIREMENTS.md`, `docs/projekte/IMPLEMENTATION.md`
- Modify: `docs/PROJECT.md`, `AGENTS.md`, `README.md`, `docs/PROCESS.md` (e2e layout list),
  `e2e/EXPLORATORY.md` (a Projekte section for what stays uncovered - the real-machine scan
  breadth, gh against live repos)

**Content rules:** REQUIREMENTS.md condenses the Projekte rows of `SPEC.md` and `PLAN.md` Phase 2
(purpose, sources, the read-only rule, success criteria); IMPLEMENTATION.md describes what IS
built - the scan pipeline order, the ignore rules and depth cap, remote normalisation and the two
duplicate notions (`Dublette` = same group_key, `Mögliche Dublette` = same name across groups),
the coupling convention (`path:` frontmatter, `brand/`/`status/` tags), the gh GraphQL call and
its null-on-failure rule, the lazy first scan, `BENCH_GH=off`, the sample workshop's exact shape,
and a "Things that will bite" list (case-insensitive path matching, the `.git` file of worktrees,
unborn HEAD, the depth cap hiding deeply nested repos). PROJECT.md: the app table row, the layout
tree, the Bench OS decisions bullet extends the vault-read exception to name `projekte`
(couplings) beside `aufgaben` (tasks), "Adding an app" needs no change. AGENTS.md: "Three
local-first apps (CRM, Rolodex, Vault)" → "Four local-first apps (CRM, Rolodex, Vault,
Projekte)". README: the app list. Every factual claim checked against the code; no machine paths;
no volatile counts.

- [ ] **Step 1: Write the docs, verify claims against the code.**
- [ ] **Step 2: Full gate** (docs only, but run `check` regardless; e2e not needed unless code
      changed). **Step 3: Commit** - `docs: the Projekte app and the four-app tree`

---

### Task 10: Final gate against the real machine

**Files:**

- Modify: `.env` (untracked, this machine only): append
  `PROJECT_ROOTS=~/Downloads:~/Downloads/Projekte:~/Documents:~`
- Create: the criteria report in the SDD workspace (untracked); screenshots under `data/`
  (untracked)
- Modify (only if a criterion demands a doc line): `e2e/EXPLORATORY.md`

**The Phase 2 success criteria, each with a measured number or a concrete pointer:**

1. Every repository from the spec's inventory appears after one scan (the inventory lives in the
   user's vault note `30_Projekte/KI_Automatisierung/Bench_OS_Plan.md`, section 2.3 - count the
   git repos found vs. the table's rows; name misses by basename only in the untracked report).
2. The known duplicates group correctly: the myCrafton pair and the Escape-Tour triple as
   `Dublette` (same remote); the two Merch clones as `Mögliche Dublette` (same basename,
   different remotes).
3. `dirty`/`ahead`/`behind` match `git status` on five sampled repos (run `git status -sb` by
   hand, compare).
4. The ÆND issue count matches `gh issue list -R AEND-GMBH/aend --state open` (count the lines /
   use `--json number --jq length`).
5. The Merch, myCrafton and Shoes-Please project notes couple automatically - their vault notes
   carry `path:` frontmatter. If a note lacks `path:`, the criterion fails as BLOCKED: report it -
   the note edit is the user's, never the agent's.
6. The scan finishes in under 10 s (the summary's `ms`; report the number).

Plus: screenshots of table, board and detail in both themes (untracked); the e2e criterion is
already proven by Task 8. **Privacy rules:** repo names and machine paths stay out of tracked
files; the report and screenshots live untracked; the vault is not modified; no note content is
quoted.

- [ ] **Step 1: Configure, scan, measure** each criterion. A failing criterion is reported
      BLOCKED with evidence, never patched silently.
- [ ] **Step 2: Full gate one last time** (`npm run format && npm run check && npm run e2e`).
- [ ] **Step 3: Commit** (only tracked changes, if any) - `docs: exploratory notes for the Projekte app`

---

## Self-review notes

- Type names used across tasks are consistent: `ProjectRow` (server db), `Project` (web),
  `GitState`, `Coupling`, `ScanSummary`, `GhRunner`, `ProjekteContext`, `LocatedProjects`.
- The sample builder (Task 1) is consumed by Tasks 2, 3, 5 (tests), the server's sample mode
  (Task 5 wiring) and every e2e worker (Task 8) - one builder, five consumers, no committed
  repos.
- Working folders appear only through a vault coupling - the rule that keeps a Downloads scan
  from drowning the registry; called out to the user at plan approval.
- `web/src/space` no longer exists; nothing here references it. The nav gains its fifth key;
  PROJECT.md's "colour means state" rule needs no new colour.
