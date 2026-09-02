# Bench OS Phase 5 - Kontext and Zahlen - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two read-only apps: Kontext ("what does my system know about me") over the vault's
profile notes, the Claude rules, memory, the repositories' briefs, the skill catalogue and the
MCP server names; and Zahlen over the controlling runs - the last run's figures, the archive,
the report in an iframe, and the myCrafton deep links. Plus the Cockpit's Zahlen panel going
live. Nothing in this phase writes anywhere.

**Architecture:** `server/src/zahlen/routes.ts` and `server/src/kontext/routes.ts` are
filesystem readers with no database of their own. Zahlen resolves everything by FOLDER BASENAME
against `CONTROLLING_DIR` (the absolute paths inside `letzter-lauf.json` are ignored - fence),
parses the KPI figures out of `zusammenfassung.md`'s own generated table so the "same figures"
criterion holds by construction, and serves exactly three file names per run folder. Kontext
reads the vault index through the injected handle (the third documented vault-read exception),
the registered project paths through a getter injected at the composition root (the
`githubLabels` pattern), and everything Claude-side under one `claudeDir` that an env override
points at a committed fixture in tests and e2e. The web apps at `/kontext` and `/zahlen` follow
the Eingang app's shape.

**Tech Stack:** Express 5, Vite 8 + React 19. **No new dependency, no new database.**

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every
  shell. TypeScript `6.0.3` exactly.
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task
  touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or the fixtures. Coverage
  stays at or above 80 % statements per workspace. Every gate step FOREGROUND with a generous
  explicit timeout and its own exit code - never piped through `tail`/`head`; a run that gets
  auto-backgrounded is polled to completion immediately, never awaited. `watch.test.ts`
  coverage flake -> retry that step with `--maxWorkers=2`. Opaque failure -> `df -h` first.
- Focused tests: `cd server && npx vitest run test/zahlen test/kontext` /
  `cd web && npx vitest run src/zahlen src/kontext src/home`. e2e retry-safety proofs use
  `--workers=1 --repeat-each=2`.
- ESLint limits: 500/200/complexity 15/depth 4/5 params. No `any`. No emoji in code or
  comments. Comments say why. Hand-rolled scanners over super-linear regexes. Immutable data.
- **Read-only, fenced.** Neither app writes anything, anywhere. File-serving routes accept only
  a validated run-folder basename (`YYYY-MM-DD-zwischenstand|abschluss`) plus a CLOSED file-name
  allowlist (`bericht.html`, `rohdaten.json`, `zusammenfassung.md`); Kontext's routes take no
  path parameters at all (each tab is its own closed route). No client-supplied path ever
  reaches `path.join` unvalidated.
- **No secret ever renders.** `~/.claude.json` contributes SERVER NAMES only - the file is
  parsed, names extracted, everything else discarded server-side. The phase criterion runs
  gitleaks over a dump of every Kontext tab; design for that from the start.
- Tests and e2e never read the real `~/.claude` or the real controlling dir: `BENCH_CLAUDE_DIR`
  points at the committed fixture; `CONTROLLING_DIR` unset falls back to the (extended) eingang
  controlling fixture.
- Machine paths never appear in tracked files. Fixtures are synthetic (`de.beispiel.*`,
  invented figures, `example.com`).
- German UI strings exactly as written; identifiers/comments/commits English. Conventional
  Commits, one line, then a blank line and EXACTLY these two trailers on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` <!-- allow-secret: Anthropic's own no-reply address, required verbatim in every commit trailer --> and
  `Claude-Session: https://claude.ai/code/session_01MoJadrroWuuNdrBRnWAPCF`. Never push
  without being asked. Branch `bench-os-phase-5`, cut from `bench-os-phase-4` at c4c3b46.

## Decisions settled at plan approval

1. The KPI row and the Cockpit panel parse `zusammenfassung.md`'s own table - `rohdaten.json`
   is linked for download, never parsed (its schema is the skill's private business; the
   summary table is the stable public face, and "same figures as zusammenfassung.md" then holds
   by construction).
2. `letzter-lauf.json`'s absolute paths are ignored; only `path.basename(ordner)` is used,
   resolved against `CONTROLLING_DIR`. Missing/unreadable `letzter-lauf.json` -> the newest
   archive folder by name wins.
