# Projektstand - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project is a handoff note. Bench reads the notes under `50_Workflow/Handoffs/`, couples
scanned repositories to them through `repos:`, computes three freshness signals, and shows the
result as the Projekte app's default view and at the top of the Cockpit's Projekte panel - without
writing anything. Spec: [SPEC.md](./SPEC.md).

**Architecture:** Two new pure modules in `server/src/projekte/` - `handoffs.ts` (the vault side:
notes to `Handoff` records) and `stand.ts` (the assembly: handoffs plus scanned rows to the
`/stand` reply, signals included) - and one new route that runs them at read time against the
injected vault handle and the current `projects` table, so a handoff edit is live from the vault
watcher while the repository side stays as fresh as the last scan. The web side adds one view to
the Projekte shell and switches the Cockpit's Projekte panel from `/list` to `/stand`. Nothing
crosses an app boundary: the task exclusion mirrors `aufgaben`'s list by hand, the Cockpit
declares the reply shape locally.

**Tech Stack:** Express 5, better-sqlite3, Vite 8 + React 19, vitest 4, Playwright.
**No new dependency, no new database, no new route beyond `GET /api/projekte/stand`.**

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every
  shell. TypeScript `6.0.3` exactly.
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task
  touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or the fixtures. Coverage
  stays at or above 80 % statements per workspace. Every gate step FOREGROUND with a generous
  explicit timeout and its own exit code - never piped through `tail`/`head`/`grep`; a run that
  gets auto-backgrounded is polled to completion immediately. No Bench server may be running
  during `check` (`lsof -nP -iTCP:8100 -sTCP:LISTEN` first - its vault watcher starves
  `watch.test.ts`). Opaque failure -> `df -h` first.
