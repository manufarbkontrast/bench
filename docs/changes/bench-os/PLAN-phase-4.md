# Bench OS Phase 4 - Eingang and runner - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Eingang app that lists what arrived and is not yet processed (transcripts, meeting
PDFs, voice notes), reconciled against the Plaud archive and notes; a jobs table and a runner
that starts the existing skill scripts and `claude -p` on click, with a live log, a kill switch
and a timeout; a read-only display of the externally scheduled runs; and the Cockpit's Eingang
panel going live.

**Architecture:** `server/src/eingang/` owns `data/eingang.sqlite` (one `jobs` table) and four
concerns kept in separate modules: the watch-folder scan with archive/note reconciliation
(`inbox.ts`), the job catalog with argument validation - the write fence (`jobs.ts`), the
process runner with log capture, kill and timeout (`runner.ts`), and the launchd schedule
reader (`schedule.ts`). Without `INBOX_WATCH`/`CONTROLLING_DIR` the app runs against bundled
fixtures, and in sample mode every spawn job runs a bundled fake script - the real skill
scripts and the real `claude` run only on a configured developer machine. The web app at
`/eingang` follows the Aufgaben app's shape. Jobs are started by click only; Bench schedules
nothing (SPEC principle 6).

**Tech Stack:** Express 5, better-sqlite3 12, `node:child_process` spawn, Vite 8 + React 19.
**No new dependency.**

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every
  shell. TypeScript `6.0.3` exactly; **no new dependencies at all.**
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task
  touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or the fixtures. Coverage
  stays at or above 80 % statements per workspace. Every gate step runs in the FOREGROUND with
  a generous explicit timeout and its own exit code - never piped through `tail`/`head`, and a
  run that gets auto-backgrounded is polled to completion immediately, never awaited
  (PROCESS.md records all three lessons). `watch.test.ts` coverage flake -> retry that step
  with `--maxWorkers=2`.
- Focused tests: `cd server && npx vitest run test/eingang` / `cd web && npx vitest run
src/eingang src/home`. e2e retry-safety proofs use `--workers=1 --repeat-each=2`.
- ESLint limits: 500 lines a file, 200 a function, complexity 15, depth 4, 5 parameters. No
  `any`. No emoji in code or comments. Comments say why. No super-linear regexes - hand-rolled
  scanners. Immutable data (a local accumulator may hold a `let`; the runner's per-job state
  record is the sanctioned mutable place, documented).
- **The write fence.** No job may write outside `PLAUD_HOME`, `VAULT_DIR` and
  `CONTROLLING_DIR`. Bench enforces its half at the API boundary: job kinds are a closed
  catalog, file arguments must be bare basenames that exist in the expected directory, modus is
  an enum - anything else is 400 before any process exists. The spawned commands' own
  discipline (the skill scripts, `claude -p --allowedTools`) is defense in depth, not the
  fence. Hostile-argument tests are a phase criterion, not an option.
- **The runner never runs the real thing in tests.** Unit tests drive the runner with the
  bundled fake script or injected argv; the e2e servers run in sample mode, where every spawn
  kind resolves to the fake. The real `claude`, the real skill scripts and the real
  `launchctl` domain exist only on a configured developer machine and in Task 11. CI never
  calls `claude` - that is a phase criterion.
- Reading is unrestricted inside the watch dirs; Bench itself writes nothing in this phase
  except `data/` (jobs db, logs). The vault write path from Phase 3 is untouched.
- Machine paths never appear in tracked files. The skills directory is derived from
  `os.homedir()` at runtime (a documented user-machine convention, like the Phase 3 mapping
  rules), never a literal. Fixtures are synthetic.
- German UI strings exactly as written in the tasks; identifiers, comments, docs and commits
  English. Conventional Commits, one line, imperative. Never push. Branch `bench-os-phase-4`,
  cut from `bench-os-phase-3` at ad1d681.

---

### Task 0: Setup

Controller work, no subagent: branch `bench-os-phase-4` exists (cut from `bench-os-phase-3` at
ad1d681), this plan is committed as `docs: the phase 4 plan`, the SDD ledger is initialised at
`.superpowers/sdd/PLAN-phase-4/progress.md`.

---

### Task 1: INBOX_WATCH and CONTROLLING_DIR configuration with the sample fixtures

**Files:**

- Modify: `server/src/config.ts`, `.env.example`, `e2e/fixtures.ts`, `server/vitest.config.ts`
  (coverage exclude gains `src/eingang/fixture/**`)