3. The `shoesplease-google-ads/reports/*` list from the brief is SKIPPED this phase (the folder
   is empty on the machine and the SPEC criteria do not name it).
4. The optional Supabase live row (brief "Entscheidung 5") is SKIPPED (the condensed SPEC
   excludes direct cloud calls).
5. New `.env` key `MYCRAFTON_URL`; unset renders `Nicht konfiguriert.` in the deep-links
   section.
6. `BENCH_CLAUDE_DIR` env override (default `~/.claude`) with a committed fixture claude-home;
   the real machine reads the real `~/.claude` - that IS the product.
7. The Stand tab renders `00_Index/Session_Context.md` whole (no section extraction).
8. Kontext reads `vault.sqlite` via the injected handle and the registered project paths via an
   injected getter over `projekte.sqlite` - both wired at the composition root, no cross-app
   imports.

---

### Task 0: Setup

Controller work, no subagent: branch `bench-os-phase-5` exists (cut from `bench-os-phase-4` at
c4c3b46), this plan committed as `docs: the phase 5 plan`, the ledger initialised at
`.superpowers/sdd/PLAN-phase-5/progress.md`.

---

### Task 1: Configuration and the two fixtures

**Files:**

- Modify: `server/src/config.ts`, `.env.example`, `e2e/fixtures.ts`,
  `server/vitest.config.ts` (coverage exclude gains `src/kontext/fixture/**`)
- Create: `server/src/kontext/locate.ts`, `server/test/kontext/tmp.ts` (scratchDir copy), and
  the fixture claude-home under `server/src/kontext/fixture/claude/`:
  - `rules/beispiel-regel.md` (three lines of synthetic English rule text)
  - `skills/leuchtturm-skill/SKILL.md` and `skills/hafen-skill/SKILL.md` - frontmatter
    `name:` + `description:` (one description containing `": "` so the tolerant scanner is
    exercised), short body
  - `projects/-tmp-beispiel/memory/notiz.md` (a two-line synthetic memory note)
  - `claude.json` - `{ "mcpServers": { "beispiel-a": { "url": "https://secret.example.com/token?x=1" }, "beispiel-b": {} } }`
    (the url exists PRECISELY so a test can assert it never leaves the server)
- Extend the eingang controlling fixture (Zahlen shares it):
  `server/src/eingang/fixture/controlling/letzter-lauf.json` (the real shape - `ordner`,
  `modus`, `stichtag`, `bericht`, `zusammenfassung`, `bestellungen: 123` - with INVENTED
  absolute-looking paths like `/erfunden/2026-08-15-zwischenstand/...`, proving the reader
  ignores them), plus in `2026-08-15-zwischenstand/`: `rohdaten.json` (`{"hinweis":"synthetisch"}`)
  and `bericht.html` (`<!doctype html><title>Bericht</title><p>Synthetischer Bericht.</p>`),
  and a SECOND run folder `2026-07-15-zwischenstand/` with only a `zusammenfassung.md`
  (two-line, invented figures) - so the archive list has two entries and a missing-file case.
  The existing `2026-08-15-zwischenstand/zusammenfassung.md` gains a KPI table in the real
  generated format (`| Kennzahl | Vergleich | Aktuell | Veränderung |` with rows
  `Umsatz gesamt`, `Google-ROAS`) and a `## Kampagnen unter Break-even` section with one
  bullet - the exact shapes Task 2's parser tests pin.
- Test: `server/test/config.test.ts` (extend), `server/test/kontext/locate.test.ts`

**Interfaces:**

- Produces: `Config.mycraftonUrl?: string` (trimmed, trailing slash stripped);
  `locateKontext(env: NodeJS.ProcessEnv): { claudeDir: string }` - `BENCH_CLAUDE_DIR`
  expanded when set, else `path.join(os.homedir(), ".claude")`; `describeSources` gains
  `` `myCrafton: ${configured|not configured}` `` (path-free, like the others).
- `e2e/fixtures.ts`: the per-worker env gains `BENCH_CLAUDE_DIR: <abs path of the kontext fixture claude dir>`
  and `MYCRAFTON_URL: ""` (the leak-guard comment pattern).

- [ ] **Step 1: Failing tests.** config: `MYCRAFTON_URL` unset -> undefined; set with trailing
      slash -> stripped; describeSources line both ways. locate: override set -> expanded
      override; unset -> the homedir default.
