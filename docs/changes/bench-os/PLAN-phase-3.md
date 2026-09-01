# Bench OS Phase 3 - Aufgaben and Cockpit - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Aufgaben app over the vault's tasks (writable through two guarded line edits), the
Plaud work items (importable into the vault with a ledger) and GitHub issues (read-only), plus a
Cockpit that replaces the launcher at `/`.

**Architecture:** The vault app gains the only write path Bench has: `PATCH`/`POST
/api/vault/tasks` edit exactly one line (or append one) in a note, guarded by raw-line equality
(409 on mismatch), written atomically, reindexed synchronously. `server/src/aufgaben/` owns the
Plaud parser over `PLAUD_HOME/notizen`, the import ledger in `data/aufgaben.sqlite`, topic
mapping and dedup; it reads the vault index through the handle the composition root already
holds and imports vault modules one-way (documented exception, like `projekte`). The web app at
`/aufgaben` follows the Projekte app's shape. The Cockpit rewrites `web/src/home/` in place -
same document, same route, panels instead of cards.

**Tech Stack:** Express 5, better-sqlite3 12, gray-matter (already a dependency), `node:crypto`
for row hashes, the `gh` CLI as a local process, Vite 8 + React 19. **No new dependency.**

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every
  shell. TypeScript `6.0.3` exactly; better-sqlite3 `12`; **no new dependencies at all.**
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task
  touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or the fixtures. Coverage
  stays at or above 80 % statements per workspace; nothing is loosened. Every command runs in
  the foreground with a generous timeout. **A run auto-backgrounded at 180 s is polled to
  completion** - never wait for a notification, never re-run blindly. If a coverage run flakes
  on an unrelated test under load (the known `watch.test.ts` case), retry with `--maxWorkers=2` -
  an operational flag, never a config change.
- Focused tests: `cd server && npx vitest run test/aufgaben test/vault` /
  `cd web && npx vitest run src/aufgaben src/home` - never `-w` (vitest's watch flag).
- ESLint limits: 500 lines a file, 200 a function, complexity 15, depth 4, 5 parameters. No
  `any`. No emoji in code, comments or commits (emoji arriving as _data_ - a task's raw line, a
  recurrence string - may pass through and render). Comments say why. No super-linear regexes -
  hand-rolled scanners, see `server/src/vault/index/tasks.ts` for the house pattern.
- Immutable data: build new objects, never mutate (a local index accumulator or test scaffolding
  may hold a `let`).
- **The two write paths, and nothing else.** Bench writes into the vault only through
  `server/src/vault/write.ts`: the one-line toggle and the one-line append. Every write checks
  its precondition, goes through tmp+rename in the note's own directory, and reindexes the note
  synchronously. `PLAUD_HOME` is never written. `data/aufgaben.sqlite` holds only the import
  ledger - Bench-own metadata, deliberately not in the rebuildable `vault.sqlite`.
- `gh` never runs in tests or e2e: unit tests inject a fake runner; the e2e servers already set
  `BENCH_GH=off`. Real `gh` runs only on a developer machine and in Task 11.
- Machine paths and real note content never appear in tracked files. The Plaud fixture note is
  synthetic, `example.com`-grade content, English commit subjects stay English.
- German UI strings exactly as written in the tasks; identifiers, comments, docs and commits
  English. Commit messages: Conventional Commits, one line, imperative. Never push. Branch
  `bench-os-phase-3`, cut from `bench-os-phase-2` at 9244561.
- The task exclusion list (`50_Workflow`, `Templates`, `90_Archive` - a path segment equal to
  one of these) applies in the aufgaben queries and the Cockpit panels, **not** in the indexer:
  the vault app still shows those notes; their tasks just do not count as work.

---

### Task 0: Setup

Controller work, no subagent: branch `bench-os-phase-3` exists (cut from `bench-os-phase-2` at
9244561), this plan is committed as `docs: the phase 3 plan`, the SDD ledger is initialised at
`.superpowers/sdd/PLAN-phase-3/progress.md`.

---

### Task 1: PLAUD_HOME configuration and the Plaud fixture note

**Files:**

- Modify: `server/src/config.ts`, `.env.example`, `e2e/fixtures.ts`, `server/vitest.config.ts`
  (coverage exclude gains `src/aufgaben/fixture/**`)
- Create: `server/src/aufgaben/locate.ts`,
  `server/src/aufgaben/fixture/notizen/2026-08-20_hafenrunde.md`
- Test: `server/test/config.test.ts` (extend), `server/test/aufgaben/locate.test.ts`

**Interfaces:**

- Consumes: `Config`, `configFrom`, `describeSources` from `server/src/config.ts`; `scratchDir`
  from `server/test/projekte/tmp.ts` may be copied, not imported (apps stay separate - a
  10-line duplicate in `server/test/aufgaben/tmp.ts` beats a cross-app import).
- Produces: `Config.plaudHome?: string` (tilde-expanded);
  `locatePlaud(config: Pick<Config, "plaudHome">, fixtureDir: string): { dir: string; source: "configured" | "sample"; missing?: string }`
  - configured means `<plaudHome>/notizen` exists; otherwise the bundled fixture directory is
    used directly (read-only, so no per-worker copy is needed - unlike the vault).

**The fixture note** - synthetic, exactly the processed-Plaud shape, themed to the fixture
vault. Exactly **4 rows** in Arbeitsaufträge; the first row deliberately overlaps the existing
fixture task `Spezifikation schreiben` in `30_Projekte/Leuchtturm/Leuchtturm.md` so the dedup
suggestion has a testable hit; the first row also carries a real date so the `📅` mapping has
one:

```markdown
---
titel: 08-20 Besprechung: Hafenrunde und Leuchtturm-Ausbau
datum: 2026-08-20
teilnehmer: [Jonas]
quelle: 08-20_Besprechung_Hafenrunde-transcript.pdf
zeitmarken: verfügbar
---

# Hafenrunde und Leuchtturm-Ausbau

## Kurzfassung

Jonas fasst die Hafenrunde zusammen. Der Ausbau des Leuchtturms folgt dem Plan aus dem
Frühjahr; die Werkstatt wird vor dem Winter vorbereitet. Eine Lampe ist zu bestellen, der
Prototyp im Hafen zu testen.

## Entscheidungen

- **Der Ausbau folgt dem Plan aus dem Frühjahr** `[00:01:10]`

## Arbeitsaufträge

| Wer       | Was                                                   | Bis wann   | Zeitmarke    |
| --------- | ----------------------------------------------------- | ---------- | ------------ |
| Jonas     | Die Spezifikation für den Leuchtturm-Ausbau schreiben | 2026-09-05 | `[00:01:10]` |
| ungeklärt | Das Material für die neue Lampe bestellen             | offen      | `[00:02:40]` |
| ungeklärt | Den Prototyp im Hafen testen                          | offen      | `[00:02:40]` |
| Jonas     | Die Werkstatt für den Winter vorbereiten              | offen      | `[00:03:15]` |

## Offene Fragen

- Welche Lampe genau gemeint ist `[00:02:40]`
- Ob der Hafen im Oktober frei ist `[00:03:15]`

## Zahlen und Fakten

- „Drei Wochen für den Ausbau." `[00:01:10]`

## Unsicher verstanden

- Ob „die Werkstatt" die große oder die kleine meint - beide kommen im Gespräch vor.

## Direkt erledigbar

- Den Plan aus dem Frühjahr heraussuchen und neben die Notiz legen.
```

- [ ] **Step 1: Failing tests.** Extend `server/test/config.test.ts` with three cases:
      `PLAUD_HOME` unset -> `plaudHome` undefined; `PLAUD_HOME="~/Plaud"` -> expanded against
      `os.homedir()`; `describeSources` includes `Plaud: not configured` when unset and
      `Plaud: configured` when set (the log never prints the machine path - same rule as the
      Projekte line). `server/test/aufgaben/locate.test.ts` (with its own `tmp.ts` copy of
      `scratchDir`):

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { locatePlaud } from "../../src/aufgaben/locate.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-plaud-locate-");
afterAll(scratch.cleanup);

