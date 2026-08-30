# Bench OS - plan

Phases for [SPEC.md](./SPEC.md). Each phase closes the same loop as every Bench change: unit tests
pass with coverage, the e2e suite passes, the feature has been used in a real browser in both
themes, the docs it invalidates are updated, and it is committed. **A phase does not start until
every success criterion of the previous one is met.**

The task-level plan for the phase in progress sits beside this file as `PLAN-phase-<n>.md`.

## Phase 0 - fork, remove Groove, foundation

Fork in place (`manufarbkontrast/bench`, `upstream` kept for tooling). Remove Groove from code,
tests, config and docs. Load the vault path from `.env`. Apply the palette and the UI rules to the
shared chrome and the launcher. Translate the chrome to German. Bring `STANDARDS.md` in line with
Conventional Commits.

**Success criteria**

1. `npm run check` and `npm run e2e` pass with Groove gone, and no reference to Groove remains
   outside git history.
2. The launcher shows three apps; the nav strip lists Start, CRM, Space, Rolodex and marks the
   current one in orange; the theme toggle is labelled in German and the first visit is dark.
3. No eyebrow label, no hover transform, no pill on the launcher; the font stack names none of
   `Segoe UI`, `Roboto`, `Arial`.
4. The server starts with and without a `.env`, and its startup log says whether the vault is
   configured. `.env.example` documents `VAULT_DIR`; further keys arrive with the apps that read
   them.
5. `PROJECT.md`, `README.md`, `AGENTS.md` and `CONTROLS.md` describe the three-app Bench and the
   Bench OS decisions.
6. CI in the fork is green on the branch.

## Phase 1 - Vault app, read-only

Indexer and watcher over `VAULT_DIR` into `data/vault.sqlite` (notes, links, tags, tasks, FTS5),
with a synthetic fixture vault used when `VAULT_DIR` is unset and by every e2e worker. Tree,
rendered note, backlinks, tags, quick-find, open-in-Obsidian, raw view.

**Success criteria:** the real vault indexes in under 2 s · ten sampled notes render with working
wikilinks and correct backlinks · search finds titles and body text · an edit in Obsidian shows in
Bench within 3 s without a restart · the task grammar parser has unit tests for every emoji field
and the edge cases · e2e covers open, search, jump and theme.

## Phase 2 - Projekte app

Scan `PROJECT_ROOTS` for git checkouts and working folders, group by remote, detect duplicates,
read git state via `simple-git`, issue and PR counts via `gh`, couple each project to its vault note
through the note's `path:` frontmatter. Table, board by brand × status, detail, warnings.

**Success criteria:** every repository from the spec's inventory appears after one scan and the
known duplicates group correctly · dirty/ahead/behind match `git status` on five samples · the
ÆND issue count matches `gh issue list` · Merch, myCrafton and the SPZ notes couple automatically ·
"no remote" warnings show for the repos that have none · the scan finishes in under 10 s · e2e
runs against fixture repositories created with `git init`.

## Phase 3 - Aufgaben app and Cockpit

Task toggle and create with the 409 guard, the Plaud note parser, import into the vault with the
ledger and duplicate check, GitHub issues read-only, the views. Cockpit replaces the launcher.

**Success criteria:** the count of open tasks equals the vault Cockpit's "everything open" query ·
a toggle in Bench shows as `[x] ✅ <date>` in Obsidian and the reverse without a restart · a line
edited in Obsidian between index and toggle yields 409 and loses nothing (e2e) · the Q4 planning
Plaud note yields four work items, importing them creates tasks with a provenance link, and a
second import creates nothing · the Cockpit shows every panel in both themes.

## Phase 4 - Eingang and runner

Watch folders, unprocessed-status reconciliation against the Plaud archive, a jobs table, a runner
for the skill scripts and `claude -p`, live log, kill, display of scheduled runs.

**Success criteria:** the unprocessed transcripts on the machine are listed · "process" produces
a note in `PLAUD_HOME/notizen` and archives the original, with the log visible · a job can be
cancelled and reports its state correctly · a controlling run can be started and its result shows
in Zahlen · a job cannot write outside the three target folders (tested with hostile arguments) ·
the runner is faked in tests, and CI never calls the real `claude`.

## Phase 5 - Kontext and Zahlen

**Success criteria:** Kontext shows profile, rules, session state, memory, repository briefs and
the skill catalogue, and a gitleaks run over a dump of the page finds nothing · Zahlen shows the
last run with the same figures as its `zusammenfassung.md`, lists every run, and the myCrafton
links resolve.

## Phase 6 - quality gate

A look-and-feel pass over every app in both themes, the full suites with coverage, a browser
walkthrough of every screen, an adversarial review (broken frontmatter, umlauts and emoji in
paths, a 5 MB note, symlinks, a repo with no commits, `gh` offline, a wrong vault path) with every
finding fixed or rejected in writing, and the docs brought up to date.

## Overall success criteria

The whole of [SPEC.md](./SPEC.md) "Success criteria for the whole change".
