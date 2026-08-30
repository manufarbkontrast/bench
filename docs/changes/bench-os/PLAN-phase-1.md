# Bench OS Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only Vault app at `/vault` that indexes the user's Obsidian vault (notes, links, tags, tasks, full text) into `data/vault.sqlite`, keeps the index fresh through a file watcher, and shows the vault as a folder tree, rendered notes with working wikilinks and backlinks, tags, a quick-find and an "open in Obsidian" link - then retire Space, whose job it takes over.

**Architecture:** One more Bench app, built the way PROJECT.md's "Adding an app" describes: `web/vault/index.html` → `web/src/vault/`, `server/src/vault/` with its own SQLite file, mounted at `/api/vault`. The server owns parsing and indexing (`server/src/vault/index/`), all of it pure functions over strings except the indexer that writes rows; the web app renders markdown client-side with react-markdown after a small pure transform turns wikilinks and callouts into plain markdown. Without `VAULT_DIR` the server indexes the bundled synthetic fixture vault, and every e2e worker gets its own copy of that fixture.

**Tech Stack:** Node 24, TypeScript 6.0.3, Express 5, better-sqlite3 12 with FTS5, `chokidar` 5, `gray-matter` 4 (server); React 19, react-router 8, `react-markdown` 10, `remark-gfm` 4 (web). vitest 4, supertest, Playwright.

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every shell.
- TypeScript `6.0.3` exactly; better-sqlite3 `12`; do not touch either. New dependencies are exactly `chokidar`, `gray-matter` (server) and `react-markdown`, `remark-gfm` (web), installed with `npm install <pkg> -w <workspace>`; if vitest then fails with "Cannot find native binding", run `rm -rf node_modules web/node_modules server/node_modules package-lock.json && npm install` (CONTROLS.md).
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or the fixtures. Coverage ≥ 80 % statements per workspace; nothing is loosened.
- ESLint limits: 500 lines a file, 200 a function, complexity 15, depth 4, 5 parameters. No `any`. No emoji in code, comments or commits. Comments say why.
- Immutable data: build new objects, never mutate (test scaffolding may hold a `let`).
- No emails or phone-number shapes in tracked files except `example.com` / `555-01xx`; the fixture vault contains no real names, addresses or figures.
- Commit messages: Conventional Commits, one line, imperative. Never push. Branch `bench-os-phase-1`, cut from `bench-os-phase-0`.
- Two write paths into the vault exist in the whole project and neither is in this phase: the Vault app is **read-only**. Nothing in `server/src/vault/` writes to `VAULT_DIR`.
- German UI strings exactly as written in the tasks; identifiers, comments, docs and commits English. The vault path never appears in tracked files - fixtures and tests use temp copies.
- Vault conventions the parsers must honour: Obsidian wikilinks `[[Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]`, `[[Target#Heading|Alias]]`, embeds `![[file]]`; targets resolve by exact relative path or by basename, case-insensitively, `.md` optional; callouts `> [!type] Title`; tasks in the Tasks-plugin emoji grammar: `- [ ] Text 📅 2026-08-30 ⏳ 2026-08-28 🛫 2026-08-25 🔺|⏫|🔼|🔽|⏬ 🔁 every week ✅ 2026-08-31`; frontmatter `tags:` as a YAML list or a string.
- Ignored while scanning and watching: every directory whose name starts with `.` (`.obsidian`, `.claude`, `.claudian`, `.superpowers`, `.playwright-mcp`, `.git`, `.trash`) and `node_modules`.

---

## File map

| Action | File                                                                                                                    | Responsibility after Phase 1                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Modify | `server/src/config.ts`, `server/test/config.test.ts`                                                                    | `BENCH_DOTENV=off` switch; per-test temp root                                  |
| Modify | `e2e/fixtures.ts`                                                                                                       | per-worker vault copy, `VAULT_DIR`, `BENCH_DOTENV`, waits on `/api/vault/tree` |
| Create | `server/src/vault/fixture/**`                                                                                           | the synthetic sample vault (tracked)                                           |
| Create | `server/src/vault/db.ts`                                                                                                | schema, `openDb`, row types                                                    |
| Create | `server/src/vault/index/frontmatter.ts`                                                                                 | split frontmatter, title, tags                                                 |
| Create | `server/src/vault/index/wikilinks.ts`                                                                                   | extract wikilinks, strip code fences                                           |
| Create | `server/src/vault/index/tasks.ts`                                                                                       | Tasks-plugin grammar parser                                                    |
| Create | `server/src/vault/index/scan.ts`                                                                                        | list note paths under a vault                                                  |
| Create | `server/src/vault/index/indexer.ts`                                                                                     | index one note / all notes, remove, resolve links                              |
| Create | `server/src/vault/locate.ts`                                                                                            | choose the vault dir: configured, or the bundled sample                        |
| Create | `server/src/vault/watch.ts`                                                                                             | chokidar → indexer                                                             |
| Create | `server/src/vault/routes/{index,notes,search,files}.ts`                                                                 | `/api/vault/*`                                                                 |
| Create | `server/test/vault/**`                                                                                                  | unit and API tests, fixture copy helper                                        |
| Modify | `server/src/app.ts`, `server/src/index.ts`                                                                              | mount, open, index, watch, log                                                 |
| Create | `web/vault/index.html`, `web/src/vault/**`                                                                              | the app                                                                        |
| Modify | `web/vite.config.ts`, `web/src/shared/{BenchNav,AppIcons}.tsx`, `web/src/home/App.tsx`, `eslint.config.js`, `knip.json` | registration                                                                   |
| Create | `e2e/vault/{notes,search,live}.spec.ts`                                                                                 | the browser suite                                                              |
| Modify | `e2e/smoke.spec.ts`, `e2e/theme.spec.ts`, `e2e/tools/chrome-shots.mjs`                                                  | five documents                                                                 |
| Delete | `web/space/`, `web/src/space/`, `server/src/space/`, `server/test/space/`, `e2e/space/`, `docs/space/`                  | Space retired (Task 9)                                                         |
| Move   | `web/src/space/test/setup.ts` → `web/src/test/setup.ts`                                                                 | workspace-wide vitest setup                                                    |
| Create | `docs/vault/REQUIREMENTS.md`, `docs/vault/IMPLEMENTATION.md`                                                            | the app's docs                                                                 |
| Modify | `README.md`, `AGENTS.md`, `docs/{PROJECT,PROCESS,CONTROLS,STANDARDS}.md`, `e2e/EXPLORATORY.md`                          | three apps again (Vault, CRM, Rolodex), carry-over sweep                       |

---

### Task 0: Branch, plan, baseline

**Files:**

- Create: `docs/changes/bench-os/PLAN-phase-1.md` (this file)

- [ ] **Step 1: Branch from Phase 0**

```bash
cd ~/Downloads/bench
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
git checkout bench-os-phase-0 && git checkout -b bench-os-phase-1
```

- [ ] **Step 2: Baseline**

Run: `npm run check && npm run e2e`
Expected: green (server 88 % / web 85 % statements; 80 e2e specs). If not, stop and report.

- [ ] **Step 3: Commit the plan**

```bash
npm run format
git add docs/changes/bench-os/PLAN-phase-1.md
git commit -m "docs: add the phase 1 plan"
```

---

### Task 1: One switch for `.env`, a validated vault path, tidier config tests

**Files:**

- Modify: `server/src/config.ts`, `server/test/config.test.ts`, `e2e/fixtures.ts`
- Create: `server/src/vault/locate.ts`, `server/test/vault/locate.test.ts`

**Interfaces:**

- Produces: `loadConfig(root)` skips `.env` when `process.env.BENCH_DOTENV === "off"`. `locateVault(config, sampleDir): { dir: string; source: "configured" | "sample"; missing?: string }`. `e2e/fixtures.ts` exports nothing new but passes `BENCH_DOTENV: "off"` and `VAULT_DIR` (a per-worker copy of the fixture, created in Task 2 - until then an empty temp directory) to every server.

- [ ] **Step 1: Failing tests for the switch and the temp-root cleanup**

Rewrite `server/test/config.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { configFrom, describeSources, loadConfig } from "../src/config.js";

let root: string | undefined;

/** A fresh directory per test; afterEach removes it whatever the assertions did. */
function tempRoot(): string {
  root = mkdtempSync(path.join(tmpdir(), "bench-config-"));
  return root;
}

afterEach(() => {
  delete process.env.VAULT_DIR;
  delete process.env.BENCH_DOTENV;
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("configFrom", () => {
  it("reads the vault path", () => {
    expect(configFrom({ VAULT_DIR: "/v" }).vaultDir).toBe("/v");
  });

  it("treats a missing or blank value as unset", () => {
    expect(configFrom({}).vaultDir).toBeUndefined();
    expect(configFrom({ VAULT_DIR: "   " }).vaultDir).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("reads .env from the root when it exists", () => {
    const dir = tempRoot();
    writeFileSync(path.join(dir, ".env"), "VAULT_DIR=/from-file\n");
    delete process.env.VAULT_DIR;
    expect(loadConfig(dir).vaultDir).toBe("/from-file");
  });

  it("copes without a .env", () => {
    delete process.env.VAULT_DIR;
    expect(loadConfig(tempRoot()).vaultDir).toBeUndefined();
  });

  it("leaves .env unread when BENCH_DOTENV is off", () => {
    const dir = tempRoot();
    writeFileSync(path.join(dir, ".env"), "VAULT_DIR=/from-file\n");
    delete process.env.VAULT_DIR;
    process.env.BENCH_DOTENV = "off";
    expect(loadConfig(dir).vaultDir).toBeUndefined();
  });
});

describe("describeSources", () => {
  it("names the vault and says when it is not configured", () => {
    expect(describeSources(configFrom({ VAULT_DIR: "/v" }))).toEqual([
      "Vault: /v",
    ]);
    expect(describeSources(configFrom({}))).toEqual(["Vault: not configured"]);
  });
});
```

Create `server/test/vault/locate.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { locateVault } from "../../src/vault/locate.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("locateVault", () => {
  it("uses the configured directory when it exists", () => {
    dir = mkdtempSync(path.join(tmpdir(), "bench-vault-"));
    expect(locateVault({ vaultDir: dir }, "/sample")).toEqual({
      dir,
      source: "configured",
    });
  });

  it("falls back to the sample when nothing is configured", () => {
    expect(locateVault({}, "/sample")).toEqual({
      dir: "/sample",
      source: "sample",
    });
  });

  it("falls back to the sample and names a configured path that does not exist", () => {
    const gone = path.join(tmpdir(), "bench-vault-does-not-exist");
    expect(locateVault({ vaultDir: gone }, "/sample")).toEqual({
      dir: "/sample",
      source: "sample",
      missing: gone,
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npx vitest run test/config.test.ts test/vault/locate.test.ts`
Expected: FAIL - the `BENCH_DOTENV` test reads the file anyway; `../../src/vault/locate.js` does not exist.

- [ ] **Step 3: The switch**

In `server/src/config.ts` replace `loadConfig` and its docstring with:

```ts
/**
 * Read `<root>/.env` into the environment if it exists, then build the config from it. A
 * variable already in the environment wins over the file - process.loadEnvFile never overrides
 * one. BENCH_DOTENV=off skips the file altogether, which is how the e2e servers stay clear of a
 * developer's real .env whatever keys it gains later.
 */
export function loadConfig(root: string): Config {
  const file = path.join(root, ".env");
  if (process.env.BENCH_DOTENV !== "off" && existsSync(file))
    process.loadEnvFile(file);
  return configFrom(process.env);
}
```

- [ ] **Step 4: The locator**

Create `server/src/vault/locate.ts`:

```ts
import { existsSync } from "node:fs";
import type { Config } from "../config.js";

export interface VaultLocation {
  dir: string;
  source: "configured" | "sample";
  /** The configured path, when it was set but is not there - so the log can say so. */
  missing?: string;
}

/** The vault to index: the configured directory if it exists, otherwise the bundled sample. */
export function locateVault(config: Config, sampleDir: string): VaultLocation {
  const configured = config.vaultDir;
  if (configured === undefined) return { dir: sampleDir, source: "sample" };
  if (existsSync(configured)) return { dir: configured, source: "configured" };
  return { dir: sampleDir, source: "sample", missing: configured };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd server && npx vitest run test/config.test.ts test/vault/locate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: The fixture passes the switch and a vault of its own**

In `e2e/fixtures.ts`, add `import { cpSync, mkdirSync } from "node:fs";` (merge with the existing `rmSync` import) and, inside the fixture after `rmSync(...)`, create the worker's vault:

```ts
// Each worker indexes its own copy of the fixture vault, so a spec that adds a note never
// shows up in another worker's tree. Until Task 2 ships the fixture, the copy is empty.
const vaultDir = path.join(root, dataDir, "vault");
mkdirSync(vaultDir, { recursive: true });
const fixture = path.join(root, "server", "src", "vault", "fixture");
if (existsSync(fixture)) cpSync(fixture, vaultDir, { recursive: true });
```

(add `existsSync` to the import). Replace the `VAULT_DIR: ""` line and its comment in the spawn `env` with:

```ts
          // BENCH_DOTENV=off keeps a developer's .env out of every e2e server whatever keys it
          // gains; VAULT_DIR then points at this worker's own copy of the fixture vault.
          BENCH_DOTENV: "off",
          VAULT_DIR: vaultDir,