describe("locatePlaud", () => {
  it("uses <plaudHome>/notizen when it exists", () => {
    const home = path.join(scratch.dir, "plaud");
    mkdirSync(path.join(home, "notizen"), { recursive: true });
    expect(locatePlaud({ plaudHome: home }, "/fixture")).toEqual({
      dir: path.join(home, "notizen"),
      source: "configured",
    });
  });
  it("falls back to the fixture when the home is missing", () => {
    const gone = path.join(scratch.dir, "gone");
    expect(locatePlaud({ plaudHome: gone }, "/fixture")).toEqual({
      dir: "/fixture",
      source: "sample",
      missing: gone,
    });
  });
  it("falls back to the fixture when nothing is configured", () => {
    expect(locatePlaud({}, "/fixture")).toEqual({
      dir: "/fixture",
      source: "sample",
    });
  });
});
```

- [ ] **Step 2: Run the new suites, watch them fail.**
- [ ] **Step 3: Implement.** `config.ts`: `plaudHome: optional(env.PLAUD_HOME)` mapped through
      `expandTilde`; `describeSources` appends
      `` `Plaud: ${config.plaudHome ? "configured" : "not configured"}` ``. `locate.ts` mirrors
      `server/src/vault/locate.ts`'s shape. `.env.example` appends below `PROJECT_ROOTS`:

```
# The Plaud folder; Bench reads processed notes from <PLAUD_HOME>/notizen, e.g. ~/Plaud
PLAUD_HOME=
```

`e2e/fixtures.ts`: the per-worker env gains `PLAUD_HOME: ""` with the same comment rationale as
`PROJECT_ROOTS: ""` (a shell export would otherwise flip every worker onto the real machine).
Write the fixture note exactly as above.

- [ ] **Step 4: Suites green** (`cd server && npx vitest run test/aufgaben test/config.test.ts`),
      then `npm run format && npm run check && npm run e2e` (fixtures changed).
- [ ] **Step 5: Commit** - `feat: plaud home configuration with a bundled sample note`

---

### Task 2: The vault task write path - toggle and create with the 409 guard

**Files:**

- Create: `server/src/vault/write.ts`, `server/src/vault/routes/tasks.ts`
- Modify: `server/src/vault/routes/index.ts` (mount), `server/src/vault/db.ts` (the header
  comment "the vault itself is never written by this app" is no longer true - reword to name
  the two guarded line edits in `write.ts` as the only exceptions)
- Test: `server/test/vault/write.test.ts`, `server/test/vault/tasks-routes.test.ts` (supertest,
  following the existing vault route tests' pattern)

**Interfaces:**

- Consumes: `splitNote` from `vault/index/frontmatter.ts`, `indexNote`, `resolveLinks` from
  `vault/index/indexer.ts`, `VaultContext`.
- Produces (all exported from `write.ts`):
  - `todayISO(now?: Date): string` - local time, `YYYY-MM-DD`.
  - `toggledLine(raw: string, today: string): string | null` - null when the line is not a task.
  - `toggleTask(vaultDir: string, db: Database, relPath: string, line: number, raw: string, today?: string): WriteResult`
  - `appendTask(vaultDir: string, db: Database, targetPath: string, taskLine: string): { line: number; raw: string }`
    - `line` is the 1-based **file** line the new task landed on.
  - `WriteResult = { ok: true; line: number; raw: string } | { ok: false; current: string | null }`
  - `TASK_INBOX = "00_Index/Task_Inbox.md"` (exported - Task 5's import route and Task 6's UI
    both need the name).
- Routes on the vault router: `PATCH /api/vault/tasks` body `{ path, line, raw }` -> 200
  `{ line, raw }` (the new raw) or **409** `{ error: "conflict" }`; `POST /api/vault/tasks`
  body `{ path?, text, due?, priority? }` -> 201 `{ path, line, raw }`.

**Semantics, exact:**

- `tasks.line` counts inside the frontmatter-stripped body (that is what `extractTasks` saw),
  so the file line is `text.split("\n").length - body.split("\n").length + line` - computed
  with the **same** `splitNote` the indexer used, which is what makes the offset always agree.
- Toggle open -> done: `- [ ]` becomes `- [x]` and ` ✅ <today>` is appended to the line - the
  Tasks-plugin convention. Done -> open: the checkbox reverts and the one `✅ YYYY-MM-DD` field
  is removed. Recurrence is **not** computed - toggling a `🔁` task completes that line and
  nothing else; Obsidian Tasks owns the next occurrence. Documented, deliberate.
- On raw mismatch the write is refused, **and the note is reindexed before replying** - the 409
  means "the file moved on", so the client's follow-up fetch must see the file as it is now.
- Atomic write: tmp file `.bench-write-<basename>` in the note's own directory, then rename.
  The dot name is inside the watcher's ignore rule, so the half-written file is never indexed;
  the rename lands as one change event.
- After a successful write: `indexNote` + `resolveLinks` synchronously, so the UI's immediate
  refetch is fresh; the watcher event that follows re-indexes idempotently.
- `POST` validation: `text` non-empty; `due` must match `YYYY-MM-DD` when present; `priority`
  one of `highest|high|medium|low|lowest` when present; `path` defaults to `TASK_INBOX`. The
  target must resolve inside the vault (mirror the dot-segment guard in
  `vault/routes/files.ts`) and must be an indexed note - except `TASK_INBOX`, which is created
  on demand with exactly:

```markdown
---
tags: [inbox, tasks]
---