- Create: `server/src/eingang/locate.ts`, `server/test/eingang/tmp.ts` (scratchDir copy),
  and the fixtures:
  - `server/src/eingang/fixture/inbox/2026-08-30_werkstattrunde-transcript.txt` (three lines
    of synthetic German meeting text)
  - `server/src/eingang/fixture/inbox/08-20_Besprechung_Hafenrunde-transcript.pdf` (the bytes
    `%PDF-1.4\n%%EOF\n` - a stub; its NAME matches the aufgaben fixture note's `quelle`, so
    reconciliation has a deterministic "Notiz vorhanden" case in sample mode)
  - `server/src/eingang/fixture/inbox/aufnahme-2026-08-28.m4a` (empty file - the audio case)
  - `server/src/eingang/fixture/controlling/2026-08-15-zwischenstand/zusammenfassung.md`
    (a synthetic five-line summary with invented figures)
  - `server/src/eingang/fixture/launchagents/de.beispiel.controlling.zwischenstand.plist` and
    `...abschluss.plist` (minimal synthetic plists: Label + StartCalendarInterval with
    Day/Hour/Minute)
- Test: `server/test/config.test.ts` (extend), `server/test/eingang/locate.test.ts`

**Interfaces:**

- Produces: `Config.inboxWatch: string[]` (colon-separated dirs, tilde-expanded, like
  `projectRoots`), `Config.controllingDir?: string` (tilde-expanded);
  `locateEingang(config: Pick<Config, "inboxWatch" | "controllingDir">, fixtureDir: string): LocatedEingang`
  with
  `LocatedEingang { watchDirs: string[]; controllingDir: string; launchAgentsDir: string; source: "configured" | "sample"; missing: string[] }`
  - configured when at least one watch dir exists (existing ones win, missing ones reported);
    sample uses `<fixtureDir>/inbox` as the one watch dir, `<fixtureDir>/controlling` and
    `<fixtureDir>/launchagents`; configured mode's `launchAgentsDir` is
    `path.join(os.homedir(), "Library", "LaunchAgents")`. **Sample source implies the fake
    runner** - later tasks rely on that single switch.

- [ ] **Step 1: Failing tests.** Extend `config.test.ts`: `INBOX_WATCH` unset -> `[]`;
      `INBOX_WATCH="~/Downloads: /tmp/x :"` -> two entries, tilde expanded, empties dropped;
      `CONTROLLING_DIR` unset -> undefined, set -> expanded; `describeSources` includes
      `Eingang: not configured` / `` `Eingang: ${n} watch dirs` `` and
      `Controlling: not configured` / `Controlling: configured` (path-free).
      `locate.test.ts`: configured dirs that exist win and missing ones are named; nothing
      configured -> sample with the three fixture paths and `missing: []`; a configured
      controllingDir with unconfigured watch dirs still yields `source: "sample"` for the
      watch half - keep it one source flag: sample whenever NO watch dir is usable (the
      controlling dir then also falls back, one coherent world; assert that).
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement**, mirroring `projekte/locate.ts` + `aufgaben/locate.ts`.
      `.env.example` appends:

```
# Colon-separated folders the Eingang app watches for new material, e.g. ~/Downloads:~/Plaud/inbox
INBOX_WATCH=
# Where the controlling runs write their reports, e.g. ~/Downloads/shoesplease-controlling
CONTROLLING_DIR=
```

`e2e/fixtures.ts`: the per-worker env gains `INBOX_WATCH: ""` and `CONTROLLING_DIR: ""` with
the same shell-export-leak rationale comment as `PROJECT_ROOTS`/`PLAUD_HOME`.

- [ ] **Step 4: Suites green** (`cd server && npx vitest run test/eingang test/config.test.ts`),
      then `npm run format && npm run check && npm run e2e` (fixtures changed).
- [ ] **Step 5: Commit** - `feat: eingang configuration with bundled sample folders`

---

### Task 2: The inbox scan and the reconciliation

**Files:**

- Create: `server/src/eingang/inbox.ts`
- Test: `server/test/eingang/inbox.test.ts`

**Interfaces:**

- Produces:
  - `InboxFile { dir: string; name: string; size: number; mtime: number; kind: "text" | "audio"; status: "unverarbeitet" | "in_arbeit" | "notiz_vorhanden" }`
  - `listInbox(watchDirs: string[], plaud: { notizenDir: string; archivDir: string }, inFlight: Set<string>): InboxFile[]`
    - `inFlight` holds the file names a running job is processing (the routes compose it from
      the jobs table in Task 5; this module stays pure).
  - `quelleOf(noteText: string): string | null` - the `quelle:` value from a note's
    frontmatter, read with the same tolerant first-`": "` line scan Phase 3 established for
    Plaud notes. A deliberate small duplicate of that logic (~12 lines): `eingang` does not
    import `aufgaben` modules - apps stay separate; the comment says so.