- [ ] **Step 2: Watch them fail. Step 3: Implement** (locate mirrors the house pattern;
      `.env.example` gains `# Base URL of the myCrafton cockpit, e.g. https://host/` +
      `MYCRAFTON_URL=`).
- [ ] **Step 4: Suites green, full gate including e2e** (fixtures changed).
- [ ] **Step 5: Commit** - `feat: kontext and zahlen configuration with fixtures`

---

### Task 2: The Zahlen API

**Files:**

- Create: `server/src/zahlen/summary.ts` (the parser), `server/src/zahlen/runs.ts` (folder
  scan + resolution), `server/src/zahlen/routes.ts`
- Modify: `server/src/app.ts` (mount `/api/zahlen`, `Dbs.zahlen`), `server/src/index.ts`
  (context from the eingang locate's controlling dir - reuse `locateEingang`'s result, one
  startup line `` `Zahlen: ${n} runs` `` or `Zahlen: not configured`)
- Test: `server/test/zahlen/{summary.test.ts,runs.test.ts,routes.test.ts}` (+ `tmp.ts` copy;
  the eingang controlling fixture is the test data)

**Interfaces:**

- Produces:
  - `Kpi { kennzahl: string; vergleich: string; aktuell: string; veraenderung: string }`;
    `parseSummary(md: string): { title: string; kpis: Kpi[]; breakEven: string[] }` - a
    hand-rolled line scanner: the first `|`-table after the title (header + separator skipped,
    4+ cells, trimmed), the bullets under the exact heading `## Kampagnen unter Break-even`
    (`- keine ...` counts as zero real campaigns - the UI decides, the parser just returns the
    bullets). Missing table/section -> empty arrays, never a throw.
  - `RunFolder { folder: string; stichtag: string; modus: "zwischenstand" | "abschluss" }`;
    `listRuns(dir: string): RunFolder[]` - subfolders matching
    `YYYY-MM-DD-(zwischenstand|abschluss)` exactly (hand-rolled check), newest first by name;
    unreadable dir -> `[]`. `lastRun(dir: string): RunFolder | null` - `letzter-lauf.json`'s
    `ordner` BASENAME when it names an existing valid folder, else the newest listed folder,
    else null (the absolute paths in the file are never used - why-comment).
  - Routes under `/api/zahlen` (`ZahlenContext { dir: string | null; mycraftonUrl: string | null }`
    as `Dbs.zahlen`; `dir` is eingang's located controlling dir, null when the whole eingang
    world is configured-without-controlling):
    - `GET /last` -> `{ run, kpis, breakEven, zusammenfassung, bestellungen }` (raw md text
      included; `bestellungen` from letzter-lauf.json when present, else null) or
      `{ run: null }`.
    - `GET /runs` -> `{ runs: RunFolder[] }`.
    - `GET /run?folder=<basename>` -> same shape as /last for that folder; 400 on a basename
      failing the exact pattern (the fence - checked BEFORE any fs access); 404 when valid but
      absent.
    - `GET /file?folder=<basename>&name=<allowlisted>` -> serves exactly
      `bericht.html` | `rohdaten.json` | `zusammenfassung.md` from inside that folder; 400 on
      any other name or bad folder; 404 when missing. (The iframe and download links go
      through this.)
    - `GET /links` -> `{ base: string | null, paths: ["/", "/umlagerungen", "/nachbestellungen", "/marken"] }`.
    - A null `dir` -> every route answers its empty shape (`run: null`, `runs: []`), never 500.

- [ ] **Step 1: Failing tests.** `summary.test.ts` pins the fixture zusammenfassung (title, the
      two KPI rows verbatim, the break-even bullet) plus literals: a `keine`-bullet, a missing
      table, a row with too few cells skipped. `runs.test.ts`: the two fixture folders newest
      first; a `not-a-run` folder ignored; `lastRun` uses the basename despite the invented
      absolute paths (THE decision-2 pin); letzter-lauf.json deleted in a scratch copy -> falls
      back to newest; empty scratch dir -> null. `routes.test.ts` (supertest, fixture dir):
      /last carries the KPI rows and the raw markdown; /run with `../2026-08-15-zwischenstand`
      and `2026-08-15-zwischenstand/x` -> 400 before any read; /file with `name=.env` -> 400;
      /file bericht.html -> 200 html; null-dir context -> empty shapes.