# Task_Inbox

## Aufgaben
```

- The task line is built as `- [ ] <text>`, then the priority emoji (`🔺⏫🔼🔽⏬`), then
  `📅 <due>` - each only when present. Append under the `## Aufgaben` heading: after the last
  non-empty line of that section (section ends at the next `## ` or EOF); when the heading is
  missing, append `\n## Aufgaben\n` plus the line at the end of the file.

**Implementation sketch** (`write.ts` core):

```ts
const TASK_LINE = /^(\s*[-*+] \[)([ xX])(\] )(.*)$/;
const DONE_FIELD = /\s*✅\s*\d{4}-\d{2}-\d{2}/;

export function toggledLine(raw: string, today: string): string | null {
  const m = TASK_LINE.exec(raw);
  if (!m) return null;
  if (m[2] === " ") return `${m[1]}x${m[3]}${m[4]} ✅ ${today}`;
  return `${m[1]} ${m[3]}${m[4].replace(DONE_FIELD, "")}`;
}

function bodyOffset(text: string): number {
  const { body } = splitNote(text);
  return text.split("\n").length - body.split("\n").length;
}

function atomicWrite(file: string, content: string): void {
  const tmp = path.join(
    path.dirname(file),
    `.bench-write-${path.basename(file)}`,
  );
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}
```

- [ ] **Step 1: Failing tests.** `write.test.ts` builds a scratch vault (copy two fixture notes
      or write minimal ones) plus an in-memory db indexed with `indexNote`:
  - `toggledLine`: open with fields -> done keeps every field and appends `✅ <today>`; done ->
    open removes exactly the `✅` field; a non-task line -> null; `[X]` uppercase handled.
  - `toggleTask` on a note **with frontmatter**: the file line moved by the frontmatter offset
    is the one edited (assert on the file text, not just the db); the db row flips `done` and
    gains `done_at` without a watcher.
  - Conflict: edit the file line first, then `toggleTask` with the stale raw -> `{ ok: false }`,
    file unchanged, **db now reflects the edited file** (the reindex-on-409 rule).
  - `appendTask` into an existing note with `## Aufgaben` -> the line lands after the section's
    last non-empty line; into a note without the heading -> heading appended; into the missing
    `TASK_INBOX` -> file created with the exact template and the task under the heading;
    returned `line` matches where the raw sits in the file (1-based).
  - `tasks-routes.test.ts`: PATCH happy path 200; stale raw 409 `{ error: "conflict" }`;
    unknown path 404; POST default target creates the inbox, 201 carries `{ path, line, raw }`;
    bad `due` 400; a `path` with `..` segments 400.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement** as sketched; routes follow `notesRouter`'s error idiom
      (`{ error: "..." }`, English).
- [ ] **Step 4: Suites green, full gate** (server-only: no e2e needed).
- [ ] **Step 5: Commit** - `feat: guarded task toggle and create on the vault API`

---

### Task 3: The Plaud note parser

**Files:**

- Create: `server/src/aufgaben/plaud.ts`
- Test: `server/test/aufgaben/plaud.test.ts`

**Interfaces:**

- Consumes: the fixture note from Task 1; `matter` from gray-matter (direct import - the vault's
  `splitNote` is markdown-note-specific and this is not a vault note).
- Produces:
  - `PlaudItem { rowHash: string; wer: string; was: string; bis: string; zeitmarke: string }`
  - `PlaudNote { file: string; title: string; date: string | null; source: string | null; items: PlaudItem[]; openQuestions: string[]; direct: string[] }`
  - `parsePlaudNote(file: string, text: string): PlaudNote`
  - `listPlaudNotes(dir: string): string[]` - `.md` basenames, sorted descending (newest first
    by the date-prefixed naming convention); an unreadable dir returns `[]`.
  - `rowHash` = sha256 hex (node:crypto) of `` `${wer}|${was}|${bis}` `` - stable across
    re-parses, changes when the note's row changes, which correctly re-opens the import.

**Parsing rules, exact:** frontmatter via gray-matter (`titel` -> title, falling back to the
first `# ` heading, falling back to the filename; `datum` -> date as written, `quelle` ->
source). Sections are located by exact `## <Name>` headings. The Arbeitsaufträge table is
scanned line by line (hand-rolled, no regex): a row is a line starting with `|`; the header row
and the `|---|`-style separator are skipped; cells are split on `|`, trimmed, surrounding
backticks stripped from the Zeitmarke; a row with fewer than 4 cells is skipped. `Offene
Fragen` and `Direkt erledigbar` collect `- ` bullets as plain strings (timestamps left in).
A note without an Arbeitsaufträge section parses to `items: []` - never a throw.

- [ ] **Step 1: Failing tests.** Parse the real fixture file
      (`readFileSync` from `server/src/aufgaben/fixture/notizen/`): title, date `2026-08-20`,
      source ends `-transcript.pdf`, exactly 4 items in document order, first item
      `{ wer: "Jonas", was: "Die Spezifikation für den Leuchtturm-Ausbau schreiben", bis: "2026-09-05", zeitmarke: "[00:01:10]" }`,
      2 open questions, 1 direct item, all four `rowHash`es distinct and 64 hex chars. Edge
      cases from literals: missing section -> empty items; a malformed 2-cell row skipped; no
      frontmatter -> title from `# ` heading; `listPlaudNotes` on the fixture dir -> the one
      file; on a missing dir -> `[]`.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate.**