**Listing rules, exact:** every file directly inside a watch dir (no recursion) whose name
either contains `transcript`, `transkript` or `besprechung` case-insensitively, or whose
extension is `.m4a`, `.mp3` or `.wav` (`kind: "audio"`); names starting with `.` or `_` are
skipped (the Plaud inbox keeps a `_HIER-...` marker file); a missing watch dir contributes
nothing (never a throw). A dir named in `watchDirs` that IS the Plaud inbox needs no special
case - the pattern rule applies everywhere, uniformly. Sorted by mtime descending. **Status:**
`notiz_vorhanden` when `<archivDir>/<name>` exists OR any `.md` in `notizenDir` has
`quelleOf === name`; `in_arbeit` when `inFlight.has(name)`; otherwise `unverarbeitet` -
checked in that order, archive/note wins over in-flight.

- [ ] **Step 1: Failing tests** - build scratch watch dirs plus scratch notizen/archiv:
      pattern matching (a `foo-transcript.txt` and a `Besprechung_x.pdf` listed, a `notes.txt`
      not, a `voice.m4a` listed as audio); `_`-prefixed and dot files skipped; missing dir ->
      `[]` contribution; archive hit -> `notiz_vorhanden`; a note with
      `quelle: <name with ": " in the same file's titel>` -> `notiz_vorhanden` (reuses the
      tolerant-scan property); `inFlight` -> `in_arbeit`; archive beats in-flight; mtime-desc
      order; `quelleOf` on a note without frontmatter -> null.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate.**
- [ ] **Step 5: Commit** - `feat: scan the watch folders and reconcile against the plaud archive`

---

### Task 3: The jobs database and the job catalog - the write fence

**Files:**

- Create: `server/src/eingang/db.ts`, `server/src/eingang/jobs.ts`
- Test: `server/test/eingang/db.test.ts`, `server/test/eingang/jobs.test.ts`

**Interfaces:**