- [ ] **Step 2: Watch them fail. Step 3: Implement** (error idiom as everywhere;
      `Cache-Control` handled by the global /api middleware).
- [ ] **Step 4: Suites green, full gate including e2e** (app.ts/index.ts changed).
- [ ] **Step 5: Commit** - `feat: the zahlen API over the controlling runs`

---

### Task 3: The Kontext API

**Files:**

- Create: `server/src/kontext/{readers.ts,skills.ts,routes.ts}`
- Modify: `server/src/app.ts` (mount `/api/kontext`, `Dbs.kontext`), `server/src/index.ts`
  (context: `claudeDir` from `locateKontext(process.env)`, the vault db handle, a
  `projectPaths: () => { name: string; path: string }[]` getter over `listProjects` at the
  composition root; startup line `` `Kontext: ${n} skills` ``)
- Test: `server/test/kontext/{readers.test.ts,skills.test.ts,routes.test.ts}`

**Interfaces:**

- `KontextContext { claudeDir: string; vaultDb: Database; projectPaths: () => { name: string; path: string }[] }`
  as `Dbs.kontext`. `server/src/kontext/` never imports vault or projekte modules - the db
  handle and the getter arrive injected (the established pattern; a plain `SELECT` on the
  notes table is written locally with a why-comment, like projekte's `couple.ts`).
- Routes under `/api/kontext` (each tab one closed route, NO path/query parameters anywhere):
  - `GET /profil` -> `{ notes: { path, title, body }[] }` - vault notes whose path starts
    `10_Profile/`, ordered by path.
  - `GET /regeln` -> `{ claude: { name, body, mtime }[], vault: { path, title, body }[] }` -
    every `.md` directly in `<claudeDir>/rules` (sorted by name; missing dir -> `[]`) plus
    vault notes under `50_Workflow/`.
  - `GET /stand` -> `{ note: { path, title, body } | null }` - `00_Index/Session_Context.md`.
  - `GET /memory` -> `{ projects: { dir, notes: { name, body, mtime }[] }[] }` - every
    `<claudeDir>/projects/*/memory/*.md`; `dir` is the project folder name as-is (it encodes
    the path with dashes - render, do not decode; why-comment); projects without a memory dir
    skipped; sorted by dir.
  - `GET /repos` -> `{ repos: { name, files: { name: "CLAUDE.md" | "AGENTS.md", body }[] }[] }`
    - for each registered project (the getter), read `CLAUDE.md` and `AGENTS.md` directly in
      the project root when present (missing files simply absent; unreadable project skipped).
  - `GET /skills` -> `{ count: number; skills: { name, description }[] }` - `skills.ts` scans
    `<claudeDir>/skills/*/SKILL.md`, reading `name:`/`description:` with the tolerant
    first-`": "` line scan (the house duplicate, why-comment); **count = the number of skill
    FOLDERS** (the criterion: counter equals folder count), `skills` only those with a
    readable SKILL.md. Cached per claudeDir keyed on the skills dir's mtime (~500 folders on
    the real machine; the brief's own note) - the cache is module-local, documented, and a
    changed mtime rebuilds it.
  - `GET /mcp` -> `{ servers: string[] }` - `Object.keys` of `mcpServers` in
    `<claudeDir>/claude.json` (the real machine's file is `~/.claude.json`, i.e. NEXT TO the
    claude dir: read `<claudeDir>/../.claude.json` when `claudeDir` ends `/.claude`, else
    `<claudeDir>/claude.json` - the fixture uses the latter; comment the split). Names only;
    the parsed object never leaves the function.
- No route echoes `claudeDir` or any absolute path; `repos` names come from the project row's
  `name`, not its path.

- [ ] **Step 1: Failing tests.** `readers.test.ts` against the fixture claude dir + an
      in-memory vault db (notes inserted directly): rules read + sorted; memory projects with
      mtimes; a project dir without memory skipped. `skills.test.ts`: both fixture skills
      found, the `": "` description intact, count counts a THIRD folder without SKILL.md, the
      mtime cache returns the same array until the dir mtime changes (touch in a scratch
      copy). `routes.test.ts` (supertest; fixture claude dir, vault db with 10_Profile/,
      50_Workflow/ and Session_Context rows, a fake projectPaths getter pointing at a scratch
      repo with a CLAUDE.md): every tab's shape; **the mcp route returns exactly
      `["beispiel-a", "beispiel-b"]` and the response text does NOT contain `secret.example.com`
      or `token`** (the no-secret pin); no response contains the claude dir's absolute path.
- [ ] **Step 2: Watch them fail. Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e.**
- [ ] **Step 5: Commit** - `feat: the kontext API over profile, rules, memory and skills`

---

### Task 4: The Zahlen app

**Files:**

- Create: `web/zahlen/index.html`, `web/src/zahlen/{main.tsx,App.tsx,api.ts,types.ts,styles.css}`,
  `web/src/zahlen/components/{KpiTable.tsx,RunsList.tsx}`
- Modify: `web/vite.config.ts` + `server/src/app.ts` APPS (both, agreeing),
  `web/src/shared/AppIcons.tsx` (IconZahlen), `web/src/shared/BenchNav.tsx` (AppKey + entry -
  order becomes Start, Vault, Projekte, Aufgaben, Eingang, Kontext, Zahlen, CRM, Rolodex;
  Kontext's entry lands in Task 5, add only Zahlen here and keep the test updated per task),
  `eslint.config.js` denylist gains `"zahlen"`
- Test: `web/src/zahlen/App.test.tsx`, component tests, BenchNav test update

**German strings, exact:** title/h1 `Zahlen`; section headings `Letzter Lauf`, `Archiv`,
`Bericht`, `myCrafton`; the run line `` `${modus === "abschluss" ? "Abschluss" : "Zwischenstand"} vom ${dateText(stichtag)}` ``;
KPI table headers `Kennzahl`, `Vergleich`, `Aktuell`, `Veränderung`; break-even line
`` `Kampagnen unter Break-even: ${bullets.length === 1 && bullets[0].startsWith("keine") ? "keine" : String(bullets.length)}` ``
(helper, tested); the full zusammenfassung under a heading `Zusammenfassung` as preformatted
text (a `<pre class="zahlen-md">` - the generated markdown is its own honest rendering; the
pretty view is the Bericht iframe); download links `rohdaten.json` / `zusammenfassung.md` via
`/api/zahlen/file`; the Bericht section an `<iframe title="Bericht">` on
`/api/zahlen/file?...bericht.html`; archive rows load that run on click (aria-pressed
selection); myCrafton links labelled `Start`, `Umlagerungen`, `Nachbestellungen`, `Marken`
(plain `<a href={base + path}` target `_blank` rel `noreferrer`), unset base ->
`Nicht konfiguriert.`; empty states `Noch kein Lauf.` / `Keine Läufe.` Styles: `zahlen-`
prefix, token discipline, dark first - the established pattern.

IconZahlen (bar-chart motif, AppIcons shape):

```tsx
<path d="M4 20V10" />
<path d="M10 20V4" />
<path d="M16 20v-9" />
<path d="M3 20h18" />
```

- [ ] **Step 1: Failing tests** (mock api): last run renders the KPI rows and the pre block;
      selecting an archive run calls `api.run(folder)` and swaps the view; break-even helper
      both ways (`keine` bullet -> `keine`, two real bullets -> `2`); unset base ->
      `Nicht konfiguriert.`; nav order test updated.
- [ ] **Step 2: Watch them fail. Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e** (a tripped nav assertion fixed
      minimally and disclosed).
- [ ] **Step 5: Commit** - `feat: the Zahlen app over the controlling runs`

---

### Task 5: The Kontext app

**Files:**

- Create: `web/kontext/index.html`,
  `web/src/kontext/{main.tsx,App.tsx,api.ts,types.ts,styles.css}`,
  `web/src/kontext/components/{NoteList.tsx,SkillsPanel.tsx}`
- Modify: vite/app.ts APPS, AppIcons (IconKontext), BenchNav (entry between Eingang and
  Zahlen), eslint denylist gains `"kontext"`
- Test: `web/src/kontext/App.test.tsx`, component tests, BenchNav test update

**German strings, exact:** title/h1 `Kontext`; tabs (aria-pressed buttons, the house pattern)
`Profil`, `Regeln`, `Stand`, `Memory`, `Repos`, `Skills`, `MCP`; note bodies as preformatted
text blocks with the note's title as heading; vault-note headings link to
`` `/vault/n/<encoded path>` `` (plain `<a>`); the Regeln tab renders two subsections
`Claude-Regeln` and `Workflow (Vault)`; Memory groups by project dir name with the mtime as
`dateText`; Repos per project with `CLAUDE.md`/`AGENTS.md` sub-blocks; the Skills tab a search
input (label `Suchen`) filtering name+description client-side, the counter line
`` `${count} Skills` `` (the FOLDER count from the API, unfiltered - criterion), rows
`name — description`; MCP a plain list; per-tab empty state `Nichts gefunden.` Icon: a
document-with-person motif:

```tsx
<circle cx="9" cy="8" r="3" />
<path d="M4 20c0-3 2.2-5 5-5s5 2 5 5" />
<path d="M16 4h5" />
<path d="M16 8h5" />
<path d="M16 12h5" />
```

- [ ] **Step 1: Failing tests** (mock api): tabs move aria-pressed; each tab renders its shape
      from a literal reply; the skills search narrows rows but the counter stays at `count`;
      the vault links encode; empty states.
- [ ] **Step 2: Watch them fail. Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e.**
- [ ] **Step 5: Commit** - `feat: the Kontext app over profile, rules and skills`

---

### Task 6: The Cockpit Zahlen panel goes live

**Files:**

- Modify: `web/src/home/{App.tsx,api.ts,types.ts}`, `web/src/home/App.test.tsx`,
  `e2e/cockpit.spec.ts` (the Zahlen panel assertion), `e2e/smoke.spec.ts` (seams gain
  `/kontext/` and `/zahlen/` with ready-locators `Profil` tab / `Letzter Lauf` heading),
  `e2e/theme.spec.ts` (APPS gains both)

**Semantics, exact:** the `Zahlen` panel replaces `Kommt mit der Zahlen-App (Phase 5).` with
one fetch of `GET /api/zahlen/last`: the run line (`Zwischenstand vom <date>`), then two KPI
lines picked from the parsed rows by exact Kennzahl - `Umsatz gesamt` and `Google-ROAS` - each
as `` `${kennzahl}: ${aktuell}` `` (a row absent -> the line is omitted), then the break-even
helper line, then the link `Zur Zahlen-App` -> `/zahlen/`; `run: null` -> `Noch kein Lauf.`
with the link staying. The local `InboxFile`-style type duplicate pattern applies (home
imports nothing from siblings). The app row gains `Kontext` and `Zahlen` anchors in nav order.

- [ ] **Step 1: Failing tests** (mock fetch): filled panel with the two KPI lines from the
      fixture-shaped reply; a reply missing `Google-ROAS` omits that line; empty state; the
      app row now links seven apps.
- [ ] **Step 2: Watch them fail. Step 3: Implement + the three e2e spec updates** (the sample
      world's Zahlen panel shows the fixture's `Umsatz gesamt` row - derive the asserted
      string from the fixture and comment the derivation).
- [ ] **Step 4: Suites green, full gate including e2e.**
- [ ] **Step 5: Commit** - `feat: the Cockpit shows the last controlling run`

---

### Task 7: The e2e suites

**Files:**

- Create: `e2e/zahlen/zahlen.spec.ts`, `e2e/kontext/kontext.spec.ts`

**Zahlen spec** (sample world = the extended eingang controlling fixture): `/zahlen/` shows
`Zwischenstand vom 15.08.2026`, the `Umsatz gesamt` KPI row, the archive with two runs;
clicking the July run swaps the view (its zusammenfassung text appears); the iframe is present
with `title="Bericht"`; myCrafton shows `Nicht konfiguriert.` **Kontext spec** (fixture claude
dir): the `Skills` tab shows `3 Skills` (two SKILL.md folders + one bare folder - assert the
number the fixture actually yields, derive in a comment), searching `leuchtturm` narrows to
one row while the counter stays; the `MCP` tab lists `beispiel-a` and `beispiel-b` and the
page NEVER contains `secret.example.com` (assert on page content - the e2e half of the
no-secret criterion); `Regeln` shows the fixture rule; vault-backed tabs show the fixture
vault notes. Rules: `../fixtures` only, no waitForTimeout, role/label selectors, retry-safe
(read-only apps - trivially, state it), `--workers=1 --repeat-each=2` proof.

- [ ] **Step 1: Write both specs. Step 2: retries=0, workers=1 repeat-each=2, full
      `npm run e2e` twice. Step 3: Full gate. Step 4: Commit** -
      `test: the kontext and zahlen browser suites`

---

### Task 8: Documentation and the eight-app sweep

**Files:**

- Create: `docs/kontext/{REQUIREMENTS.md,IMPLEMENTATION.md}`,
  `docs/zahlen/{REQUIREMENTS.md,IMPLEMENTATION.md}`
- Modify: `docs/PROJECT.md` (two app rows, tree, decisions: the basename-only resolution, the
  injected-handle pattern now three-way, count sweeps six->eight apps / seven->nine
  documents), `AGENTS.md`, `README.md`, `docs/PROCESS.md` (e2e layout),
  `docs/cockpit/IMPLEMENTATION.md` (Zahlen panel live - the last placeholder is gone),
  `e2e/EXPLORATORY.md` (real ~/.claude scale, real myCrafton resolution, gitleaks page dump
  live-only)

**Content rules as established** - every claim verified in code; the bites list must include:
the KPI parse depends on the generated table format (a lauf.py format change breaks the row
silently to empty); `letzter-lauf.json` paths are ignored by design; the skills cache
invalidates on the skills DIR mtime (a edited SKILL.md inside an existing folder does not bump
it - stale until the next folder add/remove; state it honestly); memory dir names render
undecoded; the mcp file split (`~/.claude.json` vs fixture-local).

- [ ] **Step 1: Write and verify. Step 2: `npm run format && npm run check`. Step 3: Commit** -
      `docs: Kontext, Zahlen and the eight-app tree`

---

### Task 9: Final gate against the real machine

**Files:** `.env` (untracked): append `MYCRAFTON_URL=<the real base>` (the user's cockpit URL
from their own notes - never written to a tracked file). Criteria report untracked in the SDD
workspace; screenshots untracked under `data/task-9-phase5-screenshots/`.

**The Phase 5 criteria, measured:**

1. **Kontext complete and secret-free:** every tab renders real data (Profil: the two
   10_Profile notes; Regeln: the 9 claude rules + 50_Workflow; Stand; Memory across the real
   projects; Repos: the registered checkouts' CLAUDE.md/AGENTS.md; Skills counter == the real
   folder count (`ls ~/.claude/skills | wc -l` vs the UI - report both); MCP names only).
   **Dump every tab's rendered text** (via the API responses concatenated, or page text via a
   throwaway script) to an UNTRACKED file and run `gitleaks detect --no-git` over it - zero
   findings is the criterion; any finding is reported BLOCKED with the rule name only (never
   the matched text) - a real secret in a memory/rules file is the USER's to rotate, not ours
   to paper over.
2. **Zahlen == zusammenfassung.md:** the last run's KPI rows against the file's table by eye
   and by diffing the parsed values (report the row count and one sampled row); `bestellungen`
   matches letzter-lauf.json.
3. **The archive lists every run** (three on the machine today - report the count found).
4. **The myCrafton links resolve:** with the real base configured, `curl -sI` each of the four
   link targets -> a non-5xx answer each (the host is live per the user's own notes); report
   the four status codes.
5. Screenshots of both apps (every tab / both runs) in both themes; Cockpit with the live
   Zahlen panel.

- [ ] **Step 1: Configure, measure. Step 2: full gate one last time. Step 3: Commit** (only if
      a tracked change was needed) - `docs: exploratory notes for Kontext and Zahlen`

---

## Self-review notes

- Names consistent across tasks: `Kpi`, `RunFolder`, `ZahlenContext`, `KontextContext`,
  `locateKontext`, `parseSummary`, `listRuns`, `lastRun`.
- The fence surface of this phase is two query parameters (`folder`, `name`) - both validated
  against exact closed shapes before any fs access; Kontext takes no client paths at all.
- The no-secret criterion is designed in, not bolted on: names-only extraction server-side, a
  poisoned fixture claude.json with a unit AND an e2e pin, and the live gitleaks dump in
  Task 9.
- Both apps ride existing config (CONTROLLING_DIR from Phase 4) plus one new key
  (`MYCRAFTON_URL`) and one test lever (`BENCH_CLAUDE_DIR`).
