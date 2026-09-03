# Bench OS Phase 6 - Quality Gate - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The final phase closes the whole change: the two standing test debts are retired, the
adversarial cases from PLAN.md are each probed and every finding fixed with a regression test or
rejected in writing, a look-and-feel pass and a screen-by-screen browser walkthrough cover all
nine documents in both themes on the real machine, and the docs end current - so the SPEC's
overall success criteria can be measured PASS.

**Architecture:** No new features and no new surface. Phase 6 produces fixes, tests, screenshots
and ledger verdicts. Adversarial probes run against scratch fixtures (never the user's real
vault) plus the real machine where the case demands it; permanent regression tests land only
where a finding is fixed - correct behavior is recorded in the ledger and, where it stays
untested, in `e2e/EXPLORATORY.md`. The one policy change on the table is symlink containment on
the two write/job surfaces (decision 4).

**Tech Stack:** The existing stack. **No new dependency, no new database, no new route.**

## Global Constraints

- Node: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` at the start of every
  shell. TypeScript `6.0.3` exactly.
- Before every commit: `npm run format`, then `npm run check`, then `npm run e2e` when the task
  touches `e2e/`, `web/`, `server/src/app.ts`, `server/src/index.ts` or the fixtures. Coverage
  stays at or above 80 % statements per workspace. Every gate step FOREGROUND with a generous
  explicit timeout and its own exit code - never piped through `tail`/`head`; a run that gets
  auto-backgrounded is polled to completion immediately, never awaited. Until Task 1 retires it:
  `watch.test.ts` coverage flake -> retry that step with `--maxWorkers=2`. Opaque failure ->
  `df -h` first.
- ESLint limits: 500/200/complexity 15/depth 4/5 params. No `any`. No emoji in code or
  comments. Comments say why. Immutable data. e2e retry-safety proofs use
  `--workers=1 --repeat-each=2`.
- **The user's real vault is read-only to this phase** except the single approved toggle
  round-trip in Task 7 (decision 2). Adversarial fixtures are scratch copies
  (`server/test/vault/fixture.ts`'s `copyFixture` pattern) or temp dirs - never the real vault,
  never tracked. **The 5 MB note is generated at probe time and never committed.**
- Machine paths, vault contents, memory contents and the myCrafton base never appear in tracked
  files or reports - basenames, counts and status codes only (the house redaction rule).
- German UI strings; identifiers/comments/commits English. Conventional Commits, one line, then
  a blank line and EXACTLY these two trailers on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` <!-- allow-secret: Anthropic's own no-reply address, required verbatim in every commit trailer --> and
  `Claude-Session: https://claude.ai/code/session_01MoJadrroWuuNdrBRnWAPCF`. Never push
  without being asked. Branch `bench-os-phase-6`, cut from `bench-os-phase-5` at 2e5bfb2.

## Decisions settled at plan approval

All seven recommendations approved by the user 2026-09-03.

1. **Branch stacking.** `bench-os-phase-6` is cut from the unpushed `bench-os-phase-5`, the
   established stack. Recommended: yes.
2. **Real-machine writes.** The Task 7 walkthrough performs exactly ONE task toggle plus its
   revert on a task the user names (or, unnamed, a task in the fixture-independent test note the
   user already used in Phase 3's gate); no real `claude` runs and no real controlling run this
   phase - Phase 4's gate proved those. Recommended: yes.
3. **watch.test.ts remedy.** Root cause first, per PROCESS.md. If the proven cause is a genuine
   defect (shared state, unmet wait), fix it there. If the proven cause is coverage-instrumented
   parallel scheduling starving the watcher, sequencing the one file via a second vitest project
   is the accepted remedy. Recommended: accept the fallback.
4. **Symlink policy.** Listing and reading may follow symlinks (user-planted, local-first). The
   two guarded surfaces get realpath containment: `planJob`'s file argument must resolve inside
   its folder's realpath, and `toggleTask`/`createTask`'s note path must resolve inside the
   vault's realpath. Recommended: yes (the fence's spirit, cheap). Alternative: reject in
   writing and document.
5. **Deferred-minors subset.** Task 5 fixes the eight items listed there; every other triaged
   minor stays per its recorded ruling. Recommended: the eight; trim or extend at approval.