- Produces in `db.ts`: `openEingangDb(file)` (WAL; the brief's schema verbatim):

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  args_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','done','failed','killed','timeout')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  exit_code INTEGER,
  log_path TEXT NOT NULL
);
```

plus `JobRow` (camelCase mirror), `insertJob`, `finishJob(db, id, status, exitCode)`,
`listJobs(db, limit)` (started_at desc), `getJob(db, id)`, `runningJobs(db)`, and
`failStaleRunning(db)` - every row still `running` is marked `failed` with exit_code null;
called once at boot, because a killed server leaves orphans (why-comment).

- Produces in `jobs.ts`: `JobKind = "plaud-sync" | "plaud-process" | "aufgaben-import" | "controlling" | "vault-reindex" | "projekte-scan"`;
  `JobPlan = { kind: "spawn"; argv: string[]; cwd: string } | { kind: "internal"; name: "vault-reindex" | "projekte-scan" }`;
  `planJob(kind: string, args: Record<string, unknown>, ctx: JobPaths): JobPlan | { error: string }`
  with `JobPaths { plaudHome: string; vaultDir: string; controllingDir: string; skillsDir: string; sample: boolean }`.

**Validation - the fence, exact:** unknown `kind` -> error. `plaud-process` and
`aufgaben-import` require `args.file`, a string that contains no `/`, no `\`, does not start
with `.` and names an existing file (inbox for plaud-process, notizen for aufgaben-import) -
anything else is an error, checked BEFORE any command is built. `controlling` requires
`args.modus` of exactly `"zwischenstand"` or `"abschluss"`. `plaud-sync`, `vault-reindex`,
`projekte-scan` take no args (extra args are an error - a fence that ignores input is not a
fence). **Commands, exact** (spawn kinds; `sample: true` replaces every argv below with
`[process.execPath, fakeJobPath, kind]` - the fake from Task 4):

- `plaud-sync` -> `["/bin/bash", <skillsDir>/plaud/scripts/plaud-sync.sh]`, cwd `plaudHome`
  (the script reads `PLAUD_HOME` from the env; the runner passes it through).
- `plaud-process` -> `["claude", "-p", <prompt>, "--max-turns", "40", "--allowedTools", "Read,Glob,Grep,Write,Edit,Skill,Bash"]`,
  cwd `plaudHome`, prompt exactly
  `` `Verarbeite mit dem plaud-Skill die Transkript-Datei ${plaudHome}/inbox/${file} zu einer Meeting-Notiz und archiviere das Original. Schreibe nur unter ${plaudHome}.` ``
  (the allowlist is a constant; Task 11 verifies it live and may tighten it - the report says
  what held).
- `aufgaben-import` -> `["claude", "-p", <prompt>, "--max-turns", "30", "--allowedTools", "Read,Glob,Grep,Write,Edit,Skill", "--add-dir", vaultDir]`,
  cwd `vaultDir`, prompt exactly
  `` `Führe das aufgaben-import-Skill für die Plaud-Notiz ${plaudHome}/notizen/${file} aus. Schreibe nur in den Vault unter ${vaultDir}.` ``
- `controlling` -> `["/bin/bash", <skillsDir>/shoesplease-controlling/scripts/geplanter_lauf.sh, modus]`,
  cwd `controllingDir`.
- `skillsDir` is `path.join(os.homedir(), ".claude", "skills")`, computed by the caller
  (index.ts) - a user-machine convention, documented, never a tracked literal path beyond
  `.claude/skills`.

- [ ] **Step 1: Failing tests.** `db.test.ts`: insert/finish/list round-trip camelCase;
      `runningJobs` filters; `failStaleRunning` flips exactly the running rows.
      `jobs.test.ts` (scratch dirs; `sample: false`): unknown kind -> error; `plaud-process`
      with `file: "../x"`, `"a/b"`, `"a\\b"`, `".hidden"`, a missing file, a non-string ->
      error each; with a real inbox file -> argv starts `["claude", "-p"]` and the prompt
      names the absolute inbox path; `controlling` with `modus: "beides"` -> error, with
      `"zwischenstand"` -> argv ends with the modus; `plaud-sync` with any extra arg -> error;
      `vault-reindex` -> `{ kind: "internal", name: "vault-reindex" }`; with `sample: true`
      every spawn kind resolves to `[process.execPath, fakeJobPath, kind]`.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate.**
- [ ] **Step 5: Commit** - `feat: the jobs table and the fenced job catalog`

---

### Task 4: The runner - spawn, log, kill, timeout

**Files:**

- Create: `server/src/eingang/runner.ts`, `server/src/eingang/fixture/fake-job.mjs`
- Test: `server/test/eingang/runner.test.ts`

**Interfaces:**

- Produces: `Runner` - created once per server with
  `createRunner(db, jobsDir, internals: { "vault-reindex": (log: (line: string) => void) => Promise<void>; "projekte-scan": ... })`;
  methods `start(kind: JobKind, argsJson: string, plan: JobPlan, env: NodeJS.ProcessEnv, timeoutMs: number): JobRow`
  (inserts the row `running`, opens `<jobsDir>/<id>.log`, spawns or runs the internal fn),
  `kill(id): boolean` (SIGTERM; SIGKILL after 5 s if still alive - why-comment; false when
  not running), `isRunning(kind): boolean`. Status on exit: exit 0 -> `done`; non-zero ->
  `failed`; killed via `kill()` -> `killed`; timeout fires SIGTERM/SIGKILL and marks
  `timeout`. stdout+stderr both stream to the log file; internal jobs get the `log` callback
  writing timestamped lines to the same file. The in-flight map `id -> child` is the one
  sanctioned mutable record (comment).
- `fake-job.mjs` (committed fixture): prints `fake-job start <kind>`, then one line per second
  for 3 seconds, exits 0; `BENCH_FAKE_JOB=fail` exits 2 after one line; `BENCH_FAKE_JOB=hang`
  loops forever (for the kill and timeout tests).

**Timeouts per kind** (constants in `jobs.ts`, exported): plaud-sync 5 min, plaud-process
20 min, aufgaben-import 15 min, controlling 45 min, internals 10 min.

- [ ] **Step 1: Failing tests** (all against `fake-job.mjs` with a scratch db + jobs dir;
      generous vitest timeouts with why-comments): a completed run -> status `done`, exit 0,
      log contains `fake-job start` and the row's `finishedAt` set; `BENCH_FAKE_JOB=fail` ->
      `failed`, exit 2; `kill()` on a hanging job -> `killed`, log preserved up to the kill;
      a 1 s `timeoutMs` on a hanging job -> `timeout`; `isRunning` true while alive, false
      after; an internal job's log lines land in the file and its rejection -> `failed`.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate.**
- [ ] **Step 5: Commit** - `feat: the job runner with logs, kill and timeout`

---

### Task 5: The schedule reader, the eingang API and the server wiring

**Files:**

- Create: `server/src/eingang/schedule.ts`, `server/src/eingang/routes.ts`
- Modify: `server/src/app.ts` (mount `/api/eingang`, `Dbs.eingang`), `server/src/index.ts`
  (open `data/eingang.sqlite`, `locateEingang`, `failStaleRunning`, build the runner with the
  two internals wired to `indexAll` and `scanProjects`, one startup line
  `` `Eingang: ${n} watch dirs (${source}), ${m} jobs recorded` ``)
- Test: `server/test/eingang/schedule.test.ts`, `server/test/eingang/routes.test.ts` (+ an
  `app.ts` harness beside them; the crm/vault/projekte/aufgaben harnesses gain an
  `emptyEingang()` where they build a full `Dbs`)

**Interfaces:**

- `schedule.ts`: `ScheduledRun { label: string; day: number | null; hour: number | null; minute: number | null }`;
  `listScheduledRuns(launchAgentsDir: string): ScheduledRun[]` - every `.plist` whose Label
  contains `shoesplease` or `controlling` (the display allowlist - a user-machine convention,
  documented); parsed with a hand-rolled line scanner for `<key>Label</key>` /
  `StartCalendarInterval`'s `Day`/`Hour`/`Minute` integers - no XML library, no regex
  backtracking; unreadable dir -> `[]`. The fixture plists use `de.beispiel.controlling.*`
  labels so the allowlist matches in sample mode.
- `routes.ts` (router takes `EingangContext`,
  `EingangContext { db: Database; located: LocatedEingang; plaud: { dir: string; source: string }; runner: Runner; paths: JobPaths }`
  as `Dbs.eingang`; the plaud context is the Phase 3 one - the notizen dir; archivDir is
  derived as its `../archiv` only when configured, else the fixture has none and
  reconciliation runs on notes alone):
  - `GET /inbox` -> `{ source, files: InboxFile[] }` (inFlight composed from
    `runningJobs(db)` args).
  - `GET /jobs` -> `{ jobs: JobRow[] }` (last 50).
  - `GET /jobs/:id` -> `{ job, log }` - `log` is the last 64 KB of the log file (a cap with a
    why-comment; the UI polls this).
  - `POST /jobs` body `{ kind, args? }` -> 201 `{ job }`; 400 on any fence violation (the
    `planJob` error verbatim); **409** `{ error: "already running" }` when `isRunning(kind)`.
  - `POST /jobs/:id/kill` -> 200 `{ job }`; 404 unknown; 409 when not running.
  - `GET /schedule` -> `{ runs: ScheduledRun[] }`.

- [ ] **Step 1: Failing tests.** `schedule.test.ts`: the two fixture plists parse to their
      Day/Hour/Minute; a non-matching label is skipped; a plist without StartCalendarInterval
      yields nulls; missing dir -> `[]`. `routes.test.ts` via the harness in sample mode
      (fixture watch dir, fake runner): `GET /inbox` lists the three fixture files with the
      Hafenrunde stub as `notiz_vorhanden` (quelle match against the aufgaben fixture note)
      and the transcript as `unverarbeitet`; `POST /jobs` `{kind: "plaud-sync"}` -> 201 and
      the job reaches `done` with the fake log (poll the db, generous timeout, why-comment);
      hostile args (`plaud-process` with `file: "../../etc/hosts"`, `controlling` with
      `modus: "x"`, unknown kind) -> 400 each and the jobs table stays empty - the fence
      criterion in miniature; double-start of a hanging kind -> 409; kill flips it to
      `killed`; `GET /jobs/:id` returns the log text; `GET /schedule` -> the two fixture
      runs.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e** (app.ts/index.ts changed).
- [ ] **Step 5: Commit** - `feat: the eingang API with fenced jobs and the schedule display`

---

### Task 6: The Eingang app shell - inbox list and job start

**Files:**

- Create: `web/eingang/index.html`,
  `web/src/eingang/{main.tsx,App.tsx,api.ts,types.ts,format.ts,styles.css}`,
  `web/src/eingang/components/InboxList.tsx`
- Modify: `web/vite.config.ts` (input + appFallback APPS), `server/src/app.ts` APPS (verify
  both agree), `web/src/shared/AppIcons.tsx` (IconEingang), `web/src/shared/BenchNav.tsx`
  (AppKey + entry between Aufgaben and CRM), `eslint.config.js` (web denylist array gains
  `"eingang"`, comment count updated)
- Test: `web/src/eingang/{App.test.tsx,format.test.ts}`,
  `web/src/eingang/components/InboxList.test.tsx`, extend `web/src/shared/BenchNav.test.tsx`
  (order: Start, Vault, Projekte, Aufgaben, Eingang, CRM, Rolodex)

**German strings, exact:** document title and h1 `Eingang`; section heading
`Neu und unverarbeitet`; status chips `Unverarbeitet`, `In Arbeit`, `Notiz vorhanden`; per
text-kind file a button `Verarbeiten` (starts `plaud-process` when the file sits in the Plaud
inbox, otherwise it is disabled with `title="Erst einsammeln"` - only inbox files are
processable, the sync moves them there); audio rows show the chip but no button (Bench does
not transcribe - the Plaud device does; a muted `Nur Ablage` label instead); header actions:
`Einsammeln` (plaud-sync); file meta line: size in `KB`/`MB` (format helper, de-DE decimal
comma) and `dateText` (the de-DE medium date, the established duplicate); empty state
`Nichts Neues.`; a 409 from a double start shows `Läuft bereits.` and refetches. Layout,
styles, token discipline: exactly the Aufgaben app's pattern, every class `eingang-`-prefixed.

IconEingang (match the AppIcons component shape - an inbox tray):

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
  <path d="M4 4h16v16H4z" />
  <path d="M4 13h5l1.5 2.5h3L15 13h5" />
</svg>
```