- [ ] **Step 5: Commit** - `feat: parse work items from processed plaud notes`

---

### Task 4: The import ledger, topic mapping and dedup

**Files:**

- Create: `server/src/aufgaben/db.ts`, `server/src/aufgaben/mapping.ts`,
  `server/src/aufgaben/dedup.ts`
- Test: `server/test/aufgaben/db.test.ts`, `server/test/aufgaben/mapping.test.ts`,
  `server/test/aufgaben/dedup.test.ts`

**Interfaces:**

- Consumes: the vault db schema (`notes`, `tasks`) - tests insert rows directly, as
  `server/test/projekte/couple.test.ts` does.
- Produces:
  - `openAufgabenDb(file: string): Database` - WAL, one table:

```sql
CREATE TABLE IF NOT EXISTS task_imports (
  source_file TEXT NOT NULL,
  row_hash TEXT NOT NULL,
  target_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (source_file, row_hash)
);
```

- `ImportRow` (camelCase mirror), `recordImport(db, row)`, `findImport(db, sourceFile, rowHash): ImportRow | null`,
  `listImports(db, sourceFile): ImportRow[]`.
- `suggestTarget(noteText: string, vaultDb: Database): string` in `mapping.ts` - the first
  rule whose keyword appears in the lowercased note text **as a whole word** (multi-word
  keywords match as lowercased substrings) _and_ whose target path is in the notes index;
  otherwise `TASK_INBOX`. The rules, hard-coded and documented as this user's vault
  conventions (from the `aufgaben-import` skill, with the ÆND row widened so the artist-
  and release-language of its meeting notes maps without the brand name being spoken):

```ts
const RULES: { keywords: string[]; target: string }[] = [
  {
    keywords: [
      "ænd",
      "aend",
      "merch",
      "merchscene",
      "artist",
      "artists",
      "release",
      "releases",
      "tier",
    ],
    target: "30_Projekte/AEND/Merch.md",
  },
  {
    keywords: ["shoes please", "spz"],
    target: "20_Brands/Shoes_Please/Shoes_Please.md",
  },
  {
    keywords: ["machu", "machupicyou"],
    target: "20_Brands/Machu/Machu.md",
  },
  {
    keywords: [
      "automatisierung",
      "agent",
      "agents",
      "dashboard",
      "dashboards",
      "claude",
      "bench",
    ],
    target: "30_Projekte/KI_Automatisierung/Rollout_Plan.md",
  },
];
```

- `findExisting(vaultDb: Database, was: string): { path: string; line: number; text: string } | null`
  in `dedup.ts` - significant words of `was` (lowercased, split on non-letters with umlauts
  kept, length >= 4); against every **open** task's `text` the overlap
  `|intersection| / |importWords|` is computed; the best candidate at or above **0.5** wins,
  ties by path then line; below the threshold, null.

- [ ] **Step 1: Failing tests.** `db.test.ts`: record + find round-trip, camelCase mapping,
      double `recordImport` with the same key throws (the PK is the guard), `findImport` misses
      -> null. `mapping.test.ts` (in-memory vault db with the four target notes inserted):
      text naming `Artists` and `Releases` -> the Merch note; `SPZ` -> Shoes Please; a target
      missing from the index -> falls through to the next rule or `TASK_INBOX`; no keyword ->
      `TASK_INBOX`; "Musik" does **not** match the whole-word rule for any keyword.
      `dedup.test.ts` (vault db with tasks inserted): the fixture pairing - was
      `Die Spezifikation für den Leuchtturm-Ausbau schreiben` vs an open task
      `Spezifikation schreiben` -> hit (2 of 4 words); a done task never matches; an unrelated
      was -> null; short words (`die`, `für`, `den`) never count.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate.**
- [ ] **Step 5: Commit** - `feat: import ledger, topic mapping and dedup for plaud items`

---

### Task 5: The aufgaben API and the server wiring

**Files:**

- Create: `server/src/aufgaben/gh.ts`, `server/src/aufgaben/tasks.ts`,
  `server/src/aufgaben/routes.ts`
- Modify: `server/src/app.ts` (mount `/api/aufgaben`, `Dbs.aufgaben`, the `githubLabels`
  getter built from `listProjects`), `server/src/index.ts` (open `data/aufgaben.sqlite`,
  `locatePlaud`, context, one startup line)
- Test: `server/test/aufgaben/gh.test.ts`, `server/test/aufgaben/tasks.test.ts`,
  `server/test/aufgaben/routes.test.ts` (+ a small `server/test/aufgaben/app.ts` harness like
  the projekte one)

**Interfaces:**

- Consumes: Tasks 1-4; `VaultContext`; `toggleTask`/`appendTask`/`TASK_INBOX` from
  `vault/write.ts`; `listProjects` from `projekte/db.ts` **only in `app.ts`/`index.ts`** (the
  composition root wires the two apps; `server/src/aufgaben/` never imports
  `server/src/projekte/`).