6. **pid-recording boot SIGTERM hardening** stays out of Phase 6 - it remains the documented
   later hardening from Phase 4. Recommended: yes.
7. **Look-and-feel authority.** The agent fixes objective STANDARDS violations (literal colours,
   missing dark values, missing `color-scheme`, decorative shadows, misalignment measured by
   rect); subjective observations go to the user as a list in the criteria report, and only the
   items the user picks become a fix round. Recommended: yes.

## Phase success criteria

1. Every adversarial case in Tasks 3-4 has a ledger verdict: PASS as-is, FIXED with a
   regression test, or REJECTED in writing with the reasoning.
2. `npm run check` green with coverage at or above 80 % statements in both workspaces and
   `npm run e2e` green; the server coverage suite passes ten consecutive runs with no
   `--maxWorkers=2` retry (Task 1's acceptance).
3. SIGKILL escalation in the eingang runner is proven by a test whose child demonstrably
   ignores SIGTERM and still dies (Task 2).
4. Every screen of all nine documents visited in a real browser in both themes on the real
   machine, screenshots captured untracked; the toggle round-trip shows in Obsidian.
5. Zero objective STANDARDS-UI violations remain; the subjective observations list is in the
   criteria report.
6. Docs current: `CONTROLS.md`'s coverage table matches `npm run coverage`, `EXPLORATORY.md`
   names what the adversarial pass leaves uncovered, and the recursive word-bounded count
   sweeps find no stale figure.
7. The SPEC's three overall success criteria each measured and reported PASS.

---

### Task 0: Setup

Controller work, no subagent: branch `bench-os-phase-6` cut from `bench-os-phase-5` at 2e5bfb2,
this plan committed as `docs: the phase 6 plan`, the ledger initialised at
`.superpowers/sdd/PLAN-phase-6/progress.md`.

---

### Task 1: The watch.test.ts flake, root-caused and retired

The parallel-coverage flake has 20+ recorded recurrences across Phases 3-5; the standing remedy
is a retry crutch. PROCESS.md's rule applies: prove the cause before choosing the remedy.

**Files:**

- Investigate: `server/test/vault/watch.test.ts` (the 30 s `nextChange` waiter, the
  per-test `copyFixture` scratch dir), `server/src/vault/watch.ts`, `server/vitest.config.ts`
- Modify (path A - defect): whichever of the two files holds the proven defect
- Modify (path B - scheduling): `server/vitest.config.ts` - split the suite into two vitest
  projects, `unit` (everything except `test/vault/watch.test.ts`, parallel as today) and
  `watch` (only that file, `fileParallelism: false`), so one `npx vitest run --coverage` still
  runs everything and the watcher file never competes with instrumented siblings
- Modify: every doc line that prescribes the `--maxWorkers=2` retry remedy
  (`git grep -n "maxWorkers"` at execution time; the phase plans are frozen history and stay)

**Interfaces:** none - no production API changes on path B; path A changes stay inside the two
named files.

- [ ] **Step 1: Reproduce.** `cd server && for i in $(seq 1 10); do npx vitest run --coverage || echo "RUN $i FAILED"; done`
      in the foreground, output captured to the scratchpad. Record the failure rate and the
      exact failing assertion in the ledger. Zero failures in 10 -> raise to 20 before
      concluding anything.
- [ ] **Step 2: Root-cause with evidence.** Instrument locally (timestamps around the chokidar
      event and the waiter): is the event lost, late past 30 s, or is the test's own setup
      racing? Write the cause and the evidence in the ledger BEFORE touching a fix.
- [ ] **Step 3: The remedy.** Path A for a defect; path B for pure scheduling starvation
      (decision 3). Either way the change carries a why-comment naming the recorded cause.
- [ ] **Step 4: Acceptance.** Ten consecutive `npx vitest run --coverage` runs green, no retry;
      then one full `npm run check`.
- [ ] **Step 5: Commit** - `fix: retire the watch.test.ts parallel-coverage flake` (or `test:`
      when only test/config files change).

---

### Task 2: SIGKILL delivery proven

The escalation exists (`escalateKill`, `KILL_ESCALATION_MS = 5000` in
`server/src/eingang/runner.ts`) but no test has ever observed a SIGKILL actually land.

**Files:**

- Modify: `server/src/eingang/runner.ts` - `createRunner(db, jobsDir, internals)` gains an
  optional fourth parameter `killEscalationMs = KILL_ESCALATION_MS`, threaded into
  `escalateKill` (which gains the ms parameter); production call sites unchanged.
- Create: `server/src/eingang/fixture/hang-hard.mjs`:

```js
// A child that ignores SIGTERM, for proving the runner's SIGKILL escalation actually lands.
process.on("SIGTERM", () => {});
console.log("hang-hard: alive, ignoring SIGTERM");
setInterval(() => {}, 1000);
```

- Test: `server/test/eingang/runner.test.ts`

**Interfaces:**

- Produces: `createRunner(db: Database.Database, jobsDir: string, internals: RunnerInternals, killEscalationMs?: number): Runner`.

- [ ] **Step 1: Failing tests.** Two pins in one describe:
      (a) non-vacuousness - spawn `hang-hard.mjs` directly with `child_process.spawn`, send
      SIGTERM, wait 300 ms, assert `child.exitCode === null` (it really ignores the signal),
      then SIGKILL it for cleanup;
      (b) delivery - `createRunner(db, jobsDir, internals, 200)`, start a spawn plan
      `argv: [process.execPath, HANG_HARD_PATH]`, `runner.kill(id)`, then poll the job row
      (the suite's existing log-poll helper pattern) until status `killed` within 5 s - a
      SIGTERM-ignoring child can only reach `killed` through a delivered SIGKILL.
- [ ] **Step 2: Watch them fail** ((b) fails against the current 4-arg-less signature; after
      wiring, (b) proves delivery within the short grace).
- [ ] **Step 3: Implement** the parameter threading.
- [ ] **Step 4: Suites green** (`cd server && npx vitest run test/eingang`), then the full gate.
- [ ] **Step 5: Commit** - `test: prove SIGKILL escalation with a SIGTERM-ignoring child`

---

### Task 3: Adversarial pass - the vault-facing cases

Each case follows the same protocol: build the scratch fixture, run the probe, compare against
the stated invariant, then verdict in the ledger - PASS / FIXED (failing test first, then the
fix, test kept) / REJECTED in writing. Scratch dirs live under the scratchpad or `os.tmpdir()`;
nothing lands in the repo unless it is a regression test for a fix.

**Files:**

- Probe against: `server/src/vault/index/`, `server/src/vault/routes/`,
  `server/src/vault/watch.ts`, `server/src/vault/write.ts`, the aufgaben task list
- Create only on findings: tests beside the module they pin, minimal fixture additions under
  `server/src/vault/fixture/` (small files only)
- Modify on decision 4: `server/src/vault/write.ts` (realpath containment before any write),
  `server/test/vault/write.test.ts`

**The cases and their invariants:**

- [ ] **Case V1 - broken frontmatter.** Scratch note with an unclosed `---` block and another
      with malformed YAML inside a closed block. Invariant: `indexAll` and the watcher do not
      throw; both notes appear in the tree and in search by body text; `GET` of each note
      returns 200; no vault route 500s. Probe: unit-level against a `copyFixture` dir plus
      supertest; then the dev server on a scratch `VAULT_DIR` in the browser.
- [ ] **Case V2 - umlauts and emoji in paths.** Scratch folder `Straßen-Café/` with note
      `Über uns ☕.md` containing a wikilink to an existing fixture note and a tag. Invariant:
      tree renders both names; the note opens via its encoded deep link `/vault/n/<encoded>`;
      the backlink appears on the target note; FTS finds the body; the open-in-Obsidian URL is
      correctly encoded; an eingang watch dir containing `Straßen-Notiz 📝.txt` lists it with
      the right status. Probe: unit + browser.
- [ ] **Case V3 - the 5 MB note.** Generated at probe time
      (`node -e` writing ~5 MB of repeated paragraphs plus three wikilinks) into a scratch
      vault. Invariant: `indexAll` completes; an edit is picked up by the watcher inside its
      normal window; the note route returns; the browser renders it without freezing the tab
      (slow is acceptable, a crash or an unresponsive UI is not); FTS insert does not error.
      Record the measured index and render times in the ledger.
- [ ] **Case V4 - symlinks in the vault.** Three scratch cases: a file symlink inside the vault
      to another vault note; a file symlink pointing outside the vault; a directory symlink
      pointing outside. Invariants: nothing crashes the indexer or the watcher; and under
      decision 4 the WRITE surface refuses to follow an escape -
      `toggleTask`/`createTask` on a path whose realpath resolves outside the vault's realpath
      answer the error idiom instead of writing outside (test with `fs.symlinkSync` in a
      scratch copy). Read/list behavior is recorded as-is and documented, not changed.
- [ ] **Case V5 - wrong vault path, product level.** Start the BUILT server
      (`npm start` env: `VAULT_DIR=/no/such/dir`). Invariant: the startup log says the vault is
      not found (the Phase 1 behavior); `/vault`, `/aufgaben` and Kontext's vault-backed tabs
      show their empty states; no route 500s; the Cockpit renders. Probe: curl the routes, then
      the browser.
- [ ] **Per case: verdict in the ledger.** For every FIXED case the regression test is named in
      the verdict; for every PASS that stays otherwise untested, the `EXPLORATORY.md` line to
      write in Task 8 is drafted in the ledger.
- [ ] **Gate and commit** - `test: adversarial pass over the vault surfaces` (or `fix:` when a
      production fix dominates; one commit per coherent fix is fine - the task ends with the
      tree clean and green).

---

### Task 4: Adversarial pass - projekte and eingang cases

Same protocol as Task 3.

**Files:**

- Probe against: `server/src/projekte/{scan.ts,git.ts,gh.ts,pipeline.ts}`,
  `server/src/eingang/{inbox.ts,jobs.ts}`
- Modify on decision 4: `server/src/eingang/jobs.ts` (`planJob`'s file-argument check at the
  existing `existsSync`/`statSync` site gains realpath containment: the target's realpath must
  start with the folder's realpath plus `path.sep`, else the established 400 shape - checked
  BEFORE any command is built, like the rest of the fence), `server/test/eingang/jobs.test.ts`

**The cases and their invariants:**

- [ ] **Case P1 - a repo with no commits.** Scratch root with `git init leeres-repo` (no
      commit). Invariant: the scan completes; the repo lists with a sensible state (unborn
      HEAD does not crash `simple-git` handling; dirty/ahead/behind render as their empty
      forms); no 500; the table and detail render in the browser (built server with
      `PROJECT_ROOTS=<scratch root>`).
- [ ] **Case P2 - gh offline.** Two probes: unit - the exact failure shapes a dead network
      produces (nonzero exit, network-error stderr) against `gh.ts`'s error handling, extending
      the existing fakes only if a shape is unpinned; product - the built server started with a
      PATH that has no `gh` (`PATH=/usr/bin:/bin`), invariant: the scan completes, issue and
      PR counts are absent rather than wrong, the UI renders the repos without the counts, no
      crash, no hang past the scan's normal window.
- [ ] **Case P3 - symlinks in the Plaud folders.** Scratch watch dir with a file symlink to an
      outside transcript and a dir symlink outside. Invariants: listing does not crash and is
      recorded as-is; under decision 4 `planJob` refuses a file argument whose realpath
      escapes the folder - test: a symlink planted in the scratch inbox pointing at a file
      outside answers 400 and no command is built. The Phase 4 forward note
      ("symlinks in inbox/notizen are followed") gets its written verdict here either way.
- [ ] **Per case: verdict in the ledger**, same rule as Task 3.
- [ ] **Gate and commit** - `fix: fence job arguments and vault writes against symlink escape`
      (assuming decision 4; otherwise `test: adversarial pass over projekte and eingang`).

---

### Task 5: The deferred-minors wave

The eight items settled at plan approval (decision 5), each a small mechanical change; all
other triaged minors stay per their recorded rulings. One commit for the wave.

**Files and items:**

- [ ] **M1** `server/src/zahlen/routes.ts`: the response-shape re-declaration of `RunFolder`'s
      fields is replaced by the imported type from `./runs.js` (Phase 5 item 3).
- [ ] **M2** `server/test/zahlen/routes.test.ts`: the two boundary basenames verbatim -
      `/run?folder=2026-08-15-zwischenstand-extra` -> 400 and
      `/run?folder=x2026-08-15-zwischenstand` -> 400 (Phase 5 item 5).
- [ ] **M3** `server/src/kontext/`: `directoryNames` exists twice (`skills.ts:27`,
      `readers.ts:50`) - consolidate into one module-local helper file inside `kontext/`
      (same-module consolidation, no cross-app surface; Phase 5 item 6).
- [ ] **M4** `server/test/eingang/runner.test.ts`: the broken-stream test's pending promise is
      awaited or explicitly voided with a comment (Phase 4 item 6).
- [ ] **M5** `web/src/eingang/components/LogView.tsx:40`: the poll runs once immediately, so a
      job already terminal on mount costs no wasted interval tick (Phase 4 item 10).
- [ ] **M6** `web/src/eingang/types.ts:20`: `EINGANG_JOB_KINDS` becomes
      `as const satisfies readonly EingangJobKind[]`, and the completeness direction is pinned
      with vitest's `expectTypeOf<EingangJobKind>().toEqualTypeOf<(typeof EINGANG_JOB_KINDS)[number]>()`
      in the existing types-adjacent test file; the hand-sync comment is updated to say what is
      now enforced (Phase 4 item 11).
- [ ] **M7** the double-start comment in `server/test/eingang/` that credits the 3 s sleep is
      re-worded to name the real guarantee - the synchronous handler, per the Task 9 review
      (locate via `git grep -n "double-start"`; Phase 4 item 14).
- [ ] **M8** `web/src/eingang/components/JobsPanel.test.tsx`: an explicit assertion that a
      running internal-kind row (`vault-reindex`) shows no `Abbrechen` button (Phase 4
      item 15).
- [ ] **Steps per item:** where an item is a test, write it and watch it pass against the
      already-correct code (these pin behavior, they do not drive it); where it is a
      refactor, run the focused suite before and after. Then the full gate.
- [ ] **Commit** - `refactor: the phase 4 and 5 deferred minors`

---

### Task 6: The look-and-feel pass

**Files:**

- Drive: `e2e/tools/chrome-shots.mjs` against a running build (`npm start`)
- Modify only on findings: the owning app's `styles.css` (token discipline preserved)

**The checklist, per screen, both themes** (the STANDARDS UI rules made mechanical):

- No gradient anywhere but the brand mark; flat colour only.
- Every colour through a variable; every variable has a dark value; `color-scheme` set - verify
  by grep per app stylesheet (`git grep -n "linear-gradient\|box-shadow" web/src`), then by eye
  on the shots.
- Orange `#ff5c00` means "you are here" and nothing else in the chrome; inside an app its own
  accents stay its own.
- No left-border accent stripes, no decorative drop shadows, no emoji icons.
- Spacing and alignment: where a shot looks off, measure with `getBoundingClientRect` through
  the driven page rather than eyeballing (the PROCESS rule), and check the whole box.

- [ ] **Step 1: Capture.** `chrome-shots.mjs` over every screen in both themes; shots to
      `data/task-6-phase6-screenshots/` (untracked).
- [ ] **Step 2: Audit.** Walk the checklist per screen; findings split into OBJECTIVE (rule
      violation - fix now) and SUBJECTIVE (taste - listed for the user, decision 7).
- [ ] **Step 3: Fix the objective findings**, re-shoot each fixed screen, measured where it was
      an alignment fix.
- [ ] **Step 4: Full gate** (e2e when `web/` changed).
- [ ] **Step 5: Commit** - `fix: look-and-feel findings across the nine documents` (skipped
      cleanly when there are none; the subjective list goes in the criteria report either way).

---

### Task 7: The real-machine walkthrough and the overall criteria

The built server on :8100 with the real `.env`, driven with agent-browser. Every screen of all
nine documents, both themes, real data. Screenshots untracked under
`data/task-7-phase6-screenshots/`; the report in the SDD workspace.

**The screen list (each in dark and light):**

- Cockpit: all seven panels filled from the live APIs, the app row's nine links.
- Vault: tree, a rendered note with wikilinks and backlinks, tags, search, raw view,
  open-in-Obsidian.
- Projekte: table, board, one detail, the warnings.
- Aufgaben: board, filters, the Plaud import list, issues read-only.
- Eingang: quellen, jobs table with a finished log, schedule display.
- Kontext: all seven tabs.
- Zahlen: last run, archive with a run switch, the Bericht iframe, download links, myCrafton
  links.
- CRM: dashboard, organizations, contacts, pipeline, activities.
- Rolodex: people, circles, one timeline, the import modal opened.

- [ ] **Step 1: Walk and shoot.** Per screen: renders with real data, no console errors
      (`agent-browser errors` after each app), interactions exercised read-only.
- [ ] **Step 2: The one write.** The approved toggle round-trip (decision 2): toggle in
      Aufgaben, `cat` the note - `[x] ✅ <date>` present; revert, `cat` again - restored.
- [ ] **Step 3: Measure SPEC overall criteria 1 and 2.** (1) each of the eight apps plus
      Cockpit answers at its route in both themes and `docs/<app>/{IMPLEMENTATION,REQUIREMENTS}.md`
      exist - report the 9-row table; (2) real vault, Plaud, repositories and controlling runs
      visible without copies - one named spot check per source, plus the toggle from Step 2.
- [ ] **Step 4: Findings** -> fixed via the normal cycle or written down; report lands in the
      ledger.
- [ ] **Step 5: Commit** only if a tracked change was needed -
      `fix: walkthrough findings` (else no commit; the report is the deliverable).

---

### Task 8: Docs current

**Files:**

- Modify: `docs/CONTROLS.md` (the coverage table refreshed from `npm run coverage` - it was
  noted stale in Phase 4 Task 10 and left alone; also the watch-flake remedy line if Task 1
  retired it), `e2e/EXPLORATORY.md` (the adversarial-pass lines drafted in Tasks 3-4: what was
  probed once on the real machine and stays out of the suites), `docs/PROCESS.md` (gate notes
  touched by Task 1), the app docs any Task 3-7 fix invalidated (each fix task names its doc
  debt in the ledger; this task pays it)
- Sweep: recursive word-bounded greps for stale counts and figures
  (`git grep -wn "six apps\|seven apps\|acht\|eight apps"` and the numeric sweep the Phase 1
  lesson prescribes), every hit verified or fixed

- [ ] **Step 1: Write and verify** - every claim checked against code, the Phase 5 content
      rule.
- [ ] **Step 2:** `npm run format && npm run check`.
- [ ] **Step 3: Commit** - `docs: the quality-gate findings and the current coverage figures`

---

### Task 9: The final gate

**Files:** none tracked; the criteria report at
`.superpowers/sdd/PLAN-phase-6/criteria-report.md` (untracked workspace, house precedent).

- [ ] **Step 1: The full gate one last time**, foreground, each step its own exit code:
      `npm run format` (no-op expected), `npm run check`, `npm run e2e`.
- [ ] **Step 2: Ten-run stability re-proof** of Task 1's acceptance on the final tree
      (`cd server && for i in $(seq 1 10); do npx vitest run --coverage || echo "RUN $i FAILED"; done`).
- [ ] **Step 3: The phase criteria report** - all seven phase success criteria measured with
      evidence pointers (ledger lines, screenshot dirs, the sweeps' empty output), and SPEC
      overall criterion 3 (suites green + walkthrough done) closed with Steps 1-2 plus
      Task 7's report. The subjective look-and-feel list rides along for the user.
- [ ] **Step 4: Commit** only if a tracked change was needed; otherwise the report closes the
      phase.

---

## Self-review notes

- The phase adds no surface: the only production-behavior changes on the table are decision 4's
  two containment checks and whatever Tasks 3-4 and 6-7 genuinely find; everything else is
  tests, config and docs.
- Names consistent with the code as it stands: `createRunner(db, jobsDir, internals)` gaining
  `killEscalationMs`; `KILL_ESCALATION_MS`; `escalateKill`; `planJob`'s existing
  `existsSync`/`statSync` site; `EINGANG_JOB_KINDS` in `web/src/eingang/types.ts:20`;
  `directoryNames` at `skills.ts:27` and `readers.ts:50` - all verified against the tree at
  2e5bfb2 before writing this plan.
- The 5 MB note and every scratch fixture stay out of the repo; regression tests use small
  fixtures only.
- The two standing follow-ups from the handoff that belong to Phase 6 are Tasks 1 and 2; the
  third (pid-recording boot SIGTERM) is explicitly out per decision 6.