- Focused tests: `cd server && npx vitest run test/projekte` / `cd web && npx vitest run
src/projekte src/home` (never `-w`, that is vitest's watch flag). e2e retry-safety proofs use
  `npx playwright test <spec> --workers=1 --repeat-each=2`.
- ESLint limits: 500 lines a file, 200 a function (`.tsx` exempt from the latter), complexity
  15, depth 4, 5 params. No `any`. No emoji in code or comments. Comments say why. Hand-rolled
  line scanners over regex-heavy parsing. Immutable data - build new objects, never mutate.
- **No import across app boundaries.** `server/src/projekte/` imports nothing from
  `server/src/aufgaben/` or `server/src/vault/` (only `../config.js`, as `couple.ts` does);
  `web/src/home/` imports nothing from `web/src/projekte/`. Where a rule is shared, it is mirrored
  locally with a why-comment naming the twin.
- Read-only: this change writes to no file and no database.
- Machine paths, vault contents and real project names other than the fixture's never appear in
  tracked files or reports. Fixtures are synthetic (`~/Projekte/leuchtturm`, `de.beispiel.*`).
- German UI strings exactly as written in this plan; identifiers, comments, commits English.
  Conventional Commits, one line under 72 characters, then a blank line and EXACTLY these two
  trailers on every commit:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` <!-- allow-secret: Anthropic's own no-reply address, required verbatim in every commit trailer --> and
  `Claude-Session: https://claude.ai/code/session_01MoJadrroWuuNdrBRnWAPCF`. Never push. Branch
  `projektstand`, cut from `main` at 665dd4b; the spec is already committed as 8f895e2.

## Decisions settled at plan approval

The twelve spec decisions stand. The plan adds these resolutions, all of which are implementation
detail the spec left open:

1. **The task exclusion is mirrored, not imported.** `stand.ts` declares its own
   `EXCLUDED_FOLDERS = new Set(["50_Workflow", "Templates", "90_Archive"])` with a why-comment
   naming `server/src/aufgaben/tasks.ts`'s `EXCLUDED` as the twin kept in step by hand - the
   ESLint denylist forbids the import, and injecting a predicate at the composition root for
   three strings would be ceremony.
2. **Handoffs are selected by `folder = '50_Workflow/Handoffs'` equality**, never `LIKE
'50_Workflow/%'` - the underscore is a LIKE wildcard (the trap Kontext's docs record).
3. **`updated` arrives from the index as whatever gray-matter made of it**: an unquoted
   `2026-09-05` becomes a YAML date, which the index stores as the JSON ISO string
   `"2026-09-05T00:00:00.000Z"`; a quoted one stays `"2026-09-05"`. `parseUpdated` accepts any
   string starting with `YYYY-MM-DD` and keeps those ten characters; anything else is `null`.
4. **`veraltet` compares local calendar days.** The newest `lastCommitAt` (epoch ms) is turned
   into a local `YYYY-MM-DD` and compared as a string against `updated`, so a 23:30 commit on the
   handoff's own day is not "after" it because of UTC.
5. **Badge wording handles the singular:** `1 Repo ungesichert` / `<n> Repos ungesichert`,
   `1 offene Aufgabe` / `<n> offene Aufgaben`. The other strings are as the spec writes them.
6. **The Cockpit reads `/stand` instead of `/list`.** `ohneProjekt` is exactly the set the
   moving-repositories rows may show, so one fetch serves both halves of the panel.

   Superseded at execution (user ruling 2026-09-05): the Cockpit fetches `/list` first as the
   lazy first-scan trigger, then `/stand`.

7. **The Projekte view renders even with zero repositories.** The existing
   `Keine Projekte gefunden.` empty state applies to the table and board only.
8. **The fixture project note `30_Projekte/Leuchtturm/Leuchtturm.md` gains `projekt: leuchtturm`**
   so the `offeneTasks` signal has a real, countable source in fixtures and e2e.
9. **SDD workspace:** `.superpowers/sdd/PLAN-projektstand/` (chosen by the controller rather than
   the skill script's basename-derived `PLAN/`, which every change directory's `PLAN.md` would
   collide on). Ledger first line names this plan file.

---

### Task 0: Setup

Controller work, no subagent: branch `projektstand` exists at 8f895e2, this plan committed as
`docs: the Projektstand plan`, the ledger initialised at
`.superpowers/sdd/PLAN-projektstand/progress.md`.

---

### Task 1: Handoff notes as projects

**Files:**

- Create: `server/src/projekte/handoffs.ts`
- Test: `server/test/projekte/handoffs.test.ts`

**Interfaces:**

- Produces:

```ts
export interface Handoff {
  slug: string; // frontmatter projekt, trimmed, lowercased
  title: string; // notes.title
  notePath: string; // vault-relative, e.g. "50_Workflow/Handoffs/Handoff_bench.md"
  updated: string | null; // "YYYY-MM-DD" or null
  repos: string[]; // tilde-expanded, path.resolve'd, as written order
  zustand: string; // section body, trimmed, "" when none
}
export interface HandoffsResult {
  handoffs: Handoff[];
  warnings: string[];
}
export function zustandSection(body: string): string;
export function parseUpdated(value: unknown): string | null;
export function vaultHandoffs(vaultDb: Database.Database): HandoffsResult;
```

- Consumes: `expandTilde` from `server/src/config.ts`; the `notes` table
  (`path, title, folder, frontmatter, body`).

- [ ] **Step 1: Write the failing tests.** Build the vault the way `couple.test.ts` does - copy
      its private `buildVault` helper into the new file (a test-local helper, not shared), but with
      `title`, `folder` and `body` as real parameters:

```ts
import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import type Database from "better-sqlite3";
import { openVaultDb } from "../../src/vault/db.js";
import {
  parseUpdated,
  vaultHandoffs,
  zustandSection,
} from "../../src/projekte/handoffs.js";
import { scratchDir } from "./tmp.js";

interface NoteFixture {
  path: string;
  title?: string;
  frontmatter: Record<string, unknown>;
  body?: string;
}

// Module-level scratch dir, one per file, as couple.test.ts does; each buildVault call gets its
// own database file inside it, named after the test.
const scratch = scratchDir("bench-handoffs-");
afterAll(scratch.cleanup);
let dbCount = 0;

function buildVault(notes: NoteFixture[]): Database.Database {
  const db = openVaultDb(
    path.join(scratch.dir, `vault-${String(dbCount++)}.sqlite`),
  );
  const insert = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const note of notes) {
    insert.run(
      note.path,
      note.title ?? path.posix.basename(note.path, ".md"),
      path.posix.dirname(note.path),
      JSON.stringify(note.frontmatter),
      note.body ?? "",
      0,
      0,
    );
  }
  return db;
}

const HANDOFF = "50_Workflow/Handoffs";

describe("zustandSection", () => {
  it("returns the Zustand section body up to the next H2", () => {
    const body = "# Handoff\n\n## Zustand\n\nA\nB\n\n## Offen\n\nC\n";
    expect(zustandSection(body)).toBe("A\nB");
  });
  it("falls back to the first H2 section", () => {
    expect(zustandSection("# H\n\n## Erstes\n\nX\n\n## Zweites\n\nY")).toBe(
      "X",
    );
  });
  it("is empty without any H2", () => {
    expect(zustandSection("# Nur Titel\n\nText")).toBe("");
  });
});

describe("parseUpdated", () => {
  it("keeps a plain date", () => {
    expect(parseUpdated("2026-09-05")).toBe("2026-09-05");
  });
  it("keeps the day of an ISO datetime (a YAML date through JSON)", () => {
    expect(parseUpdated("2026-09-05T00:00:00.000Z")).toBe("2026-09-05");
  });
  it("is null for anything else", () => {
    expect(parseUpdated("gestern")).toBeNull();
    expect(parseUpdated(20260905)).toBeNull();
    expect(parseUpdated(undefined)).toBeNull();
  });
});

describe("vaultHandoffs", () => {
  it("reads slug, title, updated, repos and zustand from a handoff note", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_leuchtturm.md`,
        title: "Handoff: Leuchtturm",
        frontmatter: {
          projekt: " Leuchtturm ",
          updated: "2026-08-01",
          repos: ["~/Projekte/leuchtturm", "/tmp/hafen"],
        },
        body: "# Handoff: Leuchtturm\n\n## Zustand\n\nSteht.\n\n## Offen\n\n- x\n",
      },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(warnings).toEqual([]);
    expect(handoffs).toHaveLength(1);
    const [h] = handoffs;
    expect(h.slug).toBe("leuchtturm");
    expect(h.title).toBe("Handoff: Leuchtturm");
    expect(h.updated).toBe("2026-08-01");
    expect(h.repos[0]).toBe(
      path.resolve(path.join(process.env.HOME ?? "", "Projekte", "leuchtturm")),
    );
    expect(h.repos[1]).toBe(path.resolve("/tmp/hafen"));
    expect(h.zustand).toBe("Steht.");
  });
  it("ignores notes outside the Handoffs folder, including a sibling with an underscore", () => {
    const db = buildVault([
      { path: "50_Workflow/Testing.md", frontmatter: { projekt: "x" } },
      {
        path: "50xWorkflow/Handoffs/Handoff_y.md",
        frontmatter: { projekt: "y" },
      },
      { path: `${HANDOFF}/Handoff_z.md`, frontmatter: { projekt: "z" } },
    ]);
    expect(vaultHandoffs(db).handoffs.map((h) => h.slug)).toEqual(["z"]);
  });
  it("warns about a handoff without projekt and skips it", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_ohne.md`,
        frontmatter: { updated: "2026-01-01" },
      },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs).toEqual([]);
    expect(warnings).toEqual(["Handoff ohne projekt: Handoff_ohne.md"]);
  });
  it("keeps the first of two handoffs with the same slug and warns about the second", () => {
    const db = buildVault([
      { path: `${HANDOFF}/Handoff_b.md`, frontmatter: { projekt: "same" } },
      { path: `${HANDOFF}/Handoff_a.md`, frontmatter: { projekt: "SAME" } },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs.map((h) => h.notePath)).toEqual([
      `${HANDOFF}/Handoff_a.md`,
    ]);
    expect(warnings).toEqual(["Doppelter Slug same: Handoff_b.md"]);
  });
  it("skips non-string repos entries with a warning and tolerates a missing repos key", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_a.md`,
        frontmatter: { projekt: "a", repos: ["/tmp/x", 7] },
      },
      { path: `${HANDOFF}/Handoff_b.md`, frontmatter: { projekt: "b" } },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs[0].repos).toEqual([path.resolve("/tmp/x")]);
    expect(handoffs[1].repos).toEqual([]);
    expect(warnings).toEqual(["Ungültiger repos-Eintrag in Handoff_a.md"]);
  });
});
```

- [ ] **Step 2: Run them, watch them fail** (`cd server && npx vitest run test/projekte/handoffs.test.ts`
      -> module not found).
- [ ] **Step 3: Implement `handoffs.ts`.** The shape, with the why-comments that belong there:

```ts
import type Database from "better-sqlite3";
import path from "node:path";
import { expandTilde } from "../config.js";