- [ ] **Step 1: Failing tests.** `format.test.ts`: `sizeText(2048)` -> `2,0 KB`,
      `sizeText(3 * 1024 * 1024)` -> `3,0 MB`. `InboxList.test.tsx` (rows as props): chips per
      status, the button only on processable rows and carrying the file name in its accessible
      name, audio rows show `Nur Ablage`. `App.test.tsx` (mock api): rows after load;
      `Einsammeln` posts `plaud-sync` and refetches; a 409 shows `Läuft bereits.`; BenchNav
      order test updated.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e** (fix a tripped nav-list assertion
      minimally and disclose it; the full smoke/theme rework is Task 8's).
- [ ] **Step 5: Commit** - `feat: the Eingang app with the watched inbox`

---

### Task 7: Jobs UI - table, live log, kill - and the scheduled runs

**Files:**

- Create: `web/src/eingang/components/{JobsPanel.tsx,LogView.tsx,SchedulePanel.tsx}`
- Modify: `web/src/eingang/{App.tsx,api.ts,types.ts,styles.css}`
- Test: `web/src/eingang/components/{JobsPanel.test.tsx,LogView.test.tsx,SchedulePanel.test.tsx}`,
  extend `App.test.tsx`

**German strings and semantics, exact:** section `Jobs`; start buttons above the table:
`Einsammeln` (moved here from Task 6's header if that reads better - one place only),
`Controlling Zwischenstand`, `Controlling Abschluss`, `Vault neu indexieren`,
`Projekte scannen`; the table: columns `Job`, `Status`, `Gestartet`, `Dauer`, `Ende`; kind
labels `Einsammeln`, `Verarbeiten: <datei>`, `Aufgaben-Import: <datei>`,
`Controlling (<modus>)`, `Vault-Reindex`, `Projekte-Scan`; status German: `Läuft`, `Fertig`,
`Fehlgeschlagen`, `Abgebrochen`, `Zeitüberschreitung`; a running row has the button
`Abbrechen`; selecting a row opens `LogView` - a plain panel with the job label, the status
line and the log text in a `<pre>`, polling `GET /jobs/:id` every 2 s while `Läuft` (an
interval with cleanup; comment why 2 s: human-readable tail, not a stream), a `Schließen`
button, Escape closes; empty states `Keine Jobs.`; section `Geplante Läufe`: rows
`` `${label} — Tag ${day}, ${hh}:${mm} Uhr` `` (nulls render `—`), empty state
`Keine geplanten Läufe gefunden.`, and one muted line beneath:
`Bench plant nichts; das sind die launchd-Einträge dieser Maschine.`

- [ ] **Step 1: Failing tests** - JobsPanel: start buttons post the right kinds; running row
      shows `Abbrechen` and it calls `onKill(id)`; status German mapping. LogView: renders
      label + log, polls while running (fake timers), stops when done, Escape/`Schließen`
      call `onClose`. SchedulePanel: two runs render, nulls as em dash. App: selecting a job
      row opens the log; kill refetches.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement.**
- [ ] **Step 4: Suites green, full gate including e2e.**
- [ ] **Step 5: Commit** - `feat: jobs with live log, kill and the scheduled runs`

---

### Task 8: The Cockpit Eingang panel goes live

**Files:**

- Modify: `web/src/home/{App.tsx,api.ts,types.ts}`, `web/src/home/App.test.tsx`,
  `e2e/smoke.spec.ts` (seams list gains `/eingang/` with a ready-locator on the
  `Neu und unverarbeitet` heading), `e2e/theme.spec.ts` (APPS gains `/eingang/`),
  `e2e/cockpit.spec.ts` (the Eingang panel assertion changes from the placeholder to the live
  counter)

**Semantics, exact:** the `Eingang` panel replaces
`Kommt mit der Eingang-App (Phase 4).` with one fetch of `GET /api/eingang/inbox`: the line
`` `${n} unverarbeitet` `` (count of `status === "unverarbeitet"`; `1 unverarbeitet`
singular-safe since the word does not inflect) plus the link `Verarbeiten` to `/eingang/`;
zero -> `Nichts Neues.` and the link stays. The app row gains the `Eingang` anchor between
`Aufgaben` and `CRM`. Panel order and every other string unchanged.

- [ ] **Step 1: Failing tests** - home App.test: the panel shows `2 unverarbeitet` from a
      mocked reply (fixture world: transcript + audio unprocessed, Hafenrunde reconciled) and
      the `Verarbeiten` link; zero-case shows `Nichts Neues.`; the app row has six links.
- [ ] **Step 2: Watch them fail.** **Step 3: Implement, adjust the three e2e specs.**
- [ ] **Step 4: Suites green, full gate including e2e.**
- [ ] **Step 5: Commit** - `feat: the Cockpit counts the Eingang`

---

### Task 9: The Eingang e2e suite

**Files:**

- Create: `e2e/eingang/{inbox.spec.ts,jobs.spec.ts}`

**Interfaces:** the per-worker server runs in sample mode (fixture inbox, fake runner,
`INBOX_WATCH: ""`), `test`/`expect` from `../fixtures` only, no `waitForTimeout`, retry-safety
proven with `--workers=1 --repeat-each=2` (jobs accumulate in the worker's db across a retry -
every assertion must scope to the job it just created, by picking the FIRST matching row or
asserting on counts relatively, never absolutely).

- [ ] **Step 1: inbox.spec.ts** - `/eingang/` lists the three fixture files;
      `werkstattrunde-transcript` carries `Unverarbeitet`, the Hafenrunde stub
      `Notiz vorhanden`, the m4a `Nur Ablage`; the smoke seam already proves boot.
      **jobs.spec.ts** - start `Vault neu indexieren` (internal, fast, side-effect-free on
      the fixture copy): a `Läuft`/`Fertig` row appears without reload (poll, comment);
      open its log - the panel shows log text; start `Einsammeln` (the fake, ~3 s), while it
      runs click `Abbrechen` - the row reaches `Abgebrochen` and the log stays visible;
      double-start guard: start `Einsammeln` twice quickly -> the message `Läuft bereits.`
      appears (race-tolerant: if the first already finished, start it again while the fake
      hangs? no - use the fake's 3 s window and poll the message OR accept a second `Fertig`
      row; pin the deterministic path: the fake sleeps 3 s, the double click lands inside it).
- [ ] **Step 2: Run at `--retries=0`, then `--workers=1 --repeat-each=2`, then the full
      `npm run e2e` twice.** Fix flakiness at the root.
- [ ] **Step 3: Full gate. Commit** - `test: the eingang browser suite over the fake runner`

---

### Task 10: Documentation and the six-app sweep

**Files:**

- Create: `docs/eingang/{REQUIREMENTS.md,IMPLEMENTATION.md}`
- Modify: `docs/PROJECT.md` (app table row, layout tree gains `server/src/eingang/` and
  `data/eingang.sqlite` + `data/jobs/*.log`, the Bench OS decisions gain the runner bullet:
  local CLIs on click with the fence, no scheduling), `AGENTS.md` (six apps), `README.md`,
  `docs/PROCESS.md` (e2e layout list), `docs/cockpit/IMPLEMENTATION.md` (the Eingang panel is
  live now), `e2e/EXPLORATORY.md` (what stays uncovered: the real `claude -p` jobs, the real
  skill scripts, launchd parsing against real plists)

**Content rules:** IMPLEMENTATION.md states the fence exactly (catalog, basename rule, enum,
400-before-spawn), the fake-runner switch (sample source), the status model incl.
`failStaleRunning` on boot, the log cap, the kill escalation (SIGTERM then SIGKILL after 5 s),
the per-kind timeouts, the launchd allowlist convention, and a "Things that will bite" list
(a job that daemonizes escapes SIGTERM's reach; the log tail is a cap, not a stream; the
schedule reader knows only StartCalendarInterval; audio is listed, never processed;
plaud-process only reaches files already in the Plaud inbox). Every claim checked against the
code; no machine paths; no volatile counts.

- [ ] **Step 1: Write and verify. Step 2: `npm run format && npm run check`.
      Step 3: Commit** - `docs: the Eingang app and the six-app tree`

---

### Task 11: Final gate against the real machine

**Files:**

- Modify: `.env` (untracked): append `INBOX_WATCH=~/Downloads:~/Plaud/inbox:~/Downloads/Besprechungs-Textfiles:~/Documents/voice-notes/dictation:~/Documents/voice-notes/recordings`
  and `CONTROLLING_DIR=~/Downloads/shoesplease-controlling`
- Create: the criteria report in the SDD workspace (untracked); screenshots under `data/`
  (untracked)

**The Phase 4 success criteria, each measured:**

1. **The unprocessed material is listed**: the three `*-transcript.pdf` in `~/Downloads`, the
   two PDFs in `Besprechungs-Textfiles`, the voice notes - named in the untracked report by
   basename; the archived Q4 transcript must NOT appear unprocessed (reconciliation proof).
2. **Verarbeiten produces a note and archives the original**: run `Einsammeln` (real
   plaud-sync - this MOVES the transcripts from `~/Downloads` into `~/Plaud/inbox`; approved
   at plan sign-off), then `Verarbeiten` on ONE transcript (the user's pick at sign-off,
   default: the Kassenfehlbetrag one) - the real `claude -p` runs; verify the new note in
   `~/Plaud/notizen`, the original in `archiv/`, the log visible in Bench, and the file now
   `Notiz vorhanden`. The other files stay untouched.
3. **Cancel works**: start a second `Verarbeiten`, cancel it mid-run, verify `Abgebrochen`,
   the inbox file still present and unprocessed, no half-written note left in `notizen/`
   (report what the log shows).
4. **A controlling run from Bench**: start `Controlling Zwischenstand` (real
   `geplanter_lauf.sh` - live API calls; approved at sign-off); verify the new
   `<today>-zwischenstand/zusammenfassung.md` under `CONTROLLING_DIR` and the exit in the
   job log. "Shows in Zahlen" is Phase 5's half of that criterion, deferred by plan approval.
5. **The fence holds against hostile arguments**: `curl` the API with `file=../../../etc/hosts`,
   an absolute path, a `; rm` payload in modus - 400 each, jobs table unchanged (also proven
   in Task 5's tests; repeat live for the report).
6. **No real `claude` in CI**: point at the sample-mode wiring and the fake-runner tests -
   the criterion is architectural, met by construction; state where.
   Plus: screenshots of `/eingang/` (inbox, jobs with a log open, schedule) and the Cockpit
   panel in both themes; the scheduled runs list shows the two real launchd entries.

- [ ] **Step 1: Configure, run, measure.** A failing criterion is BLOCKED with evidence,
      never patched silently. **Step 2: Full gate one last time. Step 3: Commit** (only if a
      tracked change was needed) - `docs: exploratory notes for the Eingang app`

---

## Self-review notes

- Names used across tasks are consistent: `LocatedEingang`, `InboxFile`, `JobRow`, `JobKind`,
  `JobPlan`, `JobPaths`, `Runner`, `ScheduledRun`, `EingangContext`, `fake-job.mjs`.
- One switch governs everything unreal: `source: "sample"` (no usable watch dir) implies the
  fixture folders AND the fake runner - e2e and `npm start` without `.env` never touch a real
  tool. The internals (vault-reindex, projekte-scan) run real everywhere because they are
  Bench's own code over Bench's own data.
- The fence is Bench's API validation; `--allowedTools` and the scripts' own discipline are
  depth, not the fence. Phase 6's adversarial pass gets another swing at it.
- Decisions the brief leaves open, to confirm at plan approval: audio files are listed but
  never processed (`Nur Ablage`); "Ergebnis in Zahlen sichtbar" is split - Phase 4 proves the
  report lands in `CONTROLLING_DIR`, Phase 5 shows it; the schedule display reads launchd
  plists filtered by a shoesplease/controlling label allowlist; `aufgaben-import` exists as a
  fenced API job kind but gets no start button - the Aufgaben app's own in-app import
  (Phase 3, ledger-guarded) is the interactive path, and two doors to the same write would
  need two guards; Task 11 really moves the three Downloads transcripts into the Plaud inbox
  (plaud-sync's actual job) and really processes ONE of them with the real `claude`, and
  really starts one `zwischenstand` controlling run with live API calls.