```

- [ ] **Step 7: Gate and commit**

Run: `npm run format && npm run check && npm run e2e`
Expected: green (the e2e servers still start; nothing reads `VAULT_DIR` yet).

```bash
git add -A
git commit -m "feat: one switch to skip .env, a validated vault path and per-worker vault copies"
```

---

### Task 2: The fixture vault and the index schema

**Files:**

- Create: `server/src/vault/fixture/**` (below), `server/src/vault/db.ts`, `server/test/vault/db.test.ts`, `server/test/vault/fixture.ts`

**Interfaces:**

- Produces: `openDb(dbPath): Database.Database` with the tables `notes`, `links`, `tags`, `tasks` and the FTS5 table `notes_fts`; row types `NoteRow`, `LinkRow`, `TagRow`, `TaskRow`; the test helper `copyFixture(): string` (a temp copy of the fixture vault; callers remove it) and `FIXTURE_DIR`.
- The fixture is what every e2e worker indexes and what Bench shows when `VAULT_DIR` is unset. Its contents are asserted by later tests, so change them only together with those tests.

- [ ] **Step 1: Write the fixture vault**

Create these files under `server/src/vault/fixture/` exactly (synthetic; no real people, addresses or figures):

`00_Index/Start.md`

```markdown
---
tags: [moc, index]
updated: 2026-08-01
---

# Start

Der Einstieg in diesen Beispiel-Vault. Von hier aus ist alles verlinkt.

- [[Cockpit]] - offene Aufgaben
- [[Persona]] - wer hier arbeitet
- [[30_Projekte/Leuchtturm/Leuchtturm|Projekt Leuchtturm]] - das laufende Projekt
- [[Stack#Datenbank|Datenbank-Stack]] - ein Link auf eine Überschrift
- [[Nicht vorhanden]] - ein Link ins Leere, absichtlich

> [!tip] Hinweis
> Callouts sehen in Obsidian so aus. Bench zeigt sie als Zitat mit fettem Titel.
```

`00_Index/Cockpit.md`

````markdown
---
tags: [moc, cockpit, tasks]
updated: 2026-08-01
---

# Cockpit

Zieht offene Aufgaben aus dem ganzen Vault.

## Überfällig

```tasks
not done
due before today
```
````

## Aufgaben hier

- [ ] Beispiel-Vault durchsehen 🔼 📅 2026-08-15
- [x] Ordnerstruktur anlegen ✅ 2026-07-30

````

`10_Profile/Persona.md`
```markdown
---
tags: [profile]
updated: 2026-07-20
---

# Persona

Kurz und direkt. Zahlen zuerst, dann Kontext. Siehe auch [[Lessons]].
````

`20_Brands/Nordlicht.md`

```markdown
---
tags: [brand/nordlicht, status/active]
domain: nordlicht.example.com
updated: 2026-07-28
---

# Nordlicht

Beispielmarke. Alle Projekte stehen im [[_Projekt_Index|Projekt-Index]].

Skizze der Marke:

![Skizze](../assets/skizze.svg)
```

`30_Projekte/_Projekt_Index.md`

```markdown
---
tags: [moc, projects]
updated: 2026-07-28
---

# Projekt-Index

| Projekt        | Status     |
| -------------- | ---------- |
| [[Leuchtturm]] | aktiv      |
| [[Alt]]        | archiviert |
```

`30_Projekte/Leuchtturm/Leuchtturm.md`

````markdown
---
tags: [project, brand/nordlicht, status/active]
path: ~/Projekte/leuchtturm
updated: 2026-08-01
---

# Leuchtturm

Ein Beispielprojekt mit allem, was der Parser können muss.

## Aufgaben

- [ ] Spezifikation schreiben 🔺 📅 2026-08-20
- [ ] Prototyp bauen ⏫ ⏳ 2026-08-18 🛫 2026-08-10 📅 2026-08-25
- [ ] Wöchentlich Stand melden 🔁 every week 📅 2026-08-08
- [ ] Ohne Datum und ohne Priorität
- [x] Kickoff halten ✅ 2026-08-02
- [ ] Rückfrage klären (aus [[2026-08-01 Call Hafen]]) 🔽

## Notizen

Siehe [[Stack]] und [[Persona|die Persona]]. Die Lektionen stehen in [[Lessons#Reviews]].

```js
// [[Kein Link]] - ein Code-Block wird nicht als Link gelesen
const x = "- [ ] auch keine Aufgabe";
```
````

````

`30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md`
```markdown
---
tags: [call, brand/nordlicht]
date: 2026-08-01
teilnehmer: [Anna Beispiel, Ben Muster]
quelle: call-2026-08-01.pdf
---

# Call Hafen

Besprochen wurde das Hafenkonzept für [[Leuchtturm]]. Entscheidungen:

- Farbwelt bleibt Blau und Sand
- Prototyp bis Ende August

> [!warning]
> Zahlen im Transkript noch prüfen.
````

`40_Tech_Stack/Stack.md`

```markdown
---
tags: [tech-stack]
updated: 2026-07-15
---

# Stack

## Frontend

React und Vite.

## Datenbank

SQLite lokal, Postgres im Betrieb. Verwendet von [[Leuchtturm]].
```

`50_Workflow/Testing.md`

```markdown
---
tags: [workflow]
updated: 2026-07-15
---

# Testing

- [ ] Diese Aufgabe liegt in 50_Workflow und gehört nicht ins Cockpit
```

`60_Knowledge/Lessons.md`

```markdown
---
tags: [knowledge]
updated: 2026-07-30
---

# Lessons

## Reviews

Jeden Befund mit Zeile belegen. Verlinkt aus [[Leuchtturm]] und [[Persona]].
```

`Templates/Neues-Projekt.md`

```markdown
---
tags: [project, status/active]
---

# Neues Projekt

- [ ] Erste Aufgabe
```

`90_Archive/Alt.md`

```markdown
---
tags: [project, status/archived]
updated: 2026-05-01
---

# Alt

Abgeschlossen. Nichts mehr zu tun.
```

`assets/skizze.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#ff5c00"/><text x="10" y="26" font-family="sans-serif" font-size="16" fill="#000">Skizze</text></svg>
```

`.obsidian/app.json`

```json
{ "readableLineLength": true }
```

`.obsidian/Ignored.md`

```markdown
# Must never be indexed
```

Twelve notes, one attachment, one hidden folder that the scanner must skip. Check `git status` shows `.obsidian/` as tracked here - `.gitignore` has no rule for it, and this copy is fixture data, not configuration.

- [ ] **Step 2: Failing schema test**

Create `server/test/vault/fixture.ts`:

```ts
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/vault/fixture",
);

/** A private copy of the fixture vault, so a test that writes into it disturbs nobody. */
export function copyFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-vault-"));
  cpSync(FIXTURE_DIR, dir, { recursive: true });
  return dir;
}
```

Create `server/test/vault/db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openDb } from "../../src/vault/db.js";

interface Name {
  name: string;
}

describe("vault db", () => {
  it("creates the index tables and the full-text table", () => {
    const db = openDb(":memory:");
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name",
      )
      .all() as Name[];
    const tables = names.map((n) => n.name);
    for (const t of ["notes", "links", "tags", "tasks", "notes_fts"])
      expect(tables).toContain(t);
  });

  it("removes a note's links, tags and tasks with the note", () => {
    const db = openDb(":memory:");
    db.prepare(
      "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("a.md", "a", "", "{}", "", 0, 0);
    db.prepare("INSERT INTO links (from_path, target) VALUES (?, ?)").run(
      "a.md",
      "b",
    );
    db.prepare("INSERT INTO tags (path, tag) VALUES (?, ?)").run("a.md", "x");
    db.prepare(
      "INSERT INTO tasks (path, line, raw, text, done) VALUES (?, ?, ?, ?, ?)",
    ).run("a.md", 1, "- [ ] t", "t", 0);
    db.prepare("DELETE FROM notes WHERE path = ?").run("a.md");
    expect(db.prepare("SELECT COUNT(*) AS c FROM links").get()).toEqual({
      c: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS c FROM tags").get()).toEqual({
      c: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS c FROM tasks").get()).toEqual({
      c: 0,
    });
  });
});
```

Run: `cd server && npx vitest run test/vault/db.test.ts`
Expected: FAIL - `../../src/vault/db.js` does not exist.

- [ ] **Step 3: The schema**

Create `server/src/vault/db.ts`:

```ts
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The index of one Obsidian vault. Every row here is derived from the markdown files and can be
 * rebuilt from them; the vault itself is never written by this app. Paths are vault-relative,
 * posix-separated, with the .md extension.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder TEXT NOT NULL,
  frontmatter TEXT NOT NULL DEFAULT '{}',
  body TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);

CREATE TABLE IF NOT EXISTS links (
  from_path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  target TEXT NOT NULL,
  heading TEXT,
  alias TEXT,
  embed INTEGER NOT NULL DEFAULT 0,
  to_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_path);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_path);