export interface Handoff {
  /* as in Interfaces */
}
export interface HandoffsResult {
  handoffs: Handoff[];
  warnings: string[];
}

// Equality, not LIKE '50_Workflow/%': the underscore is a LIKE wildcard, and a sibling folder
// such as 50xWorkflow would match.
const HANDOFF_FOLDER = "50_Workflow/Handoffs";

interface NoteRow {
  path: string;
  title: string;
  frontmatter: string;
  body: string;
}

const isH2 = (line: string): boolean => line.startsWith("## ");

/** The body of `## Zustand`; absent, the first H2 section; absent, "". */
export function zustandSection(body: string): string {
  const lines = body.split("\n");
  const zustand = lines.findIndex((line) => /^## Zustand\b/.test(line));
  const start = zustand === -1 ? lines.findIndex(isH2) : zustand;
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(isH2);
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

// gray-matter turns an unquoted date into a Date, which the index serialises as an ISO datetime;
// a quoted one stays a bare date. Both start with the ten characters this reads.
export function parseUpdated(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
}

function reposOf(
  frontmatter: Record<string, unknown>,
  file: string,
  warnings: string[],
): string[] {
  if (!Array.isArray(frontmatter.repos)) return [];
  const repos: string[] = [];
  for (const entry of frontmatter.repos) {
    if (typeof entry === "string" && entry !== "")
      repos.push(path.resolve(expandTilde(entry)));
    else warnings.push(`Ungültiger repos-Eintrag in ${file}`);
  }
  return repos;
}

export function vaultHandoffs(vaultDb: Database.Database): HandoffsResult {
  const rows = vaultDb
    .prepare(
      "SELECT path, title, frontmatter, body FROM notes WHERE folder = ? ORDER BY path",
    )
    .all(HANDOFF_FOLDER) as NoteRow[];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const handoffs: Handoff[] = [];
  for (const row of rows) {
    const file = path.posix.basename(row.path);
    const frontmatter = JSON.parse(row.frontmatter) as Record<string, unknown>;
    const projekt = frontmatter.projekt;
    if (typeof projekt !== "string" || projekt.trim() === "") {
      warnings.push(`Handoff ohne projekt: ${file}`);
      continue;
    }
    const slug = projekt.trim().toLowerCase();
    // First note path wins, like couple.ts's dedupe of duplicate project paths.
    if (seen.has(slug)) {
      warnings.push(`Doppelter Slug ${slug}: ${file}`);
      continue;
    }
    seen.add(slug);
    handoffs.push({
      slug,
      title: row.title,
      notePath: row.path,
      updated: parseUpdated(frontmatter.updated),
      repos: reposOf(frontmatter, file, warnings),
      zustand: zustandSection(row.body),
    });
  }
  return { handoffs, warnings };
}
```

The `warnings` array is appended to inside `reposOf` - a local accumulator built once and never
observed mid-flight, the same shape `couple.ts` uses; no input object is mutated.

- [ ] **Step 4: Tests green, then the full gate** (`npm run format`, `npm run check`; no e2e -
      server-only, no fixture touched).
- [ ] **Step 5: Commit** - `feat: read handoff notes as projects`

---

### Task 2: The project state and its signals

**Files:**

- Create: `server/src/projekte/stand.ts`
- Test: `server/test/projekte/stand.test.ts`

**Interfaces:**

- Consumes: `Handoff`, `vaultHandoffs` (Task 1); `ProjectRow` from `server/src/projekte/db.ts`
  (camelCase: `path`, `lastCommitAt: number | null` in epoch ms, `dirty: number`).
- Produces:

```ts
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
export function localDay(ms: number): string; // "YYYY-MM-DD" in the server's local zone
export function projektStand(
  vaultDb: Database.Database,
  rows: ProjectRow[],
): StandReply;
```

- [ ] **Step 1: Write the failing tests.** Same `buildVault` helper as Task 1 (copy it; add an
      `insertTask(path, line, done)` that writes `INSERT INTO tasks (path, line, raw, text, done)
VALUES (?, ?, '- [ ] t', 't', ?)`), plus a `row(overrides: Partial<ProjectRow>): ProjectRow`
      builder with every field defaulted (`kind: "git"`, `dirty: 0`, `lastCommitAt: null`,
      `groupKey: "g"`, `scannedAt: 0`, the rest `null` or `""`). Cases:

```ts
it("couples repos by lowercased resolved path and reports missing ones by basename", () => {
  const db = buildVault([
    handoff("a", { repos: ["/tmp/Repo-A", "/tmp/nicht-da"] }),
  ]);
  const rows = [
    row({ path: "/tmp/repo-a", name: "repo-a" }),
    row({ path: "/tmp/other", name: "other" }),
  ];
  const reply = projektStand(db, rows);
  expect(reply.projekte[0].repos.map((r) => r.name)).toEqual(["repo-a"]);
  expect(reply.projekte[0].missingRepos).toEqual(["nicht-da"]);
  expect(reply.ohneProjekt.map((r) => r.name)).toEqual(["other"]);
});
it("is veraltet when the newest commit day is after updated, not on it", () => {
  const onTheDay = new Date(2026, 7, 1, 23, 30).getTime(); // 2026-08-01 local, late evening
  const dayAfter = new Date(2026, 7, 2, 0, 5).getTime();
  const db = buildVault([
    handoff("a", { updated: "2026-08-01", repos: ["/tmp/a"] }),
  ]);
  expect(
    projektStand(db, [row({ path: "/tmp/a", lastCommitAt: onTheDay })])
      .projekte[0].signals.veraltet,
  ).toBe(false);
  expect(
    projektStand(db, [row({ path: "/tmp/a", lastCommitAt: dayAfter })])
      .projekte[0].signals.veraltet,
  ).toBe(true);
});
it("is not veraltet without repos, without commits, or without a date", () => {
  /* three asserts */
});
it("counts dirty repos", () => {
  /* two coupled rows, dirty 3 and 0 -> 1 */
});
it("counts open tasks of notes carrying the slug, excluding housekeeping folders and done tasks", () => {
  const db = buildVault([
    handoff("a"),
    { path: "30_Projekte/A/A.md", frontmatter: { projekt: "A" } },
    { path: "50_Workflow/Handoffs/Handoff_a.md" /* the handoff itself */ },
    { path: "Templates/T.md", frontmatter: { projekt: "a" } },
  ]);
  insertTask(db, "30_Projekte/A/A.md", 1, 0);
  insertTask(db, "30_Projekte/A/A.md", 2, 1);
  insertTask(db, "50_Workflow/Handoffs/Handoff_a.md", 5, 0);
  insertTask(db, "Templates/T.md", 1, 0);
  expect(projektStand(db, []).projekte[0].signals.offeneTasks).toBe(1);
});
it("sorts veraltet first, then oldest updated first, unknown dates last", () => {
  /* four handoffs */
});
it("passes the handoff warnings through and keeps ohneProjekt in the given order", () => {
  /* ... */
});
```

- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement `stand.ts`:**

```ts
import type Database from "better-sqlite3";
import path from "node:path";
import type { ProjectRow } from "./db.js";
import { type Handoff, vaultHandoffs } from "./handoffs.js";

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
```

- [ ] **Step 4: Tests green, full gate** (server-only).
- [ ] **Step 5: Commit** - `feat: the project state with its freshness signals`

---

### Task 3: `GET /api/projekte/stand`

**Files:**

- Modify: `server/src/projekte/routes.ts` (one route inside `projekteRouter`, after `/list`)
- Test: `server/test/projekte/routes.test.ts` (extend)

**Interfaces:**

- Consumes: `projektStand` (Task 2), `listProjects` (existing), the `vaultDb` the router already
  receives.
- Produces: `GET /api/projekte/stand` -> `StandReply` as JSON. Reads the current `projects`
  table; never triggers a scan (an empty table simply yields every handoff with all its repos
  missing - the honest picture before the first scan).

- [ ] **Step 1: Failing test.** In `routes.test.ts`, using `appWithProjekte(projekte, vault)` from
      `server/test/projekte/app.ts` and `buildSampleContext(dir)`: insert one handoff note into
      the sample context's vault db whose `repos` names one of the sample workshop's checkout
      paths (read it back from `listProjects(projekte.db)` after a `POST /scan`), then
      `GET /api/projekte/stand` -> 200; `body.projekte[0].repos[0].path` equals that path;
      `body.ohneProjekt` holds the remaining rows; `body.warnings` is `[]`. A second test: a vault
      without handoffs -> `{ projekte: [], ohneProjekt: <all rows>, warnings: [] }`.
- [ ] **Step 2: Watch it fail (404). Step 3: Implement:**

```ts
router.get("/stand", (_req, res) => {
  res.json(projektStand(vaultDb, listProjects(db)));
});
```

- [ ] **Step 4: Tests green, full gate** (server-only; `app.ts`/`index.ts` untouched).
- [ ] **Step 5: Commit** - `feat: GET /api/projekte/stand`

---

### Task 4: The Projekte view

**Files:**

- Modify: `web/src/projekte/types.ts` (append the reply types), `web/src/projekte/api.ts`
  (`stand`), `web/src/projekte/App.tsx`, `web/src/projekte/styles.css`
- Create: `web/src/projekte/stand.ts` (pure helpers), `web/src/projekte/components/ProjektCard.tsx`,
  `web/src/projekte/components/ProjektView.tsx`
- Test: `web/src/projekte/stand.test.ts`, `web/src/projekte/components/ProjektView.test.tsx`,
  `web/src/projekte/App.test.tsx` (extend)

**Interfaces:**

- `types.ts` gains, mirroring the server shapes with the web's `Project` minus derived flags:

```ts
export interface StandSignals {
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
  repos: ProjectDetail[];
  missingRepos: string[];
  signals: StandSignals;
}
export interface StandReply {
  projekte: ProjektStand[];
  ohneProjekt: ProjectDetail[];
  warnings: string[];
}
```

- `api.ts`: `stand: () => get<StandReply>("/api/projekte/stand")`.
- `stand.ts` (web):

```ts
/** Whole days between two YYYY-MM-DD strings, today minus updated; null without a date. */
export function ageDays(updated: string | null, today: string): number | null;
export function ageText(days: number | null): string; // null -> "Datum fehlt", 0 -> "heute", 1 -> "vor 1 Tag", n -> `vor ${n} Tagen`
export function dayText(updated: string): string; // de-DE medium date of a YYYY-MM-DD, via new Date(y, m-1, d)
export function standHints(p: ProjektStand): string[];
// veraltet -> "Stand veraltet"; dirtyRepos 1 -> "1 Repo ungesichert", n -> `${n} Repos ungesichert`;
// offeneTasks 1 -> "1 offene Aufgabe", n -> `${n} offene Aufgaben`; each missingRepos -> `Repo nicht gefunden: ${name}`
```

- `ProjektCard({ projekt, today, onSelect })`: `<article className="projekte-stand-card">` with
  `<h2>{title}</h2>`, the line `Handoff vom {dayText(updated)} · {ageText(...)}` (or just
  `Datum fehlt`), `<ul className="projekte-badges">` of `standHints` in `projekte-badge` items,
  `<pre className="projekte-stand-text">{zustand}</pre>` (omitted when empty), the link
  `<a href={noteHref(notePath)}>Handoff im Vault</a>`, and `<ul className="projekte-stand-repos">`
  rows: a `<button type="button" onClick={() => onSelect(repo.path)}>{repo.name}</button>` plus
  `<span>{repo.branch ?? EM_DASH} · {deltaText(repo.dirty, repo.ahead, repo.behind)} · {dateText(repo.lastCommitAt)}</span>`.
- `ProjektView({ stand, today, onSelect })`: warnings as `<ul className="projekte-stand-warnings">`;
  `Keine Handoffs.` when `projekte` is empty, else the cards; then
  `<section className="projekte-stand-rest"><h2>Ohne Projekt</h2>` with the same repo rows or
  `Alle Repos sind einem Projekt zugeordnet.`
- `App.tsx`: `type View = "projekte" | "table" | "board"`, initial `"projekte"`; a third
  `.projekte-view-btn` labelled `Projekte` placed FIRST; state `stand: StandReply | null` loaded
  with the list on mount and again after `rescan`; `today` computed once per render as the local
  `YYYY-MM-DD`; render:

```tsx
{list && stand && (
  <div className="projekte-content">
    <div className="projekte-primary">
      {view === "projekte" ? (
        <ProjektView stand={stand} today={today} onSelect={openDetail} />
      ) : list.projects.length === 0 ? (
        <p className="projekte-empty">Keine Projekte gefunden.</p>
      ) : view === "table" ? (
        <ProjectsTable projects={list.projects} onSelect={openDetail} />
      ) : (
        <Board projects={list.projects} onSelect={openDetail} />
      )}
    </div>
    {detail && <Detail ... />}
  </div>
)}
```

The `summaryLine` keeps its wording. Styles: `projekte-stand-*` classes, colours via the
existing tokens only, both themes checked by eye.

- [ ] **Step 1: Failing tests.** `stand.test.ts`: `ageDays("2026-09-01", "2026-09-05")` -> 4,
      null date -> null; `ageText` all four branches; `standHints` singular/plural and the
      missing-repo lines, and `[]` for a quiet project. `ProjektView.test.tsx` (Testing Library,
      literal `StandReply`): a card shows title, `Handoff vom 1. Aug. 2026`, the badges, the
      zustand text and the vault link `href="/vault/n/50_Workflow/Handoffs/Handoff_a.md"`;
      clicking a repo name calls `onSelect` with its path; `Ohne Projekt` lists the leftover row;
      both empty states; warnings render. `App.test.tsx`: the view defaults to `Projekte`
      (button `aria-pressed="true"`), `api.stand` is called on mount, switching to `Tabelle`
      shows the table, and a `stand` with one project but an empty `list.projects` still renders
      the card (decision 7).
- [ ] **Step 2: Watch them fail. Step 3: Implement.**
- [ ] **Step 4: Focused suites green, then `npm run format`, `npm run check`, `npm run e2e`**
      (`web/` touched; the existing `e2e/projekte/*.spec.ts` click `Tabelle`/`Board` by name and
      must still pass - if a spec relied on the table being the default view, switch it to click
      `Tabelle` first and disclose).
- [ ] **Step 5: Commit** - `feat: the Projekte view over handoffs`

---

### Task 5: The Cockpit lists handoffs first

**Files:**

- Modify: `web/src/home/types.ts`, `web/src/home/api.ts`, `web/src/home/App.tsx`,
  `web/src/home/styles.css` (if a class is needed)
- Test: `web/src/home/types.test.ts` (extend, if present - else the assertions live in
  `App.test.tsx`), `web/src/home/App.test.tsx`

**Interfaces (all local to `home/`, nothing imported from `projekte/`):**

```ts
export interface HandoffRow {
  slug: string;
  title: string;
  updated: string | null;
  missingRepos: string[];
  signals: { veraltet: boolean; dirtyRepos: number; offeneTasks: number };
}
export interface StandReply {
  projekte: HandoffRow[];
  ohneProjekt: Project[];
}
export const HANDOFF_ROWS = 8;
export function handoffMeta(row: HandoffRow, today: string): string;
// joins: ageText-equivalent ("heute" / "vor n Tagen" / "Datum fehlt") and the hints
// ("Stand veraltet", "n Repos ungesichert", "n offene Aufgaben") with " · "; the same wording as
// the Projekte app, written here again on purpose (the no-sibling-import rule).
```

- `api.ts`: replace `projects` with `stand: () => get<StandReply>("/api/projekte/stand")`.
- `App.tsx`: `ProjectPanel({ stand, now })` renders, under the unchanged heading
  `Projekte in Bewegung`, first `stand.projekte.slice(0, HANDOFF_ROWS)` as `home-row` links to
  `/projekte/` (text `title`, meta `handoffMeta`), then - when more exist - one row
  `… und <n> weitere` linking to `/projekte/`, then `movingProjects(stand.ohneProjekt, now)`
  rows exactly as today. Empty state `Alles ruhig.` only when both lists are empty.

- [ ] **Step 1: Failing tests.** `handoffMeta` cases; App: the panel shows a handoff title with
      `Stand veraltet · vor 3 Tagen` (fixed `now`), the ninth handoff is folded into
      `… und 2 weitere`, a repository in `ohneProjekt` still appears with its `deltaText`, a
      coupled repository does NOT appear as a moving row, and the empty state.
- [ ] **Step 2: Watch them fail. Step 3: Implement** (the mock in `App.test.tsx` switches from
      `api.projects` to `api.stand`).
- [ ] **Step 4: Focused suite, then format, check, e2e** (`e2e/cockpit.spec.ts` currently asserts
      `leuchtfeuer` in the panel; it stays true until Task 6 couples that repo - leave the spec
      alone here, Task 6 rewrites it).
- [ ] **Step 5: Commit** - `feat: the Cockpit lists handoffs first`

---

### Task 6: Fixture handoffs and the browser suite

**Files:**

- Create: `server/src/vault/fixture/50_Workflow/Handoffs/Handoff_leuchtturm.md`,
  `server/src/vault/fixture/50_Workflow/Handoffs/Handoff_hafen.md`, `e2e/projekte/stand.spec.ts`
- Modify: `server/src/vault/fixture/30_Projekte/Leuchtturm/Leuchtturm.md` (frontmatter gains
  `projekt: leuchtturm`), `e2e/fixtures.ts` (the `repos:` rewrite after the vault copy),
  `e2e/cockpit.spec.ts` (the Projekte panel assertions), every unit or e2e assertion that counts
  fixture notes (see Step 4)

**The two fixture notes, verbatim:**

```markdown
---
tags: [handoff, workflow, leuchtturm]
projekt: leuchtturm
updated: 2020-01-01
repos:
  - ~/Projekte/leuchtturm
---

# Handoff: Leuchtturm

## Zustand

Der Leuchtturm steht; die Lampe ist bestellt.

## Offene Entscheidungen

- Farbe der Kuppel
```

```markdown
---
tags: [handoff, workflow, hafen]
projekt: hafen
updated: 2026-08-01
---

# Handoff: Hafen

## Zustand

Kaimauer vermessen, Bauantrag offen.
```

`~/Projekte/leuchtturm` is the same synthetic path `Leuchtturm.md` already names, so the
committed fixture couples to nothing (unit tests and `npm start` without `.env` show
`Repo nicht gefunden: leuchtturm`). `e2e/fixtures.ts` makes it real per worker: right after
`cpSync(fixture, vaultDir, ...)`, read `50_Workflow/Handoffs/Handoff_leuchtturm.md` from the copy
and write it back with `~/Projekte/leuchtturm` replaced by
`path.join(root, workerDataDir(workerInfo.workerIndex), "sample-projekte", "werkstatt", "leuchtfeuer")`

- the `projectsDir` fixture's expression plus the workshop's own `werkstatt/leuchtfeuer` layout
  (`server/src/projekte/sample.ts:55`; `archiv/leuchtfeuer-alt` is the clone that makes it a
  duplicate, and stays uncoupled). The workshop is built at the server's first scan with fresh
  commits, so `updated: 2020-01-01` is `veraltet` by construction. `projects.path` for that
  checkout is exactly this joined string - `findRepos` joins onto the root the same way - so the
  lowercased comparison matches without any realpath step.

**`e2e/projekte/stand.spec.ts`** (`test`/`expect` from `../fixtures`, role and text locators,
`exact: true` on names):

- `/projekte/` opens on the `Projekte` view (`getByRole("button", { name: "Projekte", exact: true })`
  has `aria-pressed="true"`).
- The card `getByRole("heading", { name: "Handoff: Leuchtturm", exact: true })` is visible; inside
  its `article` (locate via `page.locator("article.projekte-stand-card").filter({ has: heading })`):
  the text `Stand veraltet`, the zustand line `Der Leuchtturm steht; die Lampe ist bestellt.`, the
  badge `5 offene Aufgaben` (the fixture `Leuchtturm.md` holds six checkboxes, five open and
  one done - comment that derivation in the spec, and re-count if the fixture changed), a repo row button
  `leuchtfeuer` that opens the detail `complementary` named `Details zu leuchtfeuer`, and the
  link `Handoff im Vault` with `href` `/vault/n/50_Workflow/Handoffs/Handoff_leuchtturm.md`.
- The card `Handoff: Hafen` shows no `Stand veraltet` and no repo rows.
- `getByRole("heading", { name: "Ohne Projekt", exact: true })` is followed by the other sample
  checkouts (`treibgut` visible) and never by `leuchtfeuer`.
- `Tabelle` still switches to the table.

**`e2e/cockpit.spec.ts`:** replace the `leuchtfeuer` assertion in `Projekte in Bewegung` with:
the row `Handoff: Leuchtturm` is visible with text containing `Stand veraltet`; `treibgut` is
visible as a moving repository; `leuchtfeuer` is NOT visible in that panel (it is coupled).

- [ ] **Step 1: Write the fixture notes and the `Leuchtturm.md` frontmatter line, then the two
      specs, then the `fixtures.ts` rewrite.**
- [ ] **Step 2: Run `npx playwright test e2e/projekte/stand.spec.ts e2e/cockpit.spec.ts --retries=0`**,
      make them green.
- [ ] **Step 3: Retry-safety proof** - `npx playwright test e2e/projekte/stand.spec.ts --workers=1 --repeat-each=2`.
- [ ] **Step 4: The count sweep.** The fixture vault now has two more notes and one more note
      with `projekt:`. Run `npm run check` and `npm run e2e` in full and update every assertion
      that shifted by exactly those notes - known candidates: `server/test/vault/watch.test.ts`
      (`toBe(14)` -> 16), the indexer and tree counts in `server/test/vault/`, any Kontext test
      listing `50_Workflow` notes (`server/test/kontext/`, `e2e/kontext/`), any Vault e2e tree or
      search count. Each edit gets a one-line comment naming the two handoff fixtures. A shift
      that is not explained by the new notes is a finding, not a count to bump.
- [ ] **Step 5: Full gate** (`format`, `check`, `e2e` twice - the second run proves the suite is
      stable with the new notes).
- [ ] **Step 6: Commit** - `test: fixture handoffs and the stand browser suite`

---

### Task 7: Documentation

**Files:**

- Modify: `docs/projekte/IMPLEMENTATION.md` (sections `## Data model` - the project level above
  the rows; `## The API` - `/stand` with its reply and sort order; `## The web app` - the
  `Projekte` view as default; `## Tests`; `## Things that will bite` - `updated` is a date and
  arrives as an ISO string, the exclusion set mirrored by hand, read-time coupling means a
  handoff edit needs no scan while a new checkout still does, `folder =` not `LIKE`, local-day
  comparison), `docs/projekte/REQUIREMENTS.md` (a `## Projektstand` section: the brief in five
  lines and a link to `docs/changes/projektstand/SPEC.md`), `docs/cockpit/IMPLEMENTATION.md`
  (`## Five sibling reads` - the panel now reads `/stand`; the `Projekte in Bewegung` bullet
  rewritten: handoff rows first, cap eight, moving repositories from `ohneProjekt` only),
  `docs/PROJECT.md` ("Bench OS decisions": one bullet `A project is a handoff note` naming
  `50_Workflow/Handoffs/`, `repos:` and the `projekt:` slug convention; the Projekte row's
  description gains "grouped under the handoff notes that own them"), `e2e/EXPLORATORY.md`
  (what stays manual: the real handoffs' `repos:` lists, the age text against the real clock,
  the seven real projects' signals).
- Content rule: every claim verified against the code at HEAD; no task-history narration; each
  doc keeps its voice.

- [ ] **Step 1: Write and verify. Step 2: `npm run format && npm run check`. Step 3: Commit** -
      `docs: a project is a handoff note`

---

### Task 8: The real-machine gate and the companion changes

Controller-led, with the user. No tracked change expected; the report lands in the SDD
workspace as `criteria-report.md`.

- [ ] **Step 1: The `/handoff` skill.** Propose to the user this addition to
      `~/.claude/skills/handoff/SKILL.md`, after the frontmatter sentence:
      `Zusätzlich \`repos:\` als Liste der Repository-Pfade des Projekts in \`~\`-Schreibweise setzen -
      mindestens das Arbeitsverzeichnis der Session, wenn es ein Git-Checkout ist, plus alles, was der User
      nennt; ein Projekt ohne Repository lässt den Schlüssel weg.` Apply it on the user's word.
- [ ] **Step 2: `Handoff_bench.md`.** On the user's word add `repos:` with this checkout's path
      in `~` form to the vault's `Handoff_bench.md` (the controller may do this one: the mapping
      is certain). The other six stay with the user (decision 12).
- [ ] **Step 3: Measure the spec's success criteria** against `npm start` with the real `.env`
      (stop the server before any `check`): (1) `GET /api/projekte/stand` lists seven projects,
      each with a non-empty `zustand` where the note has a `## Zustand` section and a correct
      `updated`; the three without repositories have `repos: []`; (2) `bench` shows this checkout
      coupled; then make one commit on this branch after the handoff's date and confirm
      `veraltet: true`, run `/handoff` (or bump `updated`) and confirm `false`; (3) `ohneProjekt`
      equals the scanned rows no handoff names, no path appears twice; (4) `offeneTasks` for
      `bench` equals a hand count over notes with `projekt: bench` outside `50_Workflow`; (5)
      screenshots of the Projekte view and the Cockpit in both themes via
      `node e2e/tools/chrome-shots.mjs` (add the Projekte view to its screen list if it shoots
      the table by default), untracked under `data/task-8-projektstand-screenshots/`. Report
      counts and basenames only.
- [ ] **Step 4: Final gate** - `npm run format`, `npm run check`, `npm run e2e`, each with its own
      exit code; commit only if a tracked change was needed (`chore: projektstand gate follow-up`).

---

## Self-review notes

- Spec coverage: model and parser (Task 1), signals, sort and `ohneProjekt` (Task 2), the route
  (Task 3), the Projekte view with every German string and both empty states (Task 4), the
  Cockpit rows with cap and no double listing (Task 5), fixture notes, `fixtures.ts` rewrite,
  the e2e spec and the Cockpit spec change (Task 6), every doc the spec names (Task 7), the
  companion skill change, `Handoff_bench.md` and the five success criteria (Task 8).
- Names consistent across tasks: `Handoff`, `HandoffsResult`, `vaultHandoffs`, `zustandSection`,
  `parseUpdated`, `Signals`, `ProjektStand`, `StandReply`, `localDay`, `projektStand`; web:
  `StandSignals`, `ProjektStand`, `StandReply`, `ageDays`, `ageText`, `dayText`, `standHints`,
  `ProjektCard`, `ProjektView`; home: `HandoffRow`, `StandReply`, `HANDOFF_ROWS`, `handoffMeta`.
- The only production behaviour change outside the new view is the Cockpit's data source
  (`/list` -> `/stand`), which the e2e Cockpit spec re-pins in Task 6.
- Nothing writes: no `.env` key, no database, no vault write, no scan trigger.