- Produces:
  - `GhRunner = (args: string[]) => Promise<string>` and `realGh` in `aufgaben/gh.ts` - a
    deliberate small duplicate of projekte's (cross-app imports stay banned);
    `fetchIssues(run: GhRunner, label: string): Promise<Issue[] | null>` via
    `run(["issue", "list", "-R", label, "--state", "open", "--json", "number,title,url,labels", "--limit", "200"])`
    - null on any failure, `Issue { number, title, url, labels: string[] }`.
  - `AufgabenContext { ledger: Database; plaud: { dir: string; source: "configured" | "sample" }; gh: GhRunner | "off"; githubLabels: () => string[] }`
    as `Dbs.aufgaben`.
  - `EXCLUDED = new Set(["50_Workflow", "Templates", "90_Archive"])` and
    `listTasks(vaultDb): AufgabenTask[]` in `aufgaben/tasks.ts` - every task row joined with
    its note title and the note's first `brand/` tag (prefix stripped), rows whose path has an
    excluded segment dropped;
    `AufgabenTask { path, line, raw, text, done, due, scheduled, start, priority, recurrence, doneAt, noteTitle, brand }`.
  - Routes under `/api/aufgaben` (router takes `(ctx: AufgabenContext, vault: VaultContext)`):
    - `GET /tasks` -> `{ tasks: AufgabenTask[] }`
    - `GET /plaud` -> `{ source, notes: PlaudNoteReply[] }` where each item additionally
      carries `imported: { targetPath, line } | null` (ledger), `existing` (dedup) and
      `suggestedTarget` (mapping, computed against the note's full text).
    - `POST /import` body `{ file, rowHash, targetPath }` -> 201
      `{ targetPath, line, raw }`; 404 when the file or row is gone; **409**
      `{ error: "already imported" }` when the ledger has the key; 400 when `targetPath` is
      neither an indexed note nor `TASK_INBOX`. The task line is
      `` `- [ ] ${was}${bis matches YYYY-MM-DD ? ` 📅 ${bis}` : ""} (aus [[${file basename without .md}]])` ``,
      appended via `appendTask`, then the ledger row is recorded - in that order, so a failed
      write never leaves a ledger entry.
    - `GET /issues` -> `{ source: "gh" | "off", repos: { label: string; issues: Issue[] | null }[] }`
      - one entry per distinct label from `githubLabels()`, all fetched in parallel; `"off"`
        short-circuits to `repos: []`.
- Startup log line: `` `Aufgaben: plaud ${source}, ledger ${n} imports` ``.

- [ ] **Step 1: Failing tests.** `gh.test.ts`: canned JSON -> issues parsed; a throwing runner
      -> null; junk JSON -> null. `tasks.test.ts`: in-memory vault db seeded with notes+tags+
      tasks - a task in `50_Workflow/Testing.md` is dropped, a task in a note tagged
      `brand/nordlicht` carries `brand: "nordlicht"`, one without stays null. `routes.test.ts`
      via the harness (a scratch vault dir built from the fixture vault + a scratch ledger):
      `GET /tasks` excludes the `50_Workflow` fixture task and includes the Leuchtturm ones;
      `GET /plaud` lists the fixture note with 4 items, `imported` all null, the first item's
      `existing` naming the Leuchtturm task, `suggestedTarget` = `TASK_INBOX` (the fixture note
      matches no rule); `POST /import` with the default target creates the inbox file, returns
      the raw containing ` (aus [[2026-08-20_hafenrunde]])` and ` 📅 2026-09-05` for row 1;
      a second identical POST -> 409 and the inbox file contains the line exactly once;
      `GET /plaud` afterwards shows `imported` set; `GET /issues` with a fake runner and two
      labels -> both fetched; with `"off"` -> `{ source: "off", repos: [] }`.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement**, wiring `index.ts` like the projekte block: open the ledger db,
      `locatePlaud(config, path.join(root, "server", "src", "aufgaben", "fixture", "notizen"))`,
      `gh: process.env.BENCH_GH === "off" ? "off" : realGh`.
- [ ] **Step 4: Suites green, full gate including e2e** (app.ts/index.ts changed).
- [ ] **Step 5: Commit** - `feat: the aufgaben API with plaud import and gh issues`

---

### Task 6: The Aufgaben app shell and the task views

**Files:**

- Create: `web/aufgaben/index.html`,
  `web/src/aufgaben/{main.tsx,App.tsx,api.ts,types.ts,format.ts,styles.css}`,
  `web/src/aufgaben/components/{TaskList.tsx,CreateForm.tsx}`
- Modify: `web/vite.config.ts` (rollup input `aufgaben`, appFallback APPS),
  `server/src/app.ts` APPS (verify both lists agree), `web/src/shared/AppIcons.tsx`
  (IconAufgaben), `web/src/shared/BenchNav.tsx` (AppKey + entry between Projekte and CRM),
  `eslint.config.js` (the web denylist array gains `"aufgaben"`)
- Test: `web/src/aufgaben/{App.test.tsx,types.test.ts,format.test.ts}`,
  `web/src/aufgaben/components/TaskList.test.tsx`, extend `web/src/shared/BenchNav.test.tsx`
  (order now Start, Vault, Projekte, Aufgaben, CRM, Rolodex; retitle the stale "all three
  apps" test name while there)

**Interfaces:**

- Consumes: `GET /api/aufgaben/tasks`, `PATCH`/`POST /api/vault/tasks`, `GET /api/vault/tree`
  (for the target-note dropdown); `initTheme`, `BenchNav` from shared.
- Produces: `Task` type mirroring `AufgabenTask`; `api.tasks()`, `api.toggle(path, line, raw)`,
  `api.create(body)`, `api.tree()` following `web/src/vault/api.ts`'s `get`/`q` pattern (plus a
  `send` helper for PATCH/POST that surfaces the status code, so 409 is distinguishable);
  view helpers in `types.ts` - `viewToday(tasks, today)`, `viewWeek(tasks, today)`,
  `groupByNote(tasks)`, `groupByBrand(tasks)`, `viewDone(tasks)` (doneAt desc, nulls last,
  first 30); `dateText` (de-DE medium) and `priorityText` in `format.ts`.

**German strings, exact:** document title and h1 `Aufgaben`; view tabs (buttons with
`aria-pressed`, the Projekte toggle's pattern) `Heute`, `Woche`, `Projekt`, `Marke`,
`Unzugeordnet`, `Erledigt`; Heute renders three titled lists `Überfällig`, `Heute fällig`,
`Hohe Priorität` (open, no due date, priority highest or high); Woche = due today through six
days out, sorted by due; Projekt and Marke group open tasks with the group heading = note title
/ brand, `Ohne Marke` last; Unzugeordnet = open tasks whose note has no brand (the Plaud half
arrives in Task 7); Erledigt = the last 30 done. Each task row: a checkbox (`aria-label` = the
task text), the text, then muted meta - `Fällig <dateText>` when due, `Geplant <dateText>` when
scheduled, priority as `Höchste`/`Hoch`/`Mittel`/`Niedrig`/`Niedrigste`, recurrence as
`Wiederholung: <text>`, and the note title linking to
`` `/vault/n/${path.split("/").map(encodeURIComponent).join("/")}` `` as a plain `<a>`.
Button `Neue Aufgabe` opens the create form: fields `Notiz` (select of `TASK_INBOX` labelled
`Task_Inbox (Standard)` plus every note under `20_Brands/` and `30_Projekte/`), `Text`,
`Fällig am` (date input), `Priorität` (select `Keine`/`Höchste`/`Hoch`/`Mittel`/`Niedrig`/
`Niedrigste`), submit `Anlegen`, cancel `Abbrechen`. Toggle conflict (409):
message `Die Notiz hat sich geändert – Liste neu geladen.` and a refetch; empty states
`Keine Aufgaben.` per list. Styles: token discipline as `web/src/projekte/styles.css`
(`aufgaben-` prefix on every class, dark palette + `color-scheme`, the 47 px strip offset,
`--accent: #ff5c00`).

IconAufgaben (match the AppIcons component shape):

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
  <path d="M4 5h5v5H4z" />
  <path d="M12 7h8" />
  <path d="m4.5 16 2 2 3-3.5" />
  <path d="M12 17h8" />
</svg>
```

The launcher gets **no** Aufgaben card - it is replaced whole in Task 8; the nav reaches the
app until then.

- [ ] **Step 1: Failing tests.** `types.test.ts` with literal task fixtures: overdue lands in
      Heute/Überfällig, due today in Heute fällig, high-priority-no-date in Hohe Priorität, due
      in 3 days in Woche but not Heute, done never in either; `groupByBrand` puts `Ohne Marke`
      last; `viewDone` sorts by doneAt desc and caps at 30. `format.test.ts`: `dateText` de-DE,
      null -> em dash; `priorityText("highest")` -> `Höchste`. `TaskList.test.tsx`: renders
      text, meta, checkbox with the task text as accessible name; clicking the checkbox calls
      `onToggle(path, line, raw)`. `App.test.tsx` (mock `api`): tabs move `aria-pressed`;
      toggling calls `api.toggle` then refetches; a rejected toggle with status 409 shows
      `Die Notiz hat sich geändert – Liste neu geladen.` and refetches; the create form submits
      `api.create` with the chosen target and refetches. BenchNav test: six entries in order.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e** (smoke/theme app lists are extended in
      Task 8 with the Cockpit; if `npm run e2e` already trips over the new nav entry here, fix
      the affected assertion in this task and say so in the report).
- [ ] **Step 5: Commit** - `feat: the Aufgaben app with views over the vault tasks`

---

### Task 7: The Plaud panel, import UI and GitHub issues

**Files:**

- Create: `web/src/aufgaben/components/{PlaudPanel.tsx,IssuesPanel.tsx}`
- Modify: `web/src/aufgaben/{App.tsx,api.ts,types.ts,styles.css}`
- Test: `web/src/aufgaben/components/{PlaudPanel.test.tsx,IssuesPanel.test.tsx}`, extend
  `App.test.tsx`

**Interfaces:**

- Consumes: `GET /api/aufgaben/plaud`, `POST /api/aufgaben/import`, `GET /api/aufgaben/issues`.
- Produces: `api.plaud()`, `api.importItem(file, rowHash, targetPath)`, `api.issues()`;
  `<PlaudPanel notes onImport />`, `<IssuesPanel repos source />`.

**Semantics and German strings, exact:** a seventh view tab `Issues` renders `IssuesPanel`: one
section per repo label (heading = the label), rows `#<number> <title>` linking to the issue
URL, labels as plain chips; a null issues list renders `GitHub nicht erreichbar.`; source
`"off"` renders `GitHub-Abfrage ist ausgeschaltet.`; no repos ->
`Keine GitHub-Projekte bekannt.` The Unzugeordnet view gains the Plaud half above the brandless
tasks: `PlaudPanel` shows each note (title, date, `Quelle: <source>`) with its Arbeitsaufträge
table - columns `Wer`, `Was`, `Bis wann`, `Zeitmarke`, then per row either the button
`In Vault übernehmen` with a target select preset to `suggestedTarget`, or - once imported -
`Übernommen` linking to `/vault/n/<targetPath>`; a dedup hit renders the hint
`Ähnliche Aufgabe vorhanden:` with the existing task's text linking to its note; `Offene
Fragen` and `Direkt erledigbar` render as plain bulleted lists under the table. After a
successful import the panel refetches `api.plaud()`; a 409 from a double submit refetches too
(the ledger already has it - the UI just catches up).

- [ ] **Step 1: Failing tests.** `PlaudPanel.test.tsx` (literal note fixture): renders the four
      rows, the button carries the row's Was as part of its accessible name, clicking calls
      `onImport(file, rowHash, target)` with the select's value, an imported row shows
      `Übernommen` and no button, the dedup hint renders only where `existing` is set.
      `IssuesPanel.test.tsx`: two repos render two sections; null issues ->
      `GitHub nicht erreichbar.`; `source: "off"` -> the off line and nothing else.
      `App.test.tsx`: the `Issues` tab appears after `Erledigt`; Unzugeordnet shows the Plaud
      panel; an import calls `api.importItem` then `api.plaud`.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e.**
- [ ] **Step 5: Commit** - `feat: plaud import and read-only github issues in Aufgaben`

---

### Task 8: The Cockpit replaces the launcher

**Files:**

- Modify: `web/src/home/{App.tsx,styles.css}` (rewrite in place - same document, same route),
  `web/src/home/App.test.tsx` (rewrite), `e2e/smoke.spec.ts` (the launcher-card test and the
  `/` ready-locator), `e2e/theme.spec.ts` (APPS gains `/aufgaben/`)
- Create: `web/src/home/{api.ts,session.ts,session.test.ts}`,
  `server/src/vault/fixture/00_Index/Session_Context.md`
- Test: the rewritten `App.test.tsx`, `session.test.ts`

**Interfaces:**

- Consumes: `GET /api/aufgaben/tasks`, `GET /api/projekte/list`,
  `GET /api/vault/note?path=00_Index/Session_Context.md` - one fetch each, no own DB.
- Produces: `firstSection(body: string): { heading: string; text: string } | null` in
  `session.ts` - the first `## ` heading and the lines until the next `## ` or EOF, markdown
  left as plain text.

**The fixture session note** (so the panel has content in sample mode and e2e):

```markdown
---
tags: [context, session]
updated: 2026-08-19
---

# Session-Kontext

Rollierender Stand des Beispiel-Vaults.

## Hier weitermachen — Stand 2026-08-19

Der Leuchtturm-Prototyp wartet auf den Test im Hafen. Zuerst die Spezifikation
fertigstellen, dann das Material bestellen.

## Notizen

Nichts weiter.
```

**Layout and German strings, exact:** h1 `Bench` stays, the lede is replaced by a slim app row -
plain anchors `Vault`, `Projekte`, `Aufgaben`, `CRM`, `Rolodex` with their icons, no cards, no
taglines. Below, the panels in this fixed order, each a plain bordered section with an `h2`:

1. `Überfällig` - open tasks due before today, sorted by due; each row text + `Fällig <date>`,
   linking to `/aufgaben/`; empty state `Nichts überfällig.`
2. `Diese Woche` - due today through six days out; empty state `Diese Woche ist nichts fällig.`
3. `Eingang` - the fixed line `Kommt mit der Eingang-App (Phase 4).` - the panel exists so the
   page's shape is final, honestly labelled until the app that feeds it lands.
4. `Projekte in Bewegung` - rows from `/api/projekte/list` where `dirty > 0`, `ahead > 0`,
   `behind > 0` or `lastCommitAt` within the last 7 days; name plus a local delta line (small
   duplicate of the wording `<n> geändert · <n> voraus · <n> zurück`, `sauber` when clean -
   `web/src/home` may not import from `web/src/projekte`); linking to `/projekte/`; empty state
   `Alles ruhig.`
5. `Hier weitermachen` - `firstSection` of the session note's body: the heading as the panel's
   subline, the text as paragraphs, plus a plain link `Im Vault öffnen` to
   `/vault/n/00_Index/Session_Context.md`; a missing note or section renders
   `Keine Session-Notiz gefunden.`
6. `Zahlen` - the fixed line `Kommt mit der Zahlen-App (Phase 5).`
7. `Zuletzt erledigt` - the last 5 done tasks by doneAt desc; empty state
   `Noch nichts erledigt.`

Task counts respect the same exclusion list as the Aufgaben app (the API already applies it).
No hero block, no KPI grid, no decor charts - panels are the same flat sections the apps use.

**e2e adjustments in this task:** `smoke.spec.ts`'s "the launcher links into each app" test
becomes "the start page links into each app" over the slim row (`getByRole("link")` by name);
the `/` entry's ready-locator becomes the `Überfällig` heading; the seams list gains
`/aufgaben/` with a ready-locator on the `Heute` tab. `theme.spec.ts` APPS gains `/aufgaben/`.

- [ ] **Step 1: Failing tests.** `session.test.ts`: body with two `## ` sections -> first
      heading + its lines only; body without `## ` -> null. `App.test.tsx` (mock the three
      fetches): all seven panel headings render in order; the overdue fixture task appears
      under `Überfällig`; a dirty project appears under `Projekte in Bewegung` with its delta;
      the session heading and text render with the vault link; the two placeholder lines
      render; the app row links five apps at their document roots.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e** (smoke + theme updated here).
- [ ] **Step 5: Commit** - `feat: the Cockpit replaces the launcher`

---

### Task 9: The Aufgaben and Cockpit e2e suite

**Files:**

- Create: `e2e/aufgaben/{tasks.spec.ts,import.spec.ts}`, `e2e/cockpit.spec.ts`

**Interfaces:** the per-worker server (fixture vault copy at the `vaultDir` fixture, sample
Plaud fixture read in place, `BENCH_GH=off`), `test`/`expect` from `../fixtures` only. The
specs may read and edit files under `vaultDir` with `node:fs` - that IS the "edited in
Obsidian" side of the criteria.

- [ ] **Step 1: tasks.spec.ts.**
  - _Toggle round-trip:_ open `/aufgaben/`, Heute shows `Spezifikation schreiben` (due
    2026-08-20, long overdue); check its checkbox; poll until the row leaves Heute; read
    `30_Projekte/Leuchtturm/Leuchtturm.md` under `vaultDir` and assert the line now matches
    `- [x] Spezifikation schreiben 🔺 📅 2026-08-20 ✅ ` + today; switch to `Erledigt`, the
    task is there; toggle back from Erledigt and assert the file line reverted exactly.
  - _The 409:_ pick `Prototyp bauen`; edit that exact line in the file via `fs` (append
    ` NEU`); without reloading, toggle it in the UI; expect the message
    `Die Notiz hat sich geändert – Liste neu geladen.`, and assert the file still holds the
    edited line untouched (no data loss). The check runs against the file, not the index, so
    the watcher's timing cannot race it.
  - _Create:_ `Neue Aufgabe` -> default target, text `Anker streichen`, `Anlegen`; the task
    appears; `00_Index/Task_Inbox.md` exists under `vaultDir` and contains
    `- [ ] Anker streichen` under `## Aufgaben`.
- [ ] **Step 2: import.spec.ts.** Unzugeordnet shows the Hafenrunde note with four rows; the
      first row shows the dedup hint (`Ähnliche Aufgabe vorhanden:`); import the _fourth_ row
      (`Die Werkstatt für den Winter vorbereiten`) with the preset target; poll until it reads
      `Übernommen`; assert `00_Index/Task_Inbox.md` contains exactly one line ending
      `(aus [[2026-08-20_hafenrunde]])` for that text; reload the page - the row still reads
      `Übernommen` (the ledger survives); the issues tab shows
      `GitHub-Abfrage ist ausgeschaltet.`
- [ ] **Step 3: cockpit.spec.ts.** Open `/`; all seven panel headings visible; `Überfällig`
      lists `Prototyp bauen` (due 2026-08-25, overdue); `Hier weitermachen` shows
      `Der Leuchtturm-Prototyp` text and the `Im Vault öffnen` link routes to the vault note;
      `Projekte in Bewegung` eventually lists `leuchtfeuer` (the first visit may trigger the
      lazy projekte scan - poll generously, with a comment saying why).
- [ ] **Step 4: Run the suite** (`npx playwright test e2e/aufgaben e2e/cockpit.spec.ts
--retries=0`, then `npm run e2e` twice for stability), fix flakiness at the root. Mind the
      retry rule: a retried spec re-enters against the same worker vault - every spec must
      tolerate its own leftovers (the toggle spec reverts its toggle; the import spec asserts
      "exactly one line", which holds because the ledger blocks the double import; the create
      spec asserts on presence, not count - add the task with a text no other spec uses).
- [ ] **Step 5: Full gate. Commit** - `test: the aufgaben and cockpit browser suites`

---

### Task 10: Documentation and the five-app sweep

**Files:**

- Create: `docs/aufgaben/{REQUIREMENTS.md,IMPLEMENTATION.md}`,
  `docs/cockpit/{REQUIREMENTS.md,IMPLEMENTATION.md}`
- Modify: `docs/PROJECT.md`, `AGENTS.md`, `README.md`, `docs/PROCESS.md` (e2e layout list),
  `e2e/EXPLORATORY.md` (an Aufgaben/Cockpit section: real-machine gh breadth, real Plaud notes,
  recurrence deliberately not computed, the watcher-vs-sync-reindex overlap)

**Content rules:** REQUIREMENTS.md condenses the SPEC and PLAN.md Phase 3 rows (purpose,
sources, the two write paths, success criteria). IMPLEMENTATION.md describes what IS built: the
line-offset rule (tasks.line counts in the frontmatter-stripped body), the 409 contract
(reindex-before-reply), the atomic-write shape and why the tmp file starts with a dot, the
exclusion list and where it applies, the ledger schema and the order write-then-record, the
mapping rules being this vault's conventions, the dedup threshold, the gh command and
null-on-failure, `BENCH_GH=off`, and a "Things that will bite" list (recurrence not computed;
a task inside a code fence is not indexed and cannot be toggled; two tasks with identical raw
on different lines are disambiguated by the line number, not the text; the ledger names file
lines that go stale when the note is edited - it is provenance, not a pointer). PROJECT.md: the
app table gains Aufgaben and the launcher row becomes the Cockpit description; the layout tree
gains `server/src/aufgaben/` and `data/aufgaben.sqlite`; the Bench OS decisions bullet on the
two write paths points at `vault/write.ts`; the vault app's own line drops "Read-only" in
favour of naming the guarded exception. AGENTS.md: "Four local-first apps" -> five, the
launcher sentence -> the Cockpit. README: the app list. Every claim checked against the code;
no machine paths; no volatile counts.

- [ ] **Step 1: Write the docs, verify claims against the code.**
- [ ] **Step 2: Full gate** (docs only - `check` regardless; e2e not needed unless code
      changed). **Step 3: Commit** - `docs: the Aufgaben app, the Cockpit and the five-app tree`

---

### Task 11: Final gate against the real machine

**Files:**

- Modify: `.env` (untracked): `PLAUD_HOME=~/Plaud`
- Create: the criteria report in the SDD workspace (untracked); screenshots under `data/`
  (untracked)
- Modify (only if a criterion demands a doc line): `e2e/EXPLORATORY.md`

**The Phase 3 success criteria, each with a measured number or a concrete pointer:**

1. **Open-task count.** `GET /api/aufgaben/tasks` open count vs a hand count over the real
   vault mirroring the Cockpit query (`- [ ]` lines outside `50_Workflow`, `Templates`,
   `90_Archive`); report both numbers and explain any delta (the "± Ausschlussliste"
   tolerance). Around 172 was the last known figure.
2. **Toggle round-trip.** Create a probe task `Bench-Toggle-Probe` in `00_Index/Task_Inbox.md`
   through the UI, toggle it, verify `[x] … ✅ <today>` in the file, toggle back, verify the
   revert. Then edit the probe line in the file with an editor and toggle from the stale UI ->
   409, file intact. The probe line stays in Task_Inbox for the user to keep or delete - the
   agent's writes go through the two paths only.
3. **Obsidian -> Bench without restart.** Edit the probe line in the file (check it by hand)
   and watch the Aufgaben list update within ~3 s (the Phase 1 watcher pipeline; confirm it
   fires for the toggle-relevant fields).
4. **The Q4 note.** `GET /api/aufgaben/plaud` lists `2026-08-18_q4-planungslogik.md` with
   exactly 4 items; the suggested target is the Merch note (the widened ÆND keywords); import
   all four through the UI, verify four `- [ ] … (aus [[2026-08-18_q4-planungslogik]])` lines
   in the target note, then click each again / re-open and confirm nothing imports twice
   (ledger count stays 4). **This writes into the real vault deliberately - it is the
   criterion.** Report the target chosen and the lines added; do not quote any other note
   content.
5. **The Cockpit** shows every panel in both themes - screenshots of `/`, `/aufgaben/` (each
   view) in dark and light, untracked; note that `e2e/tools/chrome-shots.mjs` predates both
   screens - extend it or capture with a throwaway script, either is fine, tracked changes only
   if the tool is extended.
6. **Uncodixify check** over the new screens: no eyebrow labels, no pills, no hover
   transforms, no gradients, one accent - confirmed by eye against the screenshots, noted in
   the report.

Privacy rules as in Phase 2: repo names and machine paths stay out of tracked files; the report
and screenshots live untracked; no vault note content is quoted beyond the lines this phase
itself wrote.

- [ ] **Step 1: Configure, measure, verify** each criterion. A failing criterion is reported
      BLOCKED with evidence, never patched silently.
- [ ] **Step 2: Full gate one last time** (`npm run format && npm run check && npm run e2e`).
- [ ] **Step 3: Commit** (only tracked changes, if any) - `docs: exploratory notes for the Aufgaben app`

---

## Self-review notes

- Type names used across tasks are consistent: `WriteResult`, `TASK_INBOX`, `PlaudItem`,
  `PlaudNote`, `ImportRow`, `AufgabenContext`, `AufgabenTask`, `Issue`, `GhRunner` (aufgaben's
  own), `Task` (web).
- The write machinery lives once, in `vault/write.ts`; the vault routes and the aufgaben import
  both call it. `server/src/aufgaben/` imports vault modules one-way (documented); it never
  imports `server/src/projekte/` - the GitHub labels arrive as a getter from the composition
  root.
- The fixture Plaud note is consumed by Tasks 3, 5 (tests), the sample mode (Task 5 wiring) and
  the e2e suite (Task 9) - one file, four consumers. Its first row deliberately collides with a
  fixture vault task so the dedup path is visible everywhere without extra fixtures.
- Decisions taken here that the brief leaves open, to confirm at plan approval: the Issues view
  is a seventh tab and lists **all** open issues (the brief's `--assignee @me` would show 0 of
  the 115 ÆND issues if none are assigned); the ledger lives in its own `data/aufgaben.sqlite`
  because `vault.sqlite` is documented as deletable at any time; the Eingang and Zahlen Cockpit
  panels are honest placeholders until Phases 4 and 5; the ÆND mapping keywords include
  artist/release/tier so the Q4 note maps without the brand name being spoken; Task 11 really
  imports the four Q4 work items into the real vault, as the criterion demands.