CREATE TABLE IF NOT EXISTS tags (
  path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  tag TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS tasks (
  path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  line INTEGER NOT NULL,
  raw TEXT NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL,
  due TEXT,
  scheduled TEXT,
  start TEXT,
  priority TEXT,
  recurrence TEXT,
  done_at TEXT,
  PRIMARY KEY (path, line)
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;

export interface NoteRow {
  path: string;
  title: string;
  folder: string;
  frontmatter: string;
  body: string;
  mtime: number;
  size: number;
}

export interface LinkRow {
  from_path: string;
  target: string;
  heading: string | null;
  alias: string | null;
  embed: number;
  to_path: string | null;
}

export interface TagRow {
  path: string;
  tag: string;
}

export interface TaskRow {
  path: string;
  line: number;
  raw: string;
  text: string;
  done: number;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  priority: string | null;
  recurrence: string | null;
  done_at: string | null;
}

/** Open (creating if needed) the index database and ensure the schema exists. */
export function openDb(dbPath: string): Database.Database {
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
```

- [ ] **Step 4: Run, gate, commit**

Run: `cd server && npx vitest run test/vault/db.test.ts`
Expected: PASS. (`FIXTURE_DIR`/`copyFixture` are unused until Task 4; knip treats `server/test/**/*.test.ts` as entries and `fixture.ts` is imported by nothing yet - so add a one-line test now that keeps knip quiet and proves the copy works: in `db.test.ts` add

```ts
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { copyFixture } from "./fixture.js";

describe("fixture vault", () => {
  it("copies the twelve notes and skips nothing", () => {
    const dir = copyFixture();
    expect(existsSync(path.join(dir, "00_Index", "Start.md"))).toBe(true);
    expect(existsSync(path.join(dir, ".obsidian", "Ignored.md"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
```

and run the file again.)

Run: `npm run format && npm run check`
Expected: green; check-secrets is quiet (no emails or phone shapes in the fixture; `nordlicht.example.com` is a reserved domain).

```bash
git add -A
git commit -m "feat: the vault index schema and a synthetic fixture vault"
```

---

### Task 3: The parsers - frontmatter, wikilinks, tasks

**Files:**

- Create: `server/src/vault/index/frontmatter.ts`, `server/src/vault/index/wikilinks.ts`, `server/src/vault/index/tasks.ts`
- Test: `server/test/vault/frontmatter.test.ts`, `server/test/vault/wikilinks.test.ts`, `server/test/vault/tasks.test.ts`

**Interfaces:**

- Produces (all pure):
  - `splitNote(text): { frontmatter: Record<string, unknown>; body: string }`, `titleOf(relPath): string`, `tagsOf(frontmatter): string[]`
  - `stripCodeBlocks(body): string` (fenced blocks replaced by blank lines, line count preserved), `extractWikilinks(body): Wikilink[]` with `Wikilink = { target: string; heading: string | null; alias: string | null; embed: boolean }`
  - `parseTaskLine(line): ParsedTask | null` and `extractTasks(body): (ParsedTask & { line: number })[]` with `ParsedTask = { raw, text, done: boolean, due, scheduled, start, priority, recurrence, doneAt }` (`priority` one of `highest|high|medium|low|lowest|null`).

- [ ] **Step 1: Failing tests**

`server/test/vault/frontmatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  splitNote,
  tagsOf,
  titleOf,
} from "../../src/vault/index/frontmatter.js";

describe("splitNote", () => {
  it("separates YAML frontmatter from the body", () => {
    const { frontmatter, body } = splitNote(
      "---\ntags: [a, b]\nupdated: 2026-08-01\n---\n\n# Hi\n",
    );
    expect(frontmatter.tags).toEqual(["a", "b"]);
    expect(String(frontmatter.updated)).toMatch(/^2026-08-01/);
    expect(body.trim()).toBe("# Hi");
  });

  it("returns an empty frontmatter when there is none", () => {
    expect(splitNote("# Only body\n")).toEqual({
      frontmatter: {},
      body: "# Only body\n",
    });
  });
});

describe("titleOf", () => {
  it("is the file name without folders or extension", () => {
    expect(
      titleOf("30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md"),
    ).toBe("2026-08-01 Call Hafen");
  });
});

describe("tagsOf", () => {
  it("accepts a list, a string, and nothing", () => {
    expect(tagsOf({ tags: ["a", "#b", 3] })).toEqual(["a", "b"]);
    expect(tagsOf({ tags: "solo" })).toEqual(["solo"]);
    expect(tagsOf({})).toEqual([]);
  });
});
```

`server/test/vault/wikilinks.test.ts`:

````ts
import { describe, expect, it } from "vitest";
import {
  extractWikilinks,
  stripCodeBlocks,
} from "../../src/vault/index/wikilinks.js";

describe("extractWikilinks", () => {
  it("reads target, heading and alias in every combination", () => {
    expect(
      extractWikilinks("[[A]] [[B|b]] [[C#H]] [[D#H|d]] ![[e.png]]"),
    ).toEqual([
      { target: "A", heading: null, alias: null, embed: false },
      { target: "B", heading: null, alias: "b", embed: false },
      { target: "C", heading: "H", alias: null, embed: false },
      { target: "D", heading: "H", alias: "d", embed: false },
      { target: "e.png", heading: null, alias: null, embed: true },
    ]);
  });

  it("ignores links inside fenced code blocks and inline code", () => {
    const body = "Real [[A]]\n```js\n[[NotOne]]\n```\nand `[[NotEither]]` here";
    expect(extractWikilinks(body).map((l) => l.target)).toEqual(["A"]);
  });
});

describe("stripCodeBlocks", () => {
  it("keeps the line count so line numbers stay true", () => {
    const body = "a\n```\nb\nc\n```\nd";
    expect(stripCodeBlocks(body).split("\n")).toEqual([
      "a",
      "",
      "",
      "",
      "",
      "d",
    ]);
  });
});
````

`server/test/vault/tasks.test.ts`:

````ts
import { describe, expect, it } from "vitest";
import { extractTasks, parseTaskLine } from "../../src/vault/index/tasks.js";

describe("parseTaskLine", () => {
  it("reads every emoji field", () => {
    expect(
      parseTaskLine(
        "- [ ] Prototyp bauen ⏫ ⏳ 2026-08-18 🛫 2026-08-10 📅 2026-08-25 🔁 every week",
      ),
    ).toEqual({
      raw: "- [ ] Prototyp bauen ⏫ ⏳ 2026-08-18 🛫 2026-08-10 📅 2026-08-25 🔁 every week",
      text: "Prototyp bauen",
      done: false,
      due: "2026-08-25",
      scheduled: "2026-08-18",
      start: "2026-08-10",
      priority: "high",
      recurrence: "every week",
      doneAt: null,
    });
  });

  it("reads a done task with its completion date", () => {
    const t = parseTaskLine("  - [x] Kickoff halten ✅ 2026-08-02")!;
    expect(t.done).toBe(true);
    expect(t.doneAt).toBe("2026-08-02");
    expect(t.text).toBe("Kickoff halten");
  });

  it("maps all five priorities", () => {
    const p = (s: string) => parseTaskLine(`- [ ] x ${s}`)!.priority;
    expect([p("🔺"), p("⏫"), p("🔼"), p("🔽"), p("⏬")]).toEqual([
      "highest",
      "high",
      "medium",
      "low",
      "lowest",
    ]);
    expect(parseTaskLine("- [ ] x")!.priority).toBeNull();
  });

  it("keeps wikilinks and parentheses in the text", () => {
    expect(
      parseTaskLine("- [ ] Rückfrage klären (aus [[Call]]) 🔽")!.text,
    ).toBe("Rückfrage klären (aus [[Call]])");
  });

  it("returns null for anything that is not a task line", () => {
    expect(parseTaskLine("- not a task")).toBeNull();
    expect(parseTaskLine("[ ] no bullet")).toBeNull();
    expect(parseTaskLine("- [?] odd state")).toBeNull();
  });
});

describe("extractTasks", () => {
  it("numbers lines from 1 and skips fenced code", () => {
    const body =
      "intro\n- [ ] one\n```\n- [ ] not\n```\n- [x] two ✅ 2026-01-02";
    expect(extractTasks(body).map((t) => [t.line, t.text, t.done])).toEqual([
      [2, "one", false],
      [6, "two", true],
    ]);
  });
});
````

Run: `cd server && npx vitest run test/vault/frontmatter.test.ts test/vault/wikilinks.test.ts test/vault/tasks.test.ts`
Expected: FAIL - modules missing.

- [ ] **Step 2: Install gray-matter and write the parsers**

`npm install gray-matter -w server` (then `npm test -w server` once to confirm vitest still starts; apply the native-binding remedy if not).

`server/src/vault/index/frontmatter.ts`:

```ts
import matter from "gray-matter";
import path from "node:path";

export interface SplitNote {
  frontmatter: Record<string, unknown>;
  body: string;
}

/** YAML frontmatter and the markdown after it. A note without frontmatter is all body. */
export function splitNote(text: string): SplitNote {
  const parsed = matter(text);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content,
  };
}

/** Obsidian names a note after its file, not after any frontmatter. */
export function titleOf(relPath: string): string {
  return path.posix.basename(relPath, ".md");
}

/** `tags:` as a list or a single string; a leading # is Obsidian's own optional prefix. */
export function tagsOf(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags;
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return list
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
}
```

`server/src/vault/index/wikilinks.ts`:

````ts
export interface Wikilink {
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
}

const FENCE = /^(```|~~~)/;

/**
 * Blank out fenced code blocks line by line, so what follows can read links and tasks without
 * seeing examples inside code - and line numbers stay those of the original file.
 */
export function stripCodeBlocks(body: string): string {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (FENCE.test(line.trim())) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

const INLINE_CODE = /`[^`\n]*`/g;
const LINK = /(!?)\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g;

/** Every [[link]] in the prose, in document order; code is not prose. */
export function extractWikilinks(body: string): Wikilink[] {
  const prose = stripCodeBlocks(body).replace(INLINE_CODE, "");
  return [...prose.matchAll(LINK)].map((m) => ({
    target: m[2].trim(),
    heading: m[3]?.trim() || null,
    alias: m[4]?.trim() || null,
    embed: m[1] === "!",
  }));
}
````

`server/src/vault/index/tasks.ts`:

```ts
import { stripCodeBlocks } from "./wikilinks.js";

export type Priority = "highest" | "high" | "medium" | "low" | "lowest";

export interface ParsedTask {
  raw: string;
  text: string;
  done: boolean;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  priority: Priority | null;
  recurrence: string | null;
  doneAt: string | null;
}

const TASK = /^\s*[-*+] \[( |x|X)\] (.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const FIELDS: { key: keyof ParsedTask; re: RegExp }[] = [
  { key: "due", re: new RegExp(`\\s*📅\\s*${DATE}`) },
  { key: "scheduled", re: new RegExp(`\\s*⏳\\s*${DATE}`) },
  { key: "start", re: new RegExp(`\\s*🛫\\s*${DATE}`) },
  { key: "doneAt", re: new RegExp(`\\s*✅\\s*${DATE}`) },
];
const PRIORITIES: [string, Priority][] = [
  ["🔺", "highest"],
  ["⏫", "high"],
  ["🔼", "medium"],
  ["🔽", "low"],
  ["⏬", "lowest"],
];
/** Recurrence runs to the next emoji field or the end of the line. */
const RECURRENCE = /\s*🔁\s*([^📅⏳🛫✅🔺⏫🔼🔽⏬]+)/;

/** One line in the Tasks-plugin grammar, or null when the line is not a task at all. */
export function parseTaskLine(line: string): ParsedTask | null {
  const m = TASK.exec(line);
  if (!m) return null;
  const fields = {
    due: null,
    scheduled: null,
    start: null,
    doneAt: null,
  } as Record<"due" | "scheduled" | "start" | "doneAt", string | null>;
  let rest = m[2];
  for (const { key, re } of FIELDS) {
    const hit = re.exec(rest);
    if (hit) {
      fields[key as keyof typeof fields] = hit[1];
      rest = rest.replace(hit[0], "");
    }
  }
  const rec = RECURRENCE.exec(rest);
  const recurrence = rec ? rec[1].trim() : null;
  if (rec) rest = rest.replace(rec[0], "");
  const prio = PRIORITIES.find(([emoji]) => rest.includes(emoji));
  if (prio) rest = rest.replace(prio[0], "");
  return {
    raw: line,
    text: rest.replace(/\s+/g, " ").trim(),
    done: m[1] !== " ",
    ...fields,
    priority: prio ? prio[1] : null,
    recurrence,
  };
}

/** Every task in the prose, with its 1-based line number in the original body. */
export function extractTasks(body: string): (ParsedTask & { line: number })[] {
  return stripCodeBlocks(body)
    .split("\n")
    .flatMap((line, i) => {
      const task = parseTaskLine(line);
      return task ? [{ ...task, line: i + 1 }] : [];
    });
}
```

- [ ] **Step 3: Run the three files**

Run: `cd server && npx vitest run test/vault/frontmatter.test.ts test/vault/wikilinks.test.ts test/vault/tasks.test.ts`
Expected: PASS. If ESLint later objects to the `as Record<...>` in `parseTaskLine`, replace it with a typed `const fields: Record<"due" | "scheduled" | "start" | "doneAt", string | null> = { … }` and `fields[key as keyof typeof fields] = hit[1]` - keep the behaviour, satisfy the rule.

- [ ] **Step 4: Gate and commit**

Run: `npm run format && npm run check`
Expected: green (knip: every export above is used by a test).

```bash
git add -A
git commit -m "feat: parsers for frontmatter, wikilinks and the Tasks-plugin grammar"
```

---

### Task 4: Scan, index, resolve

**Files:**

- Create: `server/src/vault/index/scan.ts`, `server/src/vault/index/indexer.ts`
- Test: `server/test/vault/indexer.test.ts`

**Interfaces:**

- Produces: `listNotes(vaultDir): string[]` (sorted vault-relative posix paths of every `.md` outside ignored dirs), `isNotePath(relPath): boolean`; `indexNote(db, vaultDir, relPath)`, `removeNote(db, relPath)`, `resolveLinks(db)`, `indexAll(db, vaultDir): IndexSummary` with `IndexSummary = { notes: number; links: number; tasks: number }`.
- Links are stored with `to_path` NULL by `indexNote`; `resolveLinks` fills it for every link once all notes are known. Task 5's watcher calls `indexNote`/`removeNote` and then `resolveLinks`.

- [ ] **Step 1: Failing tests**

`server/test/vault/indexer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb, type LinkRow, type TaskRow } from "../../src/vault/db.js";
import {
  indexAll,
  indexNote,
  removeNote,
  resolveLinks,
} from "../../src/vault/index/indexer.js";
import { isNotePath, listNotes } from "../../src/vault/index/scan.js";
import { copyFixture } from "./fixture.js";

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = copyFixture();
  db = openDb(":memory:");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

describe("listNotes", () => {
  it("finds the twelve notes and skips dot-folders", () => {
    const notes = listNotes(dir);
    expect(notes).toHaveLength(12);
    expect(notes[0]).toBe("00_Index/Cockpit.md");
    expect(notes).toContain(
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    );
    expect(notes.some((n) => n.startsWith(".obsidian"))).toBe(false);
  });

  it("knows which relative paths belong in the index", () => {
    expect(isNotePath("a/b.md")).toBe(true);
    expect(isNotePath(".obsidian/x.md")).toBe(false);
    expect(isNotePath("a/.trash/x.md")).toBe(false);
    expect(isNotePath("assets/skizze.svg")).toBe(false);
  });
});

describe("indexAll", () => {
  it("indexes every note with its folder, tags, links and tasks", () => {
    const summary = indexAll(db, dir);
    expect(summary.notes).toBe(12);
    expect(count("notes")).toBe(12);
    expect(count("notes_fts")).toBe(12);
    const start = db
      .prepare("SELECT folder, title FROM notes WHERE path = ?")
      .get("00_Index/Start.md");
    expect(start).toEqual({ folder: "00_Index", title: "Start" });
    const tags = db
      .prepare("SELECT tag FROM tags WHERE path = ? ORDER BY tag")
      .all("20_Brands/Nordlicht.md") as { tag: string }[];
    expect(tags.map((t) => t.tag)).toEqual([
      "brand/nordlicht",
      "status/active",
    ]);
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE path = ? ORDER BY line")
      .all("30_Projekte/Leuchtturm/Leuchtturm.md") as TaskRow[];
    expect(tasks).toHaveLength(6);
    expect(tasks[1]).toMatchObject({
      text: "Prototyp bauen",
      priority: "high",
      due: "2026-08-25",
      scheduled: "2026-08-18",
      start: "2026-08-10",
    });
    expect(tasks[4]).toMatchObject({ done: 1, done_at: "2026-08-02" });
  });

  it("resolves links by path, by basename and by heading, and leaves dangling ones null", () => {
    indexAll(db, dir);
    const links = db
      .prepare("SELECT * FROM links WHERE from_path = ? ORDER BY rowid")
      .all("00_Index/Start.md") as LinkRow[];
    expect(links.map((l) => [l.target, l.heading, l.alias, l.to_path])).toEqual(
      [
        ["Cockpit", null, null, "00_Index/Cockpit.md"],
        ["Persona", null, null, "10_Profile/Persona.md"],
        [
          "30_Projekte/Leuchtturm/Leuchtturm",
          null,
          "Projekt Leuchtturm",
          "30_Projekte/Leuchtturm/Leuchtturm.md",
        ],
        ["Stack", "Datenbank", "Datenbank-Stack", "40_Tech_Stack/Stack.md"],
        ["Nicht vorhanden", null, null, null],
      ],
    );
  });

  it("finds backlinks through to_path", () => {
    indexAll(db, dir);
    const back = db
      .prepare(
        "SELECT DISTINCT from_path FROM links WHERE to_path = ? ORDER BY from_path",
      )
      .all("30_Projekte/Leuchtturm/Leuchtturm.md") as { from_path: string }[];
    expect(back.map((b) => b.from_path)).toEqual([
      "00_Index/Start.md",
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
      "30_Projekte/_Projekt_Index.md",
      "40_Tech_Stack/Stack.md",
      "60_Knowledge/Lessons.md",
    ]);
  });

  it("drops notes whose files are gone and re-indexes changed ones", () => {
    indexAll(db, dir);
    unlinkSync(path.join(dir, "90_Archive", "Alt.md"));
    writeFileSync(
      path.join(dir, "10_Profile", "Persona.md"),
      "# Persona\n\nNeu geschrieben, ohne Link.\n",
    );
    const summary = indexAll(db, dir);
    expect(summary.notes).toBe(11);
    expect(
      db
        .prepare("SELECT COUNT(*) AS c FROM notes WHERE path = ?")
        .get("90_Archive/Alt.md"),
    ).toEqual({ c: 0 });
    expect(
      db
        .prepare("SELECT body FROM notes WHERE path = ?")
        .get("10_Profile/Persona.md"),
    ).toEqual({ body: "# Persona\n\nNeu geschrieben, ohne Link.\n" });
    expect(
      db
        .prepare("SELECT COUNT(*) AS c FROM links WHERE from_path = ?")
        .get("10_Profile/Persona.md"),
    ).toEqual({ c: 0 });
  });

  it("makes the full text searchable, diacritics included", () => {
    indexAll(db, dir);
    const hits = db
      .prepare("SELECT path FROM notes_fts WHERE notes_fts MATCH ?")
      .all('"hafenkonzept"') as { path: string }[];
    expect(hits.map((h) => h.path)).toEqual([
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    ]);
  });
});

describe("indexNote and removeNote", () => {
  it("index one file, then remove it, and links re-resolve each time", () => {
    indexAll(db, dir);
    writeFileSync(path.join(dir, "Nicht vorhanden.md"), "# Jetzt vorhanden\n");
    indexNote(db, dir, "Nicht vorhanden.md");
    resolveLinks(db);
    expect(
      db
        .prepare("SELECT to_path FROM links WHERE target = ?")
        .get("Nicht vorhanden"),
    ).toEqual({ to_path: "Nicht vorhanden.md" });
    removeNote(db, "Nicht vorhanden.md");
    resolveLinks(db);
    expect(
      db
        .prepare("SELECT to_path FROM links WHERE target = ?")
        .get("Nicht vorhanden"),
    ).toEqual({ to_path: null });
    expect(count("notes_fts")).toBe(12);
  });
});
```

Run: `cd server && npx vitest run test/vault/indexer.test.ts`
Expected: FAIL - modules missing.

- [ ] **Step 2: The scanner**

`server/src/vault/index/scan.ts`:

```ts
import { readdirSync } from "node:fs";
import path from "node:path";

/** Obsidian's own folders and anything else hidden are not notes, whatever they contain. */
function skipped(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

function walk(dir: string, rel: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skipped(entry.name)) return [];
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return walk(path.join(dir, entry.name), relPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [relPath] : [];
  });
}

/** Every note under the vault as a vault-relative posix path, sorted. */
export function listNotes(vaultDir: string): string[] {
  return walk(vaultDir, "").sort();
}

/** Whether a vault-relative path is a note the index should hold. */
export function isNotePath(relPath: string): boolean {
  const parts = relPath.split("/");
  return relPath.endsWith(".md") && !parts.slice(0, -1).some(skipped);
}
```

- [ ] **Step 3: The indexer**

`server/src/vault/index/indexer.ts`:

```ts
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { splitNote, tagsOf, titleOf } from "./frontmatter.js";
import { listNotes } from "./scan.js";
import { extractTasks } from "./tasks.js";
import { extractWikilinks } from "./wikilinks.js";

export interface IndexSummary {
  notes: number;
  links: number;
  tasks: number;
}

/**
 * Parse one file and replace everything the index holds about it. Links go in unresolved;
 * resolveLinks fills to_path once every note is known, because a link can point at a note
 * that is indexed later - or not at all.
 */
export function indexNote(
  db: Database.Database,
  vaultDir: string,
  relPath: string,
): void {
  const file = path.join(vaultDir, relPath);
  const text = readFileSync(file, "utf8");
  const stat = statSync(file);
  const { frontmatter, body } = splitNote(text);
  const dirname = path.posix.dirname(relPath);
  const folder = dirname === "." ? "" : dirname;
  const write = db.transaction(() => {
    db.prepare("DELETE FROM notes WHERE path = ?").run(relPath);
    db.prepare("DELETE FROM notes_fts WHERE path = ?").run(relPath);
    db.prepare(
      "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      relPath,
      titleOf(relPath),
      folder,
      JSON.stringify(frontmatter),
      body,
      Math.round(stat.mtimeMs),
      stat.size,
    );
    db.prepare(
      "INSERT INTO notes_fts (path, title, body) VALUES (?, ?, ?)",
    ).run(relPath, titleOf(relPath), body);
    const link = db.prepare(
      "INSERT INTO links (from_path, target, heading, alias, embed) VALUES (?, ?, ?, ?, ?)",
    );
    for (const l of extractWikilinks(body))
      link.run(relPath, l.target, l.heading, l.alias, l.embed ? 1 : 0);
    const tag = db.prepare("INSERT INTO tags (path, tag) VALUES (?, ?)");
    for (const t of tagsOf(frontmatter)) tag.run(relPath, t);
    const task = db.prepare(
      "INSERT INTO tasks (path, line, raw, text, done, due, scheduled, start, priority, recurrence, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const t of extractTasks(body))
      task.run(
        relPath,
        t.line,
        t.raw,
        t.text,
        t.done ? 1 : 0,
        t.due,
        t.scheduled,
        t.start,
        t.priority,
        t.recurrence,
        t.doneAt,
      );
  });
  write();
}

export function removeNote(db: Database.Database, relPath: string): void {
  db.prepare("DELETE FROM notes WHERE path = ?").run(relPath);
  db.prepare("DELETE FROM notes_fts WHERE path = ?").run(relPath);
}

interface PathRow {
  path: string;
}

interface LinkTarget {
  rowid: number;
  from_path: string;
  target: string;
}

/**
 * Obsidian resolves a link by the exact vault path when one is given, otherwise by the note's
 * name - case-insensitively, with .md optional. When two notes share a name, the one in the
 * linking note's own folder wins, as it does in Obsidian's "shortest path" mode.
 */
function resolveTarget(
  target: string,
  fromPath: string,
  byPath: Map<string, string>,
  byName: Map<string, string[]>,
): string | null {
  const key = target.replace(/\.md$/i, "").toLowerCase();
  const exact = byPath.get(`${key}.md`);
  if (exact) return exact;
  const candidates = byName.get(path.posix.basename(key)) ?? [];
  if (candidates.length === 0) return null;
  const folder = path.posix.dirname(fromPath);
  return (
    candidates.find((c) => path.posix.dirname(c) === folder) ?? candidates[0]
  );
}

/** Fill to_path for every link from the notes currently indexed. Cheap enough to run whole. */
export function resolveLinks(db: Database.Database): void {
  const notes = db.prepare("SELECT path FROM notes").all() as PathRow[];
  const byPath = new Map(notes.map((n) => [n.path.toLowerCase(), n.path]));
  const byName = new Map<string, string[]>();
  for (const n of notes) {
    const name = path.posix.basename(n.path, ".md").toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), n.path]);
  }
  const links = db
    .prepare("SELECT rowid, from_path, target FROM links")
    .all() as LinkTarget[];
  const update = db.prepare("UPDATE links SET to_path = ? WHERE rowid = ?");
  db.transaction(() => {
    for (const l of links)
      update.run(resolveTarget(l.target, l.from_path, byPath, byName), l.rowid);
  })();
}

/** Index every note under the vault, forget the ones whose files are gone, resolve the links. */
export function indexAll(
  db: Database.Database,
  vaultDir: string,
): IndexSummary {
  const present = listNotes(vaultDir);
  const known = (db.prepare("SELECT path FROM notes").all() as PathRow[]).map(
    (n) => n.path,
  );
  const gone = known.filter((p) => !present.includes(p));
  db.transaction(() => {
    for (const p of gone) removeNote(db, p);
    for (const p of present) indexNote(db, vaultDir, p);
  })();
  resolveLinks(db);
  const c = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
  return { notes: c("notes"), links: c("links"), tasks: c("tasks") };
}
```

If `indexNote` trips the `max-lines-per-function` (200) or `complexity` limits it will not - it is about 30 lines - but if ESLint's `sonarjs` rules flag the nested transaction, split the four `INSERT` loops into `writeLinks(db, relPath, body)`, `writeTags(...)`, `writeTasks(...)` helpers in the same file.

- [ ] **Step 4: Run, gate, commit**

Run: `cd server && npx vitest run test/vault/indexer.test.ts`
Expected: PASS (9 tests).

Run: `npm run format && npm run check`
Expected: green.

```bash
git add -A
git commit -m "feat: scan, index and resolve the links of a vault"
```

---

### Task 5: Watcher, API and wiring

**Files:**

- Create: `server/src/vault/watch.ts`, `server/src/vault/routes/index.ts`, `server/src/vault/routes/query.ts`, `server/src/vault/routes/notes.ts`, `server/src/vault/routes/search.ts`, `server/src/vault/routes/files.ts`, `server/test/vault/app.ts`, `server/test/vault/watch.test.ts`, `server/test/vault/routes.test.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts`, `server/test/space/app.ts`, `server/test/rolodex/app.ts`, `e2e/fixtures.ts`

**Interfaces:**

- Produces: `VaultContext = { db: Database.Database; dir: string; name: string }` (exported from `routes/index.ts`); `vaultRouter(ctx)` mounted at `/api/vault` with `GET /info`, `GET /tree`, `GET /note?path=`, `GET /search?q=`, `GET /file?path=`; `watchVault(db, vaultDir, onChange?): FSWatcher`; test helpers `appWithVault(ctx)` and `emptyVault()`.
- Response shapes (the web app's `types.ts` in Task 6 mirrors them):

```ts
interface Info {
  name: string;
  notes: number;
}
interface TreeEntry {
  path: string;
  title: string;
  folder: string;
}
interface NoteLink {
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
  toPath: string | null;
}
interface Backlink {
  path: string;
  title: string;
}
interface Note {
  path: string;
  title: string;
  folder: string;
  frontmatter: Record<string, unknown>;
  body: string;
  mtime: number;
  tags: string[];
  links: NoteLink[];
  backlinks: Backlink[];
}
interface SearchHit {
  path: string;
  title: string;
  folder: string;
  snippet: string;
}
```

- [ ] **Step 1: Failing tests**

`server/test/vault/app.ts`:

```ts
/** The whole Express app around one vault index; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { openDb as openSpaceDb } from "../../src/space/db.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { VaultContext } from "../../src/vault/routes/index.js";
import { FIXTURE_DIR } from "./fixture.js";

/** An empty index over the tracked fixture directory, for suites that only need the app to boot. */
export function emptyVault(): VaultContext {
  return { db: openVaultDb(":memory:"), dir: FIXTURE_DIR, name: "fixture" };
}

export function appWithVault(vault: VaultContext): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    space: openSpaceDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault,
  });
}
```

`server/test/vault/routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { rmSync } from "node:fs";
import type express from "express";
import { openDb } from "../../src/vault/db.js";
import { indexAll } from "../../src/vault/index/indexer.js";
import { appWithVault } from "./app.js";
import { copyFixture } from "./fixture.js";

interface TreeEntry {
  path: string;
  title: string;
  folder: string;
}
interface Note {
  path: string;
  title: string;
  folder: string;
  frontmatter: Record<string, unknown>;
  body: string;
  tags: string[];
  links: {
    target: string;
    toPath: string | null;
    alias: string | null;
    heading: string | null;
  }[];
  backlinks: { path: string; title: string }[];
}
interface SearchHit {
  path: string;
  title: string;
  snippet: string;
}

let dir: string;
let app: express.Express;

beforeEach(() => {
  dir = copyFixture();
  const db = openDb(":memory:");
  indexAll(db, dir);
  app = appWithVault({ db, dir, name: "fixture" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/vault/info and /tree", () => {
  it("names the vault and counts the notes", async () => {
    const res = await request(app).get("/api/vault/info");
    expect(res.body).toEqual({ name: "fixture", notes: 12 });
  });

  it("lists every note sorted by path with its folder", async () => {
    const tree = (await request(app).get("/api/vault/tree"))
      .body as TreeEntry[];
    expect(tree).toHaveLength(12);
    expect(tree[0]).toEqual({
      path: "00_Index/Cockpit.md",
      title: "Cockpit",
      folder: "00_Index",
    });
  });
});

describe("GET /api/vault/note", () => {
  it("returns frontmatter, body, tags, resolved links and backlinks", async () => {
    const res = await request(app)
      .get("/api/vault/note")
      .query({ path: "30_Projekte/Leuchtturm/Leuchtturm.md" });
    expect(res.status).toBe(200);
    const note = res.body as Note;
    expect(note.title).toBe("Leuchtturm");
    expect(note.tags).toEqual(["project", "brand/nordlicht", "status/active"]);
    expect(note.frontmatter.path).toBe("~/Projekte/leuchtturm");
    expect(note.body).toContain("## Aufgaben");
    expect(note.links.find((l) => l.target === "Persona")).toMatchObject({
      toPath: "10_Profile/Persona.md",
      alias: "die Persona",
    });
    expect(note.backlinks.map((b) => b.title)).toEqual([
      "2026-08-01 Call Hafen",
      "Lessons",
      "Stack",
      "Start",
      "_Projekt_Index",
    ]);
  });

  it("answers 404 for a path that is not a note and 400 without a path", async () => {
    expect(
      (await request(app).get("/api/vault/note").query({ path: "nope.md" }))
        .status,
    ).toBe(404);
    expect((await request(app).get("/api/vault/note")).status).toBe(400);
  });
});

describe("GET /api/vault/search", () => {
  it("matches titles and body text, prefix included, with a snippet", async () => {
    const hits = (
      await request(app).get("/api/vault/search").query({ q: "hafenkonzept" })
    ).body as SearchHit[];
    expect(hits.map((h) => h.title)).toEqual(["2026-08-01 Call Hafen"]);
    expect(hits[0].snippet).toContain("Hafenkonzept");
    const prefix = (
      await request(app).get("/api/vault/search").query({ q: "leucht" })
    ).body as SearchHit[];
    expect(prefix.map((h) => h.title)).toContain("Leuchtturm");
  });

  it("ranks a title match above a body match", async () => {
    const hits = (
      await request(app).get("/api/vault/search").query({ q: "persona" })
    ).body as SearchHit[];
    expect(hits[0].title).toBe("Persona");
  });

  it("returns nothing for an empty query and copes with quotes", async () => {
    expect(
      (await request(app).get("/api/vault/search").query({ q: "  " })).body,
    ).toEqual([]);
    expect(
      (await request(app).get("/api/vault/search").query({ q: 'sta"ck' }))
        .status,
    ).toBe(200);
  });
});

describe("GET /api/vault/file", () => {
  it("serves an attachment from inside the vault", async () => {
    const res = await request(app)
      .get("/api/vault/file")
      .query({ path: "assets/skizze.svg" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
  });

  it("refuses paths that leave the vault and misses cleanly", async () => {
    expect(
      (
        await request(app)
          .get("/api/vault/file")
          .query({ path: "../../etc/hosts" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/vault/file")
          .query({ path: "assets/none.svg" })
      ).status,
    ).toBe(404);
  });
});
```

`server/test/vault/watch.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { FSWatcher } from "chokidar";
import { openDb } from "../../src/vault/db.js";
import { indexAll } from "../../src/vault/index/indexer.js";
import { watchVault } from "../../src/vault/watch.js";
import { copyFixture } from "./fixture.js";

let dir: string;
let db: Database.Database;
let watcher: FSWatcher;

const notes = () =>
  (db.prepare("SELECT COUNT(*) AS c FROM notes").get() as { c: number }).c;

/** Poll until the index reflects the file system; chokidar's latency is small but not zero. */
async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error("index did not catch up in time");
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeEach(async () => {
  dir = copyFixture();
  db = openDb(":memory:");
  indexAll(db, dir);
  watcher = watchVault(db, dir);
  await new Promise<void>((resolve) => watcher.on("ready", () => resolve()));
});

afterEach(async () => {
  await watcher.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("watchVault", () => {
  it("indexes a new note, re-indexes a changed one and forgets a deleted one", async () => {
    writeFileSync(
      path.join(dir, "60_Knowledge", "Neu.md"),
      "# Neu\n\nVerweist auf [[Start]].\n",
    );
    await until(() => notes() === 13);
    expect(
      db
        .prepare("SELECT to_path FROM links WHERE from_path = ?")
        .get("60_Knowledge/Neu.md"),
    ).toEqual({ to_path: "00_Index/Start.md" });

    writeFileSync(
      path.join(dir, "60_Knowledge", "Neu.md"),
      "# Neu\n\nOhne Link.\n",
    );
    await until(
      () =>
        (
          db
            .prepare("SELECT COUNT(*) AS c FROM links WHERE from_path = ?")
            .get("60_Knowledge/Neu.md") as { c: number }
        ).c === 0,
    );

    unlinkSync(path.join(dir, "60_Knowledge", "Neu.md"));
    await until(() => notes() === 12);
  });

  it("ignores files that are not notes", async () => {
    writeFileSync(path.join(dir, ".obsidian", "workspace.json"), "{}");
    writeFileSync(path.join(dir, "assets", "neu.svg"), "<svg/>");
    await new Promise((r) => setTimeout(r, 400));
    expect(notes()).toBe(12);
  });
});
```

Run: `cd server && npx vitest run test/vault/routes.test.ts test/vault/watch.test.ts`
Expected: FAIL - modules missing.

- [ ] **Step 2: Install chokidar and write the watcher**

`npm install chokidar -w server` (then `npm test -w server` once; apply the native-binding remedy if vitest will not start).

`server/src/vault/watch.ts`:

```ts
import { watch, type FSWatcher } from "chokidar";
import path from "node:path";
import type Database from "better-sqlite3";
import { indexNote, removeNote, resolveLinks } from "./index/indexer.js";
import { isNotePath } from "./index/scan.js";

/**
 * Keep the index in step with the files. Chokidar reports absolute paths; the index speaks
 * vault-relative posix ones. awaitWriteFinish waits for an editor to finish writing, so a
 * half-saved note is never parsed.
 */
export function watchVault(
  db: Database.Database,
  vaultDir: string,
  onChange: () => void = () => undefined,
): FSWatcher {
  const rel = (file: string) =>
    path.relative(vaultDir, file).split(path.sep).join("/");
  const watcher = watch(vaultDir, {
    ignoreInitial: true,
    ignored: (file) =>
      rel(file)
        .split("/")
        .some((part) => part.startsWith(".") || part === "node_modules"),
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  const changed = (file: string) => {
    const relPath = rel(file);
    if (!isNotePath(relPath)) return;
    indexNote(db, vaultDir, relPath);
    resolveLinks(db);
    onChange();
  };
  const removed = (file: string) => {
    const relPath = rel(file);
    if (!isNotePath(relPath)) return;
    removeNote(db, relPath);
    resolveLinks(db);
    onChange();
  };
  watcher.on("add", changed).on("change", changed).on("unlink", removed);
  return watcher;
}
```

- [ ] **Step 3: The routes**

`server/src/vault/routes/query.ts`:

```ts
/** A query-string value as text; arrays and objects (`?path[]=`) become the empty string. */
export function queryText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
```

`server/src/vault/routes/index.ts`:

```ts
/** Vault API: the index of one Obsidian vault, read-only. Mounted at /api/vault. */
import { Router } from "express";
import type Database from "better-sqlite3";
import { filesRouter } from "./files.js";
import { notesRouter } from "./notes.js";
import { searchRouter } from "./search.js";

export interface VaultContext {
  db: Database.Database;
  /** Absolute path of the vault on disk. */
  dir: string;
  /** What Obsidian calls the vault - its folder name - for obsidian:// links. */
  name: string;
}

export function vaultRouter(ctx: VaultContext): Router {
  const router = Router();
  router.use(notesRouter(ctx));
  router.use(searchRouter(ctx));
  router.use(filesRouter(ctx));
  return router;
}
```

`server/src/vault/routes/notes.ts`:

```ts
import { Router } from "express";
import type { LinkRow, NoteRow } from "../db.js";
import { queryText } from "./query.js";
import type { VaultContext } from "./index.js";

interface Count {
  c: number;
}

export function notesRouter({ db, name }: VaultContext): Router {
  const router = Router();

  router.get("/info", (_req, res) => {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM notes").get() as Count;
    res.json({ name, notes: c });
  });

  router.get("/tree", (_req, res) => {
    res.json(
      db.prepare("SELECT path, title, folder FROM notes ORDER BY path").all(),
    );
  });

  router.get("/note", (req, res) => {
    const relPath = queryText(req.query.path);
    if (!relPath) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const note = db
      .prepare("SELECT * FROM notes WHERE path = ?")
      .get(relPath) as NoteRow | undefined;
    if (!note) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const tags = (
      db.prepare("SELECT tag FROM tags WHERE path = ?").all(relPath) as {
        tag: string;
      }[]
    ).map((t) => t.tag);
    const links = (
      db
        .prepare("SELECT * FROM links WHERE from_path = ? ORDER BY rowid")
        .all(relPath) as LinkRow[]
    ).map((l) => ({
      target: l.target,
      heading: l.heading,
      alias: l.alias,
      embed: l.embed === 1,
      toPath: l.to_path,
    }));
    const backlinks = db
      .prepare(
        "SELECT DISTINCT n.path, n.title FROM links l JOIN notes n ON n.path = l.from_path WHERE l.to_path = ? ORDER BY n.title",
      )
      .all(relPath);
    res.json({
      path: note.path,
      title: note.title,
      folder: note.folder,
      frontmatter: JSON.parse(note.frontmatter) as Record<string, unknown>,
      body: note.body,
      mtime: note.mtime,
      tags,
      links,
      backlinks,
    });
  });

  return router;
}
```

`server/src/vault/routes/search.ts`:

```ts
import { Router } from "express";
import { queryText } from "./query.js";
import type { VaultContext } from "./index.js";

/** Each word becomes a quoted prefix term, so punctuation in the query cannot become FTS syntax. */
export function ftsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" ");
}

export function searchRouter({ db }: VaultContext): Router {
  const router = Router();

  router.get("/search", (req, res) => {
    const match = ftsQuery(queryText(req.query.q).trim());
    if (!match) {
      res.json([]);
      return;
    }
    // bm25 weights: path is unindexed, the title counts eight times a body hit.
    res.json(
      db
        .prepare(
          `SELECT n.path, n.title, n.folder, snippet(notes_fts, 2, '[', ']', '…', 12) AS snippet
           FROM notes_fts f JOIN notes n ON n.path = f.path
           WHERE notes_fts MATCH ?
           ORDER BY bm25(notes_fts, 0, 8, 1)
           LIMIT 20`,
        )
        .all(match),
    );
  });

  return router;
}
```

`server/src/vault/routes/files.ts`:

```ts
import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { queryText } from "./query.js";
import type { VaultContext } from "./index.js";

/** Attachments (images, PDFs) referenced from notes, served from inside the vault and nowhere else. */
export function filesRouter({ dir }: VaultContext): Router {
  const router = Router();

  router.get("/file", (req, res) => {
    const relPath = queryText(req.query.path);
    const abs = path.resolve(dir, relPath);
    if (!relPath || !abs.startsWith(dir + path.sep)) {
      res.status(400).json({ error: "path must stay inside the vault" });
      return;
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(abs);
  });

  return router;
}
```

- [ ] **Step 4: Wire the app and the server**

`server/src/app.ts`: import `vaultRouter` and `type VaultContext` from `./vault/routes/index.js`; add `vault: VaultContext;` to `Dbs`; mount `app.use("/api/vault", vaultRouter(dbs.vault));` after the rolodex line; `const APPS = ["crm", "space", "rolodex", "vault"];`.

`server/test/space/app.ts` and `server/test/rolodex/app.ts`: add `vault: emptyVault()` to their `createApp` calls (import `emptyVault` from `../vault/app.js`).

`server/src/index.ts`: add the imports

```ts
import { openDb as openVaultDb } from "./vault/db.js";
import { indexAll } from "./vault/index/indexer.js";
import { locateVault } from "./vault/locate.js";
import { watchVault } from "./vault/watch.js";
```

and, after the rolodex lines:

```ts
const vault = locateVault(
  config,
  path.join(root, "server", "src", "vault", "fixture"),
);
const vaultDb = openVaultDb(path.join(dataDir, "vault.sqlite"));
const indexed = indexAll(vaultDb, vault.dir);
watchVault(vaultDb, vault.dir);

createApp({
  crm,
  space,
  rolodex,
  vault: { db: vaultDb, dir: vault.dir, name: path.basename(vault.dir) },
}).listen(port, () => {
  console.log(`Bench running at http://localhost:${port}`);
  for (const line of describeSources(config)) console.log(`  ${line}`);
  if (vault.missing)
    console.log(
      `  Vault: ${vault.missing} not found - using the bundled sample`,
    );
  console.log(
    `  Vault index: ${indexed.notes} notes, ${indexed.links} links, ${indexed.tasks} tasks from ${vault.dir}`,
  );
});
```

(replace the existing `createApp({ crm, space, rolodex }).listen(...)` block).

`e2e/fixtures.ts`: `waitForServer(\`${base}/api/vault/tree\`)` instead of the space URL.

- [ ] **Step 5: Run, gate, commit**

Run: `cd server && npx vitest run test/vault/`
Expected: PASS. The watch test needs real file events; if it is flaky on this machine, raise `until`'s budget to 5000 ms and say so in the report - do not add retries.

Run: `npm run format && npm run check && npm run e2e`
Expected: green; `npm run e2e` proves every worker's server boots against its own vault copy.

Also prove the log by hand: `npm run build && (PORT=8179 npm run start -w server & sleep 5; curl -s "localhost:8179/api/vault/info"; echo; pkill -f "tsx src/index.ts")` - expected `{"name":"obsidian","notes":<about 77>}` on this machine (the real vault via `.env`), and the startup lines include `Vault index: … notes`.

```bash
git add -A
git commit -m "feat: vault API, file watcher and server wiring"
```

---

### Task 6: The Vault app shell - entry, registration, tree

**Files:**

- Create: `web/vault/index.html`, `web/src/vault/main.tsx`, `web/src/vault/App.tsx`, `web/src/vault/api.ts`, `web/src/vault/types.ts`, `web/src/vault/tree.ts`, `web/src/vault/components/Sidebar.tsx`, `web/src/vault/components/TreeFolder.tsx`, `web/src/vault/components/NoteView.tsx` (plain, replaced in Task 7), `web/src/vault/styles.css`
- Test: `web/src/vault/tree.test.ts`, `web/src/vault/components/Sidebar.test.tsx`, `web/src/vault/App.test.tsx`
- Modify: `web/vite.config.ts`, `web/src/shared/AppIcons.tsx`, `web/src/shared/BenchNav.tsx`, `web/src/shared/BenchNav.test.tsx`, `web/src/home/App.tsx`, `web/src/home/App.test.tsx`, `eslint.config.js`, `e2e/smoke.spec.ts`, `e2e/theme.spec.ts`, `e2e/tools/chrome-shots.mjs`

**Interfaces:**

- Produces: the `/vault` document; `AppKey` gains `"vault"` and the strip reads `Start, Vault, CRM, Space, Rolodex`; `web/src/vault/types.ts` mirrors Task 5's response shapes; `api.info()`, `api.tree()`, `api.note(path)`, `api.search(q)`; `buildTree(entries)`, `noteUrl(path)`, `ancestorsOf(path)`, `startNote(entries)`.
- Routes inside the document: `/` redirects to the note titled `Start` (or the first note); `/n/*` shows a note, the splat being the vault-relative path with each segment URI-encoded.

- [ ] **Step 1: Failing tests**

`web/src/vault/tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTree, noteUrl, startNote } from "./tree";
import type { TreeEntry } from "./types";

const entries: TreeEntry[] = [
  { path: "00_Index/Start.md", title: "Start", folder: "00_Index" },
  {
    path: "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    title: "2026-08-01 Call Hafen",
    folder: "30_Projekte/Leuchtturm/Calls",
  },
  {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    title: "Leuchtturm",
    folder: "30_Projekte/Leuchtturm",
  },
  { path: "Willkommen.md", title: "Willkommen", folder: "" },
];

describe("buildTree", () => {
  it("nests folders and keeps root notes at the top level", () => {
    const root = buildTree(entries);
    expect(root.notes.map((n) => n.title)).toEqual(["Willkommen"]);
    expect(root.folders.map((f) => f.name)).toEqual([
      "00_Index",
      "30_Projekte",
    ]);
    const projects = root.folders[1];
    expect(projects.path).toBe("30_Projekte");
    expect(projects.folders[0].folders[0]).toMatchObject({
      name: "Calls",
      path: "30_Projekte/Leuchtturm/Calls",
    });
    expect(projects.folders[0].notes.map((n) => n.title)).toEqual([
      "Leuchtturm",
    ]);
  });
});

describe("noteUrl and ancestorsOf", () => {
  it("encodes each segment and lists the folders above a note", () => {
    expect(
      noteUrl("30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md"),
    ).toBe("/n/30_Projekte/Leuchtturm/Calls/2026-08-01%20Call%20Hafen.md");
    expect(ancestorsOf("30_Projekte/Leuchtturm/Calls/x.md")).toEqual([
      "30_Projekte",
      "30_Projekte/Leuchtturm",
      "30_Projekte/Leuchtturm/Calls",
    ]);
    expect(ancestorsOf("x.md")).toEqual([]);
  });
});

describe("startNote", () => {
  it("prefers the note called Start, else the first", () => {
    expect(startNote(entries)?.path).toBe("00_Index/Start.md");
    expect(startNote(entries.slice(1))?.path).toBe(
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    );
    expect(startNote([])).toBeUndefined();
  });
});
```

`web/src/vault/components/Sidebar.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import Sidebar from "./Sidebar";
import type { TreeEntry } from "../types";

const entries: TreeEntry[] = [
  { path: "00_Index/Start.md", title: "Start", folder: "00_Index" },
  {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    title: "Leuchtturm",
    folder: "30_Projekte/Leuchtturm",
  },
];

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderSidebar(at = "/") {
  render(
    <MemoryRouter initialEntries={[at]}>
      <Sidebar
        entries={entries}
        vaultName="fixture"
        onSearch={() => undefined}
      />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("shows folders as collapsible tree items and names the vault", () => {
    renderSidebar();
    expect(screen.getByText("fixture")).toBeInTheDocument();
    const tree = within(screen.getByRole("tree", { name: "Notizen" }));
    expect(tree.getByRole("treeitem", { name: "00_Index" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      tree.queryByRole("treeitem", { name: "Start" }),
    ).not.toBeInTheDocument();
  });

  it("opens a folder and navigates to a note", async () => {
    renderSidebar();
    await userEvent.click(
      screen.getByRole("button", { name: "Ordner 00_Index aufklappen" }),
    );
    await userEvent.click(screen.getByRole("treeitem", { name: "Start" }));
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/n/00_Index/Start.md",
    );
  });

  it("expands the folders above the note that is open", () => {
    renderSidebar("/n/30_Projekte/Leuchtturm/Leuchtturm.md");
    expect(
      screen.getByRole("treeitem", { name: "Leuchtturm" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
```

`web/src/vault/App.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import App from "./App";
import { api } from "./api";

vi.mock("./api", () => ({
  api: {
    info: vi.fn().mockResolvedValue({ name: "fixture", notes: 2 }),
    tree: vi.fn().mockResolvedValue([
      { path: "00_Index/Start.md", title: "Start", folder: "00_Index" },
      { path: "Alt.md", title: "Alt", folder: "" },
    ]),
    note: vi.fn().mockResolvedValue({
      path: "00_Index/Start.md",
      title: "Start",
      folder: "00_Index",
      frontmatter: {},
      body: "# Start\n\nHallo.",
      mtime: 0,
      tags: [],
      links: [],
      backlinks: [],
    }),
    search: vi.fn(),
  },
}));

describe("Vault App", () => {
  it("loads the tree and opens the Start note", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Start", level: 1 }),
    ).toBeInTheDocument();
    expect(api.tree).toHaveBeenCalled();
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });
});
```

Update `web/src/shared/BenchNav.test.tsx`'s first test to expect `["Start", "/"], ["Vault", "/vault/"], ["CRM", "/crm/"], ["Space", "/space/"], ["Rolodex", "/rolodex/"]` and rename it "offers the launcher and all four apps, in order". Update `web/src/home/App.test.tsx`: add `["Vault", "/vault/", "Dein Obsidian-Vault, gelesen"]` as the first `APPS` row and change "offers exactly three apps" to expect `4`.

Run: `cd web && npx vitest run src/vault src/shared/BenchNav.test.tsx src/home/App.test.tsx`
Expected: FAIL - modules missing, nav lists four apps not five.

- [ ] **Step 2: Register the app**

`web/vault/index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vault</title>
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231c2128'/%3E%3Cg transform='translate(4 4)' fill='none' stroke='%23ff5c00' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H3z'/%3E%3Cpath d='M21 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z'/%3E%3C/g%3E%3C/svg%3E"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/vault/main.tsx"></script>
  </body>
</html>
```

`web/vite.config.ts`: `const APPS = ["crm", "space", "rolodex", "vault"];` and `vault: entry("vault/index.html"),` in `rollupOptions.input`.

`web/src/shared/AppIcons.tsx`, after `IconSpace`:

```tsx
/** An open book: the vault is read here, not written. */
export const IconVault = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M3 4.5h6a3 3 0 0 1 3 3v12.5a2 2 0 0 0-2-2H3z" />
    <path d="M21 4.5h-6a3 3 0 0 0-3 3v12.5a2 2 0 0 1 2-2h7z" />
  </Stroke>
);
```

`web/src/shared/BenchNav.tsx`: import `IconVault`; `type AppKey = "home" | "vault" | "crm" | "space" | "rolodex";`; insert `{ key: "vault", href: "/vault/", label: "Vault", Icon: IconVault },` directly after the `home` entry.

`web/src/home/App.tsx`: import `IconVault`; insert as the first card:

```tsx
  {
    href: "/vault/",
    name: "Vault",
    tagline: "Dein Obsidian-Vault, gelesen",
    detail:
      "Ordnerbaum, Notizen mit funktionierenden Wikilinks und Rückverweisen, Volltextsuche - direkt aus den Markdown-Dateien, ohne Kopie.",
    facts: ["Notizen", "Backlinks", "Suche"],
    Icon: IconVault,
  },
```

and change the lede's "Drei Apps" to "Vier Apps" (Task 9 turns it back to "Drei" when Space goes).

`eslint.config.js`: both app arrays become `["crm", "space", "rolodex", "vault"]`.

- [ ] **Step 3: Types, API, tree helpers**

`web/src/vault/types.ts`:

```ts
export interface Info {
  name: string;
  notes: number;
}

export interface TreeEntry {
  path: string;
  title: string;
  folder: string;
}

export interface NoteLink {
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
  toPath: string | null;
}

export interface Backlink {
  path: string;
  title: string;
}

export interface Note {
  path: string;
  title: string;
  folder: string;
  frontmatter: Record<string, unknown>;
  body: string;
  mtime: number;
  tags: string[];
  links: NoteLink[];
  backlinks: Backlink[];
}

export interface SearchHit {
  path: string;
  title: string;
  folder: string;
  snippet: string;
}
```

`web/src/vault/api.ts`:

```ts
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
```

`web/src/vault/tree.ts`:

```ts
import type { TreeEntry } from "./types";

export interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  notes: TreeEntry[];
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "de");
const byTitle = (a: TreeEntry, b: TreeEntry) =>
  a.title.localeCompare(b.title, "de");

function build(entries: TreeEntry[], prefix: string, name: string): FolderNode {
  const here = entries.filter((e) => e.folder === prefix);
  const childNames = [
    ...new Set(
      entries
        .filter(
          (e) =>
            e.folder !== prefix &&
            (prefix === "" || e.folder.startsWith(`${prefix}/`)),
        )
        .map(
          (e) =>
            e.folder.slice(prefix === "" ? 0 : prefix.length + 1).split("/")[0],
        ),
    ),
  ];
  const folders = childNames
    .map((child) =>
      build(entries, prefix === "" ? child : `${prefix}/${child}`, child),
    )
    .sort(byName);
  return { name, path: prefix, folders, notes: [...here].sort(byTitle) };
}

/** The folder tree the flat list implies; the root's name is empty. */
export function buildTree(entries: TreeEntry[]): FolderNode {
  return build(entries, "", "");
}

/** The route for a note: every segment URI-encoded, so spaces and umlauts survive. */
export function noteUrl(path: string): string {
  return `/n/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Folder paths from the top down to the note's own folder. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Where a visit begins: a note called Start, else the first note. */
export function startNote(entries: TreeEntry[]): TreeEntry | undefined {
  return entries.find((e) => e.title === "Start") ?? entries[0];
}
```

- [ ] **Step 4: Sidebar and tree**

`web/src/vault/components/TreeFolder.tsx`:

```tsx
import { ChevronRight } from "lucide-react";
import type { FolderNode } from "../tree";
import type { TreeEntry } from "../types";

interface Props {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  activePath?: string;
  onToggle: (path: string) => void;
  onOpen: (note: TreeEntry) => void;
}

/** One folder row plus, when open, its subfolders and notes. Folders first, as Obsidian does. */
export default function TreeFolder(props: Props) {
  const { node, depth, expanded, activePath, onToggle, onOpen } = props;
  const isOpen = expanded.has(node.path);
  return (
    <div role="none">
      <div
        role="treeitem"
        aria-label={node.name}
        aria-expanded={isOpen}
        className="tree-row tree-folder"
        style={{ paddingLeft: 8 + depth * 14 }}
        tabIndex={0}
        onClick={() => onToggle(node.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(node.path);
          }
        }}
      >
        <button
          type="button"
          className={`chevron${isOpen ? " open" : ""}`}
          aria-label={
            isOpen
              ? `Ordner ${node.name} zuklappen`
              : `Ordner ${node.name} aufklappen`
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path);
          }}
        >
          <ChevronRight size={14} />
        </button>
        <span className="tree-label">{node.name}</span>
      </div>
      {isOpen && (
        <div role="group">
          {node.folders.map((f) => (
            <TreeFolder key={f.path} {...props} node={f} depth={depth + 1} />
          ))}
          {node.notes.map((n) => (
            <div
              key={n.path}
              role="treeitem"
              aria-label={n.title}
              aria-selected={n.path === activePath}
              className={`tree-row tree-note${n.path === activePath ? " active" : ""}`}
              style={{ paddingLeft: 30 + depth * 14 }}
              tabIndex={0}
              onClick={() => onOpen(n)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(n);
                }
              }}
            >
              <span className="tree-label">{n.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

`web/src/vault/components/Sidebar.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Search } from "lucide-react";
import { IconVault } from "../../shared/AppIcons";
import { ancestorsOf, buildTree, noteUrl } from "../tree";
import type { TreeEntry } from "../types";
import TreeFolder from "./TreeFolder";

interface Props {
  entries: TreeEntry[];
  vaultName: string;
  onSearch: () => void;
}

const KEY = "vault.expanded";

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** The note the URL names, decoded - or undefined on any other route. */
function activePathFrom(pathname: string): string | undefined {
  const m = /^\/n\/(.+)$/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export default function Sidebar({ entries, vaultName, onSearch }: Props) {
  const navigate = useNavigate();
  const activePath = activePathFrom(useLocation().pathname);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const tree = useMemo(() => buildTree(entries), [entries]);
  // The open note's folders are shown open whatever was remembered, or the selection is invisible.
  const shown = useMemo(
    () =>
      new Set([...expanded, ...(activePath ? ancestorsOf(activePath) : [])]),
    [expanded, activePath],
  );

  const toggle = (path: string) => {
    const next = new Set(shown);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpanded(next);
    localStorage.setItem(KEY, JSON.stringify([...next]));
  };

  return (
    <nav className="sidebar" aria-label="Vault">
      <div className="brand">
        <IconVault size={20} />
        <span className="brand-name">Vault</span>
        <span className="brand-sub">{vaultName}</span>
      </div>
      <div className="sidebar-top">
        <button type="button" className="sidebar-action" onClick={onSearch}>
          <Search size={15} />
          Suche
          <kbd className="sidebar-kbd">⌘K</kbd>
        </button>
      </div>
      <div className="tree" role="tree" aria-label="Notizen">
        {tree.folders.map((f) => (
          <TreeFolder
            key={f.path}
            node={f}
            depth={0}
            expanded={shown}
            activePath={activePath}
            onToggle={toggle}
            onOpen={(n) => void navigate(noteUrl(n.path))}
          />
        ))}
        {tree.notes.map((n) => (
          <div
            key={n.path}
            role="treeitem"
            aria-label={n.title}
            aria-selected={n.path === activePath}
            className={`tree-row tree-note${n.path === activePath ? " active" : ""}`}
            style={{ paddingLeft: 30 }}
            tabIndex={0}
            onClick={() => void navigate(noteUrl(n.path))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void navigate(noteUrl(n.path));
              }
            }}
          >
            <span className="tree-label">{n.title}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: App, entry, a plain NoteView**

`web/src/vault/main.tsx` - as `web/src/space/main.tsx` with `basename="/vault"` and `./styles.css`.

`web/src/vault/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import BenchNav from "../shared/BenchNav";
import { api } from "./api";
import { noteUrl, startNote } from "./tree";
import type { Info, TreeEntry } from "./types";
import NoteView from "./components/NoteView";
import Sidebar from "./components/Sidebar";

export default function App() {
  const [entries, setEntries] = useState<TreeEntry[] | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    void api.tree().then(setEntries);
    void api.info().then(setInfo);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const first = entries ? startNote(entries) : undefined;
  return (
    <>
      <BenchNav active="vault" />
      <div className="app">
        <Sidebar
          entries={entries ?? []}
          vaultName={info?.name ?? ""}
          onSearch={() => setSearchOpen(true)}
        />
        <main className="main">
          <Routes>
            <Route
              path="/"
              element={
                first ? <Navigate to={noteUrl(first.path)} replace /> : null
              }
            />
            <Route
              path="/n/*"
              element={<NoteView vaultName={info?.name ?? ""} />}
            />
          </Routes>
        </main>
        {searchOpen && <div hidden />}
      </div>
    </>
  );
}
```

(The `searchOpen` placeholder is replaced by the quick-find in Task 8; it exists now so the shortcut wiring is in place and tested there.)

`web/src/vault/components/NoteView.tsx` (Task 7 replaces the body rendering; the shape stays):

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api } from "../api";
import type { Note } from "../types";

interface Props {
  vaultName: string;
}

export default function NoteView({ vaultName }: Props) {
  const path = useParams()["*"] ?? "";
  const [loaded, setLoaded] = useState<{ path: string; note: Note | null }>({
    path: "",
    note: null,
  });
  useEffect(() => {
    api
      .note(path)
      .then((note) => setLoaded({ path, note }))
      .catch(() => setLoaded({ path, note: null }));
  }, [path]);
  if (loaded.path !== path) return null;
  if (!loaded.note)
    return <p className="note-missing">Notiz nicht gefunden: {path}</p>;
  const { note } = loaded;
  return (
    <article className="note" data-vault={vaultName}>
      <p className="note-folder">{note.folder || "/"}</p>
      <h1>{note.title}</h1>
      <pre className="note-raw">{note.body}</pre>
    </article>
  );
}
```

- [ ] **Step 6: Styles**

`web/src/vault/styles.css` - the tokens, the height chain and the sidebar; Task 7 adds the note typography:

```css
/* Vault: the launcher's greys, orange as the one accent, dark first. */

:root {
  color-scheme: light;
  --accent: #ff5c00;
  --accent-ink: #b84200;
  --accent-wash: rgba(255, 92, 0, 0.12);
  --bg: #ffffff;
  --bg-sidebar: #f2f4f6;
  --bg-raised: #ffffff;
  --bg-hover: rgba(28, 33, 40, 0.06);
  --text: #1c2128;
  --text-soft: #5b636e;
  --text-faint: #868e99;
  --border: #dfe3e8;
  --code-bg: #f2f4f6;
  --shadow: 0 8px 28px rgba(20, 22, 26, 0.16);
}

[data-theme="dark"] {
  color-scheme: dark;
  --accent-ink: #ff7a33;
  --accent-wash: rgba(255, 92, 0, 0.16);
  --bg: #14171c;
  --bg-sidebar: #1c2128;
  --bg-raised: #1c2128;
  --bg-hover: rgba(255, 255, 255, 0.06);
  --text: #e9edf2;
  --text-soft: #9aa3ae;
  --text-faint: #6f7884;
  --border: #2b323b;
  --code-bg: #1c2128;
  --shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

button {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

/* The nav strip takes 47px; the app fills what is left and the main column scrolls. */
#root {
  display: flex;
  flex-direction: column;
}

.app {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  user-select: none;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 16px 6px;
  color: var(--accent-ink);
}

.brand-name {
  font-weight: 700;
  color: var(--text);
}

.brand-sub {
  font-size: 12px;
  color: var(--text-faint);
}

.sidebar-top {
  padding: 4px 8px 8px;
  border-bottom: 1px solid var(--border);
}

.sidebar-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--text-soft);
}

.sidebar-action:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.sidebar-kbd {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-faint);
}

.tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding-right: 8px;
  border-radius: 6px;
  margin: 0 6px;
  color: var(--text-soft);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}

.tree-row:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.tree-row.active {
  background: var(--accent-wash);
  color: var(--accent-ink);
}

.tree-folder {
  font-weight: 600;
}

.chevron {
  display: flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  transition: transform 120ms ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.main {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

.note {
  max-width: 76ch;
  margin: 0 auto;
  padding: 36px 40px 80px;
}

.note-folder {
  margin: 0 0 6px;
  font-size: 12.5px;
  color: var(--text-faint);
}

.note h1 {
  margin: 0 0 18px;
  font-size: 30px;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.note-raw {
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--text-soft);
}

.note-missing {
  padding: 40px;
  color: var(--text-soft);
}
```

The chevron's `transform: rotate(90deg)` is a state change on a control, not a hover flourish - the rule bans hover transforms, and this is not one.

- [ ] **Step 7: e2e seams and the screenshot tool**

`e2e/smoke.spec.ts`: add after the launcher entry in `APPS`:

```ts
  {
    path: "/vault/",
    title: "Vault",
    tab: "Vault",
    ready: (p) => p.getByRole("treeitem").first(),
  },
```

the deep-link list gains `["/vault/n/anything", "Vault"],`; the launcher loop becomes `["Vault", "CRM", "Space", "Rolodex"]`; the nav text list becomes `["Start", "Vault", "CRM", "Space", "Rolodex"]`; the "nav reaches every app" list gains `["Vault", "Vault"],` as its first tuple; in "both API namespaces answer" add

```ts
const vault = await page.request.get(`${baseURL}/api/vault/tree`);
expect(vault.ok()).toBeTruthy();
expect((await json<{ path: string }[]>(vault)).length).toBeGreaterThan(0);
```

`e2e/theme.spec.ts`: `const APPS = ["/", "/vault/", "/crm/", "/space/", "/rolodex/"];`. `e2e/tools/chrome-shots.mjs`: add `"/vault/"` to its path list and let `name` derive as it does (`vault`).

- [ ] **Step 8: Run, gate, commit**

Run: `cd web && npx vitest run src/vault src/shared src/home`
Expected: PASS.

Run: `npm run format && npm run check && npm run e2e`
Expected: green. Web coverage may dip; it must stay ≥ 80 % - if it does not, the missing cover is in `App.tsx` or `Sidebar.tsx`, and a test, not an exclusion, fixes it.

Then look: `npm run dev`, open http://localhost:8101/vault/ - your real vault's folders in the sidebar, the Start note's raw text on the right, the strip marking Vault. Stop the dev server.

```bash
git add -A
git commit -m "feat: the Vault app shell with a folder tree over the indexed notes"
```

---

### Task 7: Notes - rendered markdown, wikilinks, backlinks, raw view, open in Obsidian

**Files:**

- Create: `web/src/vault/markdown.ts`, `web/src/vault/obsidian.ts`, `web/src/vault/components/Backlinks.tsx`
- Modify: `web/src/vault/components/NoteView.tsx`, `web/src/vault/styles.css`
- Test: `web/src/vault/markdown.test.ts`, `web/src/vault/obsidian.test.ts`, `web/src/vault/components/NoteView.test.tsx`
- Modify: `e2e/vault/notes.spec.ts` (new)

**Interfaces:**

- Produces: `prepareMarkdown(body, links): string` (wikilinks and callouts turned into plain markdown; fenced code untouched), `resolveAsset(src, folder): string` (a relative image path → `/api/vault/file?path=…`), `obsidianUrl(vault, path): string`; `NoteView` renders with react-markdown and shows tags, frontmatter, backlinks, a raw toggle and the Obsidian link.

- [ ] **Step 1: Failing tests**

`web/src/vault/markdown.test.ts`:

````ts
import { describe, expect, it } from "vitest";
import { prepareMarkdown, resolveAsset } from "./markdown";
import type { NoteLink } from "./types";

const links: NoteLink[] = [
  {
    target: "Cockpit",
    heading: null,
    alias: null,
    embed: false,
    toPath: "00_Index/Cockpit.md",
  },
  {
    target: "Stack",
    heading: "Datenbank",
    alias: "Datenbank-Stack",
    embed: false,
    toPath: "40_Tech_Stack/Stack.md",
  },
  {
    target: "Nicht vorhanden",
    heading: null,
    alias: null,
    embed: false,
    toPath: null,
  },
  {
    target: "assets/skizze.svg",
    heading: null,
    alias: null,
    embed: true,
    toPath: null,
  },
];

describe("prepareMarkdown", () => {
  it("turns resolved wikilinks into note links and keeps aliases", () => {
    expect(
      prepareMarkdown(
        "Siehe [[Cockpit]] und [[Stack#Datenbank|Datenbank-Stack]].",
        links,
      ),
    ).toBe(
      "Siehe [Cockpit](/vault/n/00_Index/Cockpit.md) und [Datenbank-Stack](/vault/n/40_Tech_Stack/Stack.md).",
    );
  });

  it("leaves a dangling link as plain text", () => {
    expect(prepareMarkdown("[[Nicht vorhanden]] fehlt", links)).toBe(
      "Nicht vorhanden fehlt",
    );
  });

  it("turns an embed into an image served from the vault", () => {
    expect(prepareMarkdown("![[assets/skizze.svg]]", links)).toBe(
      "![assets/skizze.svg](/api/vault/file?path=assets%2Fskizze.svg)",
    );
  });

  it("rewrites callouts as bold-titled quotes", () => {
    expect(prepareMarkdown("> [!tip] Hinweis\n> Text", links)).toBe(
      "> **Hinweis**\n> Text",
    );
    expect(prepareMarkdown("> [!warning]\n> Text", links)).toBe(
      "> **Warning**\n> Text",
    );
  });

  it("does not touch fenced code", () => {
    const body = "```js\n[[Kein Link]]\n```\n[[Cockpit]]";
    expect(prepareMarkdown(body, links)).toBe(
      "```js\n[[Kein Link]]\n```\n[Cockpit](/vault/n/00_Index/Cockpit.md)",
    );
  });
});

describe("resolveAsset", () => {
  it("resolves a relative image against the note's folder and leaves absolute URLs alone", () => {
    expect(resolveAsset("../assets/skizze.svg", "20_Brands")).toBe(
      "/api/vault/file?path=assets%2Fskizze.svg",
    );
    expect(resolveAsset("bild.png", "")).toBe("/api/vault/file?path=bild.png");
    expect(resolveAsset("https://example.com/x.png", "20_Brands")).toBe(
      "https://example.com/x.png",
    );
  });
});
````

`web/src/vault/obsidian.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { obsidianUrl } from "./obsidian";

describe("obsidianUrl", () => {
  it("names the vault and the note without its extension", () => {
    expect(
      obsidianUrl(
        "obsidian",
        "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
      ),
    ).toBe(
      "obsidian://open?vault=obsidian&file=30_Projekte%2FLeuchtturm%2FCalls%2F2026-08-01%20Call%20Hafen",
    );
  });
});
```

`web/src/vault/components/NoteView.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import NoteView from "./NoteView";
import { api } from "../api";
import type { Note } from "../types";

vi.mock("../api", () => ({ api: { note: vi.fn() } }));

const note: Note = {
  path: "00_Index/Start.md",
  title: "Start",
  folder: "00_Index",
  frontmatter: { tags: ["moc"], updated: "2026-08-01" },
  body: "# Start\n\nGeh zu [[Cockpit]].\n\n> [!tip] Hinweis\n> Callout.",
  mtime: 0,
  tags: ["moc", "index"],
  links: [
    {
      target: "Cockpit",
      heading: null,
      alias: null,
      embed: false,
      toPath: "00_Index/Cockpit.md",
    },
  ],
  backlinks: [{ path: "10_Profile/Persona.md", title: "Persona" }],
};

function renderNote() {
  render(
    <MemoryRouter initialEntries={["/n/00_Index/Start.md"]}>
      <Routes>
        <Route path="/n/*" element={<NoteView vaultName="obsidian" />} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteView", () => {
  it("renders the note with a working wikilink, tags, frontmatter and backlinks", async () => {
    vi.mocked(api.note).mockResolvedValue(note);
    renderNote();
    expect(
      await screen.findByRole("heading", { name: "Start", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cockpit" })).toHaveAttribute(
      "href",
      "/n/00_Index/Cockpit.md",
    );
    expect(screen.getByText("Hinweis")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Tags" })).toHaveTextContent("moc");
    expect(
      screen.getByRole("table", { name: "Frontmatter" }),
    ).toHaveTextContent("updated");
    expect(screen.getByRole("link", { name: "Persona" })).toHaveAttribute(
      "href",
      "/n/10_Profile/Persona.md",
    );
    expect(
      screen.getByRole("link", { name: "In Obsidian öffnen" }),
    ).toHaveAttribute(
      "href",
      "obsidian://open?vault=obsidian&file=00_Index%2FStart",
    );
  });

  it("toggles to the raw text and back", async () => {
    vi.mocked(api.note).mockResolvedValue(note);
    renderNote();
    await screen.findByRole("heading", { name: "Start", level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Rohtext" }));
    expect(screen.getByText(/\[\[Cockpit\]\]/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ansicht" }));
    expect(screen.getByRole("link", { name: "Cockpit" })).toBeInTheDocument();
  });

  it("says when a note is missing", async () => {
    vi.mocked(api.note).mockRejectedValue(new Error("Not found"));
    renderNote();
    expect(await screen.findByText(/Notiz nicht gefunden/)).toBeInTheDocument();
  });
});
```

Run: `cd web && npx vitest run src/vault`
Expected: FAIL - `markdown`, `obsidian` missing; NoteView renders raw.

- [ ] **Step 2: Install and write the transforms**

`npm install react-markdown remark-gfm -w web` (then `npm test -w web` once; native-binding remedy if needed).

`web/src/vault/markdown.ts`:

````ts
import { noteUrl } from "./tree";
import type { NoteLink } from "./types";

const FENCE = /^(```|~~~)/;
const LINK = /(!?)\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g;
const CALLOUT = /^(\s*>\s*)\[!([a-zA-Z]+)\]\s*(.*)$/;

const fileUrl = (relPath: string) =>
  `/api/vault/file?path=${encodeURIComponent(relPath)}`;

function replaceLink(
  links: NoteLink[],
  embed: string,
  target: string,
  heading?: string,
  alias?: string,
): string {
  const t = target.trim();
  if (embed) return `![${t}](${fileUrl(t)})`;
  const resolved = links.find((l) => l.target === t && !l.embed)?.toPath;
  const label =
    alias?.trim() || (heading?.trim() ? `${t} › ${heading.trim()}` : t);
  return resolved ? `[${label}](/vault${noteUrl(resolved)})` : label;
}

function transformProse(line: string, links: NoteLink[]): string {
  const callout = CALLOUT.exec(line);
  if (callout) {
    const [, prefix, type, title] = callout;
    const shown =
      title.trim() || type[0].toUpperCase() + type.slice(1).toLowerCase();
    return `${prefix}**${shown}**`;
  }
  return line.replace(
    LINK,
    (_m, embed: string, target: string, heading?: string, alias?: string) =>
      replaceLink(links, embed, target, heading, alias),
  );
}

/**
 * What react-markdown gets: Obsidian's wikilinks as ordinary links to this app's routes (a link
 * with no note behind it stays as plain text), embeds as images from the vault, callouts as
 * quotes with a bold first line. Fenced code passes through untouched.
 */
export function prepareMarkdown(body: string, links: NoteLink[]): string {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (FENCE.test(line.trim())) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : transformProse(line, links);
    })
    .join("\n");
}

/** A relative image path in a note is relative to the note's folder; serve it from the vault. */
export function resolveAsset(src: string, folder: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/")) return src;
  const parts = [...(folder ? folder.split("/") : []), ...src.split("/")];
  const resolved = parts.reduce<string[]>((acc, part) => {
    if (part === "..") return acc.slice(0, -1);
    return part === "." || part === "" ? acc : [...acc, part];
  }, []);
  return fileUrl(resolved.join("/"));
}
````

`web/src/vault/obsidian.ts`:

```ts
/** Obsidian's own URI scheme opens the note in the app; the file is named without .md. */
export function obsidianUrl(vault: string, path: string): string {
  const file = path.replace(/\.md$/, "");
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}
```

- [ ] **Step 3: The note view**

`web/src/vault/components/Backlinks.tsx`:

```tsx
import { Link } from "react-router";
import { noteUrl } from "../tree";
import type { Backlink } from "../types";

export default function Backlinks({ items }: { items: Backlink[] }) {
  return (
    <section className="note-backlinks" aria-labelledby="backlinks-heading">
      <h2 id="backlinks-heading">Verweise auf diese Notiz</h2>
      {items.length === 0 ? (
        <p className="note-empty">Keine Verweise.</p>
      ) : (
        <ul>
          {items.map((b) => (
            <li key={b.path}>
              <Link to={noteUrl(b.path)}>{b.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Replace `web/src/vault/components/NoteView.tsx`:

```tsx
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { prepareMarkdown, resolveAsset } from "../markdown";
import { obsidianUrl } from "../obsidian";
import type { Note } from "../types";
import Backlinks from "./Backlinks";

interface Props {
  vaultName: string;
}

const APP_PREFIX = "/vault";

/** Frontmatter as text, one value per row; tags have their own list. */
function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function Frontmatter({ data }: { data: Record<string, unknown> }) {
  const rows = Object.entries(data).filter(([key]) => key !== "tags");
  if (rows.length === 0) return null;
  return (
    <table className="note-frontmatter" aria-label="Frontmatter">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{valueText(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function NoteView({ vaultName }: Props) {
  const path = useParams()["*"] ?? "";
  const [loaded, setLoaded] = useState<{ path: string; note: Note | null }>({
    path: "",
    note: null,
  });
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    api
      .note(path)
      .then((note) => setLoaded({ path, note }))
      .catch(() => setLoaded({ path, note: null }));
  }, [path]);

  if (loaded.path !== path) return null;
  if (!loaded.note)
    return <p className="note-missing">Notiz nicht gefunden: {path}</p>;
  const { note } = loaded;
  return (
    <article className="note">
      <header className="note-header">
        <p className="note-folder">{note.folder || "/"}</p>
        <h1>{note.title}</h1>
        <div className="note-actions">
          <a className="note-action" href={obsidianUrl(vaultName, note.path)}>
            In Obsidian öffnen
          </a>
          <button
            type="button"
            className="note-action"
            onClick={() => setRaw((v) => !v)}
          >
            {raw ? "Ansicht" : "Rohtext"}
          </button>
        </div>
        {note.tags.length > 0 && (
          <ul className="note-tags" aria-label="Tags">
            {note.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <Frontmatter data={note.frontmatter} />
      </header>
      {raw ? (
        <pre className="note-raw">{note.body}</pre>
      ) : (
        <div className="note-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) =>
                href?.startsWith(`${APP_PREFIX}/`) ? (
                  <Link to={href.slice(APP_PREFIX.length)}>{children}</Link>
                ) : (
                  <a href={href}>{children}</a>
                ),
              img: ({ src, alt }) => (
                <img
                  src={resolveAsset(String(src ?? ""), note.folder)}
                  alt={alt ?? ""}
                />
              ),
            }}
          >
            {prepareMarkdown(note.body, note.links)}
          </ReactMarkdown>
        </div>
      )}
      <Backlinks items={note.backlinks} />
    </article>
  );
}
```

react-markdown 10's default `urlTransform` keeps relative and root-relative URLs (`/vault/…`, `/api/…`) and strips unsafe schemes, so no `urlTransform` prop is needed; the `obsidian://` link is an ordinary anchor outside the markdown.

- [ ] **Step 4: Note typography**

Append to `web/src/vault/styles.css`:

```css
.note-header {
  margin-bottom: 24px;
}

.note-actions {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
}

.note-action {
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-soft);
  text-decoration: none;
  font-size: 13px;
}

.note-action:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.note-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.note-tags li {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-soft);
}

.note-frontmatter {
  border-collapse: collapse;
  font-size: 13px;
  margin: 0 0 8px;
}

.note-frontmatter th {
  text-align: left;
  padding: 3px 14px 3px 0;
  color: var(--text-faint);
  font-weight: 500;
}

.note-frontmatter td {
  padding: 3px 0;
  color: var(--text-soft);
}

.note-body {
  font-size: 15px;
  line-height: 1.6;
}

.note-body h1,
.note-body h2,
.note-body h3 {
  margin: 28px 0 10px;
  line-height: 1.25;
}

.note-body h2 {
  font-size: 21px;
}

.note-body h3 {
  font-size: 17px;
}

.note-body p,
.note-body ul,
.note-body ol {
  margin: 0 0 12px;
}

.note-body a {
  color: var(--accent-ink);
}

.note-body blockquote {
  margin: 0 0 12px;
  padding: 10px 14px;
  background: var(--bg-sidebar);
  border-radius: 6px;
  color: var(--text-soft);
}

.note-body blockquote p {
  margin: 0;
}

.note-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  background: var(--code-bg);
  padding: 1px 4px;
  border-radius: 4px;
}

.note-body pre {
  padding: 12px 14px;
  background: var(--code-bg);
  border-radius: 6px;
  overflow-x: auto;
}

.note-body pre code {
  padding: 0;
  background: none;
}

.note-body table {
  border-collapse: collapse;
  margin: 0 0 12px;
}

.note-body th,
.note-body td {
  border: 1px solid var(--border);
  padding: 5px 10px;
  text-align: left;
}

.note-body img {
  max-width: 100%;
}

.note-body input[type="checkbox"] {
  margin-right: 6px;
}

.note-backlinks {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.note-backlinks h2 {
  font-size: 15px;
  margin: 0 0 8px;
}

.note-backlinks ul {
  margin: 0;
  padding-left: 18px;
}

.note-backlinks a {
  color: var(--accent-ink);
}

.note-empty {
  color: var(--text-faint);
}
```

- [ ] **Step 5: The browser spec**

`e2e/vault/notes.spec.ts`:

```ts
import { test, expect } from "../fixtures";

test("the tree opens a note, wikilinks navigate, backlinks list the referrers", async ({
  page,
}) => {
  await page.goto("/vault/");
  await expect(
    page.getByRole("heading", { name: "Start", level: 1 }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Projekt Leuchtturm" }).click();
  await expect(page).toHaveURL(
    /\/vault\/n\/30_Projekte\/Leuchtturm\/Leuchtturm\.md$/,
  );
  await expect(
    page.getByRole("heading", { name: "Leuchtturm", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: "Leuchtturm" }),
  ).toHaveAttribute("aria-selected", "true");

  const backlinks = page.getByRole("region", {
    name: "Verweise auf diese Notiz",
  });
  await expect(backlinks.getByRole("link", { name: "Stack" })).toBeVisible();
  await backlinks.getByRole("link", { name: "Stack" }).click();
  await expect(
    page.getByRole("heading", { name: "Stack", level: 1 }),
  ).toBeVisible();
});

test("a dangling link is text, the raw view shows the source, and Obsidian gets a link", async ({
  page,
}) => {
  await page.goto("/vault/n/00_Index/Start.md");
  await expect(
    page.getByRole("heading", { name: "Start", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Nicht vorhanden" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Nicht vorhanden - ein Link ins Leere"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Rohtext" }).click();
  await expect(page.getByText("[[Nicht vorhanden]]")).toBeVisible();
  await page.getByRole("button", { name: "Ansicht" }).click();

  await expect(
    page.getByRole("link", { name: "In Obsidian öffnen" }),
  ).toHaveAttribute(
    "href",
    "obsidian://open?vault=vault&file=00_Index%2FStart",
  );
});

test("a relative image is served from the vault", async ({ page }) => {
  await page.goto("/vault/n/20_Brands/Nordlicht.md");
  const img = page.getByRole("img", { name: "Skizze" });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute(
    "src",
    "/api/vault/file?path=assets%2Fskizze.svg",
  );
});
```

(The e2e vault folder is named `vault` - `e2e/.tmp/w<n>/vault` - so the Obsidian link names `vault`.) `<section aria-labelledby>` exposes the `region` role, which is why the backlinks section is found by name.

- [ ] **Step 6: Run, gate, commit**

Run: `cd web && npx vitest run src/vault` then `npx playwright test e2e/vault --retries=0`
Expected: PASS.

Run: `npm run format && npm run check && npm run e2e`
Expected: green.

Then look at your own vault: `npm run dev`, open a note with callouts, a `tasks` code block and umlauts in the file name; both themes. Stop the dev server.

```bash
git add -A
git commit -m "feat: render notes with wikilinks, backlinks, a raw view and an Obsidian link"
```

---

### Task 8: Quick-find and live updates

**Files:**

- Create: `web/src/vault/components/QuickFind.tsx`, `web/src/vault/components/QuickFind.test.tsx`, `e2e/vault/search.spec.ts`, `e2e/vault/live.spec.ts`
- Modify: `web/src/vault/App.tsx`, `web/src/vault/App.test.tsx`, `web/src/vault/styles.css`, `e2e/fixtures.ts`

**Interfaces:**

- Produces: `<QuickFind onClose />` - a dialog named `Schnellsuche` with a textbox named `Suche`, a listbox `Suchergebnisse`, options named by note title; Escape closes, arrows move, Enter and click open the note. `App` refetches the tree when the window regains focus. `e2e/fixtures.ts` exposes a worker-scoped `vaultDir` fixture (the absolute path of the worker's vault copy).

- [ ] **Step 1: Failing tests**

`web/src/vault/components/QuickFind.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import QuickFind from "./QuickFind";
import { api } from "../api";
import type { SearchHit } from "../types";

vi.mock("../api", () => ({ api: { search: vi.fn() } }));

const hits: SearchHit[] = [
  {
    path: "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    title: "2026-08-01 Call Hafen",
    folder: "30_Projekte/Leuchtturm/Calls",
    snippet: "…das [Hafenkonzept] für…",
  },
  {
    path: "40_Tech_Stack/Stack.md",
    title: "Stack",
    folder: "40_Tech_Stack",
    snippet: "SQLite lokal",
  },
];

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderFind(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QuickFind onClose={onClose} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.search).mockResolvedValue(hits);
});

describe("QuickFind", () => {
  it("searches as you type and shows title, folder and snippet", async () => {
    renderFind();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Suche" }),
      "hafen",
    );
    await waitFor(() => expect(api.search).toHaveBeenCalledWith("hafen"));
    expect(
      await screen.findByRole("option", { name: /Call Hafen/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("30_Projekte/Leuchtturm/Calls"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hafenkonzept/)).toBeInTheDocument();
  });

  it("opens the selection with Enter and closes", async () => {
    const onClose = renderFind();
    await userEvent.type(screen.getByRole("textbox", { name: "Suche" }), "s");
    await screen.findByRole("option", { name: /Stack/ });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/n/40_Tech_Stack/Stack.md",
    );
  });

  it("closes on Escape and says when nothing matches", async () => {
    vi.mocked(api.search).mockResolvedValue([]);
    const onClose = renderFind();
    await userEvent.type(screen.getByRole("textbox", { name: "Suche" }), "zzz");
    expect(await screen.findByText(/Keine Treffer/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

Add to `web/src/vault/App.test.tsx`:

```tsx
it("opens the quick-find with the shortcut and refetches the tree on focus", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Start", level: 1 });
  await userEvent.keyboard("{Meta>}k{/Meta}");
  expect(
    screen.getByRole("dialog", { name: "Schnellsuche" }),
  ).toBeInTheDocument();
  window.dispatchEvent(new Event("focus"));
  await waitFor(() => expect(api.tree).toHaveBeenCalledTimes(2));
});
```

(import `userEvent` and `waitFor` there.)

Run: `cd web && npx vitest run src/vault`
Expected: FAIL - `QuickFind` missing; no dialog; tree fetched once.

- [ ] **Step 2: The component**

`web/src/vault/components/QuickFind.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CornerDownLeft, Search } from "lucide-react";
import { api } from "../api";
import { noteUrl } from "../tree";
import type { SearchHit } from "../types";

interface Props {
  onClose: () => void;
}

export default function QuickFind({ onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const results = query.trim() ? found : [];
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = query.trim();
    if (!q) return;
    // A short debounce: the index answers in milliseconds, the typing is what is slow.
    timer.current = setTimeout(() => {
      void api.search(q).then((hits) => {
        setFound(hits);
        setSelected(0);
      });
    }, 120);
    return () => clearTimeout(timer.current);
  }, [query]);

  const open = (hit: SearchHit) => {
    onClose();
    void navigate(noteUrl(hit.path));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setSelected((s) => (s + 1) % results.length);
    }
    if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setSelected((s) => (s - 1 + results.length) % results.length);
    }
    if (e.key === "Enter" && results[selected]) open(results[selected]);
  };

  return (
    <div
      role="presentation"
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="find" role="dialog" aria-label="Schnellsuche">
        <div className="find-input-row">
          <Search size={17} className="find-glyph" />
          <input
            ref={inputRef}
            className="find-input"
            placeholder="Notizen durchsuchen…"
            aria-label="Suche"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="find-kbd">esc</kbd>
        </div>
        {query.trim() && (
          <div
            className="find-results"
            role="listbox"
            aria-label="Suchergebnisse"
          >
            {results.map((r, i) => (
              <button
                key={r.path}
                type="button"
                role="option"
                aria-selected={i === selected}
                aria-label={r.title}
                className={`find-result${i === selected ? " selected" : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => open(r)}
              >
                <span className="find-title">{r.title}</span>
                <span className="find-crumb">{r.folder}</span>
                <span className="find-snippet">{r.snippet}</span>
                {i === selected && (
                  <CornerDownLeft size={13} className="find-enter" />
                )}
              </button>
            ))}
            {results.length === 0 && (
              <div className="find-empty">
                Keine Treffer für „{query.trim()}“
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

`web/src/vault/App.tsx`: import `QuickFind`; replace `{searchOpen && <div hidden />}` with `{searchOpen && <QuickFind onClose={() => setSearchOpen(false)} />}`; and make the tree effect refetch on focus:

```tsx
useEffect(() => {
  const load = () => void api.tree().then(setEntries);
  load();
  void api.info().then(setInfo);
  // The watcher keeps the index fresh; the tree catches up whenever you come back to the tab.
  window.addEventListener("focus", load);
  return () => window.removeEventListener("focus", load);
}, []);
```

Append to `styles.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.4);
  z-index: 10;
}

.find {
  width: min(640px, 92vw);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.find-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.find-glyph {
  color: var(--text-faint);
}

.find-input {
  flex: 1;
  font: inherit;
  font-size: 16px;
  color: inherit;
  background: none;
  border: none;
  outline: none;
}

.find-kbd,
.find-crumb,
.find-snippet,
.find-empty {
  font-size: 12px;
  color: var(--text-faint);
}

.find-results {
  max-height: 60vh;
  overflow-y: auto;
  padding: 6px;
}

.find-result {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  text-align: left;
}

.find-result.selected {
  background: var(--accent-wash);
}

.find-title {
  font-weight: 600;
}

.find-snippet {
  grid-column: 1 / -1;
  color: var(--text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.find-enter {
  color: var(--text-faint);
  align-self: center;
}

.find-empty {
  padding: 10px;
}
```

- [ ] **Step 3: The worker's vault as a fixture, and the two specs**

`e2e/fixtures.ts`: change the fixture type to `base.extend<object, { appServer: string; vaultDir: string }>` and add, after `appServer`, a worker fixture that hands out the same path the server got:

```ts
  vaultDir: [
    async ({}, use, workerInfo) => {
      await use(path.join(root, "e2e", ".tmp", `w${workerInfo.workerIndex}`, "vault"));
    },
    { scope: "worker" },
  ],
```

(compute the path the same way in both fixtures - extract `const workerVault = (index: number) => path.join(root, "e2e", ".tmp", \`w${index}\`, "vault");` and use it in both.)

`e2e/vault/search.spec.ts`:

```ts
import { test, expect } from "../fixtures";

test("quick-find opens by shortcut and control, narrows live, and jumps to a note", async ({
  page,
}) => {
  await page.goto("/vault/");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Schnellsuche" });
  await expect(dialog).toBeVisible();

  await page.keyboard.type("hafen");
  await expect(
    page.getByRole("option", { name: "2026-08-01 Call Hafen" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Suche" }).fill("leucht");
  await expect(page.getByRole("option", { name: "Leuchtturm" })).toBeVisible();
  await page.getByRole("option", { name: "Leuchtturm" }).click();
  await expect(
    page.getByRole("heading", { name: "Leuchtturm", level: 1 }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /Suche/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Schnellsuche" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Suche" }).fill("zzzz");
  await expect(page.getByText(/Keine Treffer/)).toBeVisible();
});

test("keyboard-only: arrows plus Enter open the selection", async ({
  page,
}) => {
  await page.goto("/vault/");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("s");
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Schnellsuche" })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/\/vault\/n\//);
});
```

`e2e/vault/live.spec.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures";

/** Writes straight into this worker's vault copy, the way Obsidian would. */
test("a note written to the vault shows up without a restart", async ({
  page,
  vaultDir,
  baseURL,
}) => {
  const count = async () =>
    (
      (await (
        await page.request.get(`${baseURL}/api/vault/tree`)
      ).json()) as unknown[]
    ).length;
  const before = await count();

  mkdirSync(path.join(vaultDir, "60_Knowledge"), { recursive: true });
  writeFileSync(
    path.join(vaultDir, "60_Knowledge", "Live.md"),
    "# Live\n\nEben geschrieben, verweist auf [[Start]].\n",
  );
  // The count only ever grows here, so polling cannot alias it.
  await expect.poll(count, { timeout: 3000 }).toBe(before + 1);

  await page.goto("/vault/n/60_Knowledge/Live.md");
  await expect(
    page.getByRole("heading", { name: "Live", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Start" })).toBeVisible();
  await page.getByRole("link", { name: "Start" }).click();
  await expect(
    page
      .getByRole("region", { name: "Verweise auf diese Notiz" })
      .getByRole("link", { name: "Live" }),
  ).toBeVisible();
});

test("an edited note is re-read within seconds", async ({
  page,
  vaultDir,
  baseURL,
}) => {
  const file = path.join(vaultDir, "10_Profile", "Persona.md");
  writeFileSync(
    file,
    "---\ntags: [profile]\n---\n\n# Persona\n\nFrisch geändert.\n",
  );
  await expect
    .poll(
      async () =>
        (
          (await (
            await page.request.get(
              `${baseURL}/api/vault/note?path=10_Profile%2FPersona.md`,
            )
          ).json()) as { body: string }
        ).body,
      { timeout: 3000 },
    )
    .toContain("Frisch geändert");
  await page.goto("/vault/n/10_Profile/Persona.md");
  await expect(page.getByText("Frisch geändert.")).toBeVisible();
});
```

- [ ] **Step 4: Run, gate, commit**

Run: `cd web && npx vitest run src/vault` then `npx playwright test e2e/vault --retries=0`
Expected: PASS.

Run: `npm run format && npm run check && npm run e2e`
Expected: green.

```bash
git add -A
git commit -m "feat: quick-find over the vault and a tree that follows file changes"
```

---

### Task 9: Retire Space

**Files:**

- Delete: `web/space/`, `web/src/space/` (after moving its test setup), `server/src/space/`, `server/test/space/`, `e2e/space/`, `docs/space/`
- Move: `web/src/space/test/setup.ts` → `web/src/test/setup.ts`
- Modify: `web/vite.config.ts`, `server/src/app.ts`, `server/src/index.ts`, `server/test/rolodex/app.ts`, `server/test/vault/app.ts`, `web/src/shared/BenchNav.tsx`, `web/src/shared/BenchNav.test.tsx`, `web/src/shared/AppIcons.tsx`, `web/src/home/App.tsx`, `web/src/home/App.test.tsx`, `eslint.config.js`, `e2e/api.ts`, `e2e/smoke.spec.ts`, `e2e/theme.spec.ts`, `e2e/tools/screenshots.mjs` (delete - it was Space's walkthrough), `e2e/tools/chrome-shots.mjs`, `.jscpd.json` (if it names space), `README.md`, `AGENTS.md`, `docs/PROJECT.md`, `docs/PROCESS.md`, `docs/CONTROLS.md`, `docs/STANDARDS.md`, `e2e/EXPLORATORY.md`

**Interfaces:**

- Produces: `AppKey = "home" | "vault" | "crm" | "rolodex"`; `APPS = ["crm", "rolodex", "vault"]` in both fallbacks; `Dbs = { crm; rolodex; vault }`; the launcher lists Vault, CRM, Rolodex ("Drei Apps"); the workspace-wide vitest setup lives at `web/src/test/setup.ts`.

This is Phase 0's Task 1 and 2 again, for Space. Work the same way: failing unit tests first (nav lists four links, launcher has three cards), then the deletions, then every seam, then the docs.

- [ ] **Step 1: Failing tests** - `BenchNav.test.tsx` expects `Start, Vault, CRM, Rolodex`; `home/App.test.tsx` drops the Space row and expects `3` headings.

- [ ] **Step 2: Move the setup file** - `git mv web/src/space/test/setup.ts web/src/test/setup.ts`; in `web/vite.config.ts` set `setupFiles: ["src/test/setup.ts"]`; rewrite the file's comments so they no longer speak of Space (the `Blob.text()` polyfill is for Rolodex's import, the `fetch` stub for any component that fetches on unmount - keep both, drop the sentence about the Space editor and say "components that flush a request on unmount").

- [ ] **Step 3: Delete** - `git rm -r -q web/space web/src/space server/src/space server/test/space e2e/space docs/space e2e/tools/screenshots.mjs`.

- [ ] **Step 4: Every seam** - `web/vite.config.ts` (`APPS`, `rollupOptions.input`); `server/src/app.ts` (`Dbs`, import, mount, `APPS`); `server/src/index.ts` (imports, the two space lines, the `createApp` call); `server/test/rolodex/app.ts` and `server/test/vault/app.ts` (drop the space db); `BenchNav.tsx` (import, union, entry); `AppIcons.tsx` (`IconSpace`); `home/App.tsx` (import, card, lede back to "Drei Apps"); `eslint.config.js` (both arrays `["crm", "rolodex", "vault"]`); `e2e/api.ts` (delete `savedBlockTexts`, the `Space*` interfaces and the `TreeNode` type if only Space used them - check with grep, keep `json`, `Deal`, `Organization`, `Contact`); `e2e/smoke.spec.ts` (drop the space `APPS` entry, the `/space/p/…` deep link, "Space" in the launcher loop and nav lists and the nav-reaches tuple, the `/api/space/tree` block and its `/api/tree` 404 check, and replace the stylesheet test's Space half: compare `page.locator("nav.sidebar")` background on `/vault/` with `body` on `/rolodex/` - `#f2f4f6`/`#1c2128` against `#f5f5f7`/`#14171c`, different in both themes); `e2e/theme.spec.ts` (`APPS` without `/space/`); `e2e/tools/chrome-shots.mjs` (paths without `/space/`); `.jscpd.json` (nothing to do unless it names space).

- [ ] **Step 5: The docs** - `README.md` (table row, any "four"), `AGENTS.md` (the app list), `docs/PROJECT.md` (app table, detailed-docs table, layout block: `vault/index.html`, `src/vault/`, `test/{crm,rolodex,vault}/`, `data/` names `crm.sqlite, rolodex.sqlite, vault.sqlite`; "Three SQLite files" stays true; the "Multi-page" bullet's example classes; "Router basenames" now `crm` and `vault`; the API namespaces bullet), `docs/PROCESS.md` (docs list `[vault/]`, e2e layout `crm/`, `rolodex/`, `vault/`, `theme.spec.ts`; the dnd bullet mentions Space's board - keep Rolodex's circles only; "Space's board drag is the standing example" → "Rolodex's circle drag is the standing example"; `web/src/space/test/setup.ts` → `web/src/test/setup.ts`), `docs/CONTROLS.md` (coverage rows for `web/src/space` removed - Task 10 refreshes the numbers; "The largest remaining hole is Space's `BoardView`" removed; every `web/src/space/test/setup.ts` → `web/src/test/setup.ts`; the dnd-kit bullet keeps Rolodex only), `docs/STANDARDS.md` ("or `lucide-react` in Space" → "or `lucide-react` in Vault and Rolodex" after confirming Rolodex imports it - if not, "in Vault"), `e2e/EXPLORATORY.md` (delete the Space section; "Space light/dark" in Cross-app → "Vault light/dark").

- [ ] **Step 6: Leftovers, gate, commit**

Run: `grep -rni "space\b\|personal-space\|/space/" --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' --include='*.html' --include='*.css' --include='*.md' . | grep -v node_modules | grep -v package-lock | grep -v docs/changes/bench-os | grep -vi "whitespace\|namespace\|workspace\|spaces\|space-"`
Expected: no output (the word appears legitimately in "workspace", "namespace", "whitespace" and CSS `white-space` - the grep excludes those).

Run: `npm run format && npm run check && npm run e2e`
Expected: green. knip may report a dependency only Space used - remove it with `npm uninstall <name> -w web` and re-run. Web coverage must stay ≥ 80 %.

Delete the stale database on this machine, since nothing opens it any more: `rm -f data/personal-space.db*`.

```bash
git add -A
git commit -m "refactor: retire Space now that Vault reads the notes"
```

---

### Task 10: Docs for the Vault app and the carry-over sweep

**Files:**

- Create: `docs/vault/REQUIREMENTS.md`, `docs/vault/IMPLEMENTATION.md`
- Modify: `web/src/shared/BenchNav.tsx`, `web/src/shared/BenchNav.test.tsx`, `docs/PROJECT.md`, `README.md`, `docs/PROCESS.md`, `docs/CONTROLS.md`, `docs/STANDARDS.md`, `e2e/EXPLORATORY.md`

- [ ] **Step 0: Carry-over code** - in `BenchNav.tsx` hoist the theme button's label into `const switchLabel = theme === "dark" ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln";` and use it for both `aria-label` and `title`; add `lang="de"` to the `<nav>` element (the CRM and Rolodex documents stay `lang="en"`, the strip inside them is German). Add one assertion to `BenchNav.test.tsx`: `expect(screen.getByRole("navigation", { name: "Primary" })).toHaveAttribute("lang", "de");`.

- [ ] **Step 1: `docs/vault/REQUIREMENTS.md`** - the brief, in the style of `docs/rolodex/REQUIREMENTS.md`'s opening note: the Phase 1 section of `docs/changes/bench-os/PLAN.md` plus the Vault row of `SPEC.md`, marked as **complete** history once Task 11 passes. Sections: Summary (read-only window on an Obsidian vault), The product (tree, notes, wikilinks, backlinks, tags, quick-find, open in Obsidian, raw view, live index), Not in scope (editing, tasks UI - Phase 3 -, canvas files, graph), Success criteria (the six from PLAN.md Phase 1).

- [ ] **Step 2: `docs/vault/IMPLEMENTATION.md`** - how it is built, in the style of `docs/rolodex/IMPLEMENTATION.md`: layout (`server/src/vault/{db,locate,watch}.ts`, `index/`, `routes/`, `fixture/`; `web/src/vault/`), data model (the five tables, what is derived, "rebuild = delete `data/vault.sqlite`"), the indexer (frontmatter via gray-matter - dates arrive as ISO strings after the JSON round trip; links stored unresolved then `resolveLinks`; the resolution rule; tasks grammar; code fences blanked line-for-line), the watcher (chokidar, `awaitWriteFinish`, dot-folders ignored, `resolveLinks` after every event), the API (five routes and their shapes; FTS query quoting; bm25 weights; `/file` path guard), the web app (routes `/` and `/n/*`, splat decoding, `prepareMarkdown`, `resolveAsset`, `Link` for in-app hrefs, tree from the flat list, expanded folders in `localStorage` under `vault.expanded`, tree refetch on focus, `obsidian://` link), configuration (`VAULT_DIR`, `BENCH_DOTENV`, the bundled sample, `locateVault`), tests (unit against a temp copy of the fixture; e2e with a per-worker copy and `expect.poll` on growing counts), and "Things that will bite" (an Obsidian vault name is its folder name; `.md` links resolve by basename so two notes with one name are ambiguous - same folder wins; FTS prefix terms; the fixture is asserted by tests - change both; the watcher needs `ready` in tests; the real vault's `.superpowers` and `.claude` folders are skipped by the dot rule).

- [ ] **Step 3: PROJECT.md, README, AGENTS** - Vault rows in the app table and the detailed-docs table (`vault/IMPLEMENTATION.md`, `vault/REQUIREMENTS.md`); in "Bench OS decisions" add `- **The vault index is derived.** \`data/vault.sqlite\` can be deleted at any time; the next start rebuilds it from the markdown.`; README's top table and 1.5 ("Point Bench at your vault: … Without it Bench shows a small sample vault."); AGENTS.md's app list.

- [ ] **Step 4: The carry-over sweep** - one `docs:` commit: the five passages naming the upstream author as the one who pushes (`docs/PROCESS.md` gate paragraph, `docs/STANDARDS.md` "publishing is still Ed's call", `docs/CONTROLS.md` Prettier table row, Branching section twice) → "the user"; README's fork/PR walkthrough (sections 1.2, 3.4, 3.5, 3.6) rewritten for this fork: the repository is `manufarbkontrast/bench`, pull requests target its own `main`, Actions must be enabled once; `docs/PROCESS.md` e2e layout names `crm/`, `rolodex/`, `vault/` and `theme.spec.ts`; `e2e/EXPLORATORY.md:4` drops "audio"; `docs/CONTROLS.md` coverage table refreshed from `npm run coverage` (and `docs/PROCESS.md`'s coverage sentence with it); `.env.example` gains nothing (still one key) but its comment says "More keys arrive with the apps that read them (Plaud, project roots, controlling, inbox)." - already true, leave it.

- [ ] **Step 5: Gate and commit**

Run: `grep -rn "Ed's\|Ed pushes\|Ed creates\|Ed, in\|ed-donner" README.md AGENTS.md docs/*.md e2e/EXPLORATORY.md`
Expected: only `docs/PROJECT.md`'s history sentence and `docs/changes/` (excluded above anyway) - README may keep one line saying the fork's origin.

Run: `npm run format && npm run check && npm run e2e`
Expected: green.

```bash
git add -A
git commit -m "docs: the Vault app, and the working documents for this fork"
```

(Two commits are fine: `docs: describe the Vault app` for Steps 1-3 and `docs: point the working documents at this fork` for Step 4, with `refactor: one label for the theme toggle and lang on the strip` for Step 0.)

---

### Task 11: Final gate, screenshots, criteria

**Files:**

- Modify: `e2e/EXPLORATORY.md` (Vault section)

- [ ] **Step 1: Measure the real vault** - with `.env` in place: `cd server && VAULT_DIR="$(grep '^VAULT_DIR=' ../.env | cut -d= -f2-)" npx tsx -e 'import { openDb } from "./src/vault/db.js"; import { indexAll } from "./src/vault/index/indexer.js"; const db = openDb(":memory:"); console.time("index"); console.log(indexAll(db, process.env.VAULT_DIR)); console.timeEnd("index");'`
      Expected: about 77 notes, a few hundred links, a couple of dozen tasks, well under 2000 ms. Record the numbers in the report.

- [ ] **Step 2: Ten notes by hand** - `npm run dev`, open http://localhost:8101/vault/. Pick ten notes across folders (the tree is the list); for each, open it, compare the rendered links with the `[[...]]` in its raw view (the "Rohtext" button), click two links, check the backlinks section against a `grep -rl "\[\[<name>" <vault>` run in the shell. Note umlauts in file names and callouts. Record each note and what you saw. Stop the dev server.

- [ ] **Step 3: Screenshots** - `npm start` in the background, `node e2e/tools/chrome-shots.mjs`, kill the server (`pkill -f "tsx src/index.ts"; pkill -f "npm start"`). Eight images now (`start`, `vault`, `crm`, `rolodex` × two themes): the strip, the tree, a rendered note, both themes legible. Look at each with the Read tool.

- [ ] **Step 4: EXPLORATORY.md** - add a `## Vault` section: what the suite asserts (tree, links, backlinks, search, live index) and what it cannot (rendering fidelity of your own notes - tables, callouts, long pages; whether `obsidian://` actually opens Obsidian; the feel of the tree with 70+ notes).

- [ ] **Step 5: The gate** - `npm run format && npm run check && npm run e2e`, green.

- [ ] **Step 6: Commit and report** - `git commit -m "docs: exploratory notes for the Vault app"`. Report, per Phase 1 success criterion in `docs/changes/bench-os/PLAN.md`: met / not met / needs the user, with the evidence (timings, the ten notes, spec counts, coverage). Do not push.
