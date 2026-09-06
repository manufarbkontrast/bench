# Projekte

A read-only inventory of git checkouts and coupled working folders at `/projekte`. The
filesystem, `git` and `gh` are the truth; Bench never writes to any of them. Backed by
`data/projekte.sqlite`, rebuilt whole on every scan.

- Backend: `server/src/projekte/` - `scan.ts` (the directory walk), `git.ts` (state via
  `simple-git`), `remotes.ts` (normalisation and grouping), `couple.ts` (the vault side of the
  coupling), `gh.ts` (issue/PR counts), `pipeline.ts` (`scanProjects`, the whole scan in order),
  `db.ts` (schema and queries), `handoffs.ts` (the project level: one handoff note per project),
  `stand.ts` (assembles the project view from handoffs and scanned rows), `routes.ts` (the four
  endpoints), `locate.ts` and `sample.ts` (roots and the synthetic workshop)
- Frontend: `web/src/projekte/` - `App.tsx`, `components/` (`ProjectsTable`, `Board`, `Detail`,
  `WarningBadges`, `ProjektView`, `ProjektCard`), `api.ts`, `format.ts`, `stand.ts` (age and hint
  text for a Stand card), `types.ts`, `styles.css`
- Tests: `server/test/projekte/`, `web/src/projekte/**/*.test.{ts,tsx}`, `e2e/projekte/`

## Data model

One table, `projects` (`server/src/projekte/db.ts`) - a denormalised scan result, no foreign
keys: `path` (primary key), `name`, `kind` (`'git'` or `'folder'`), `remote`, `remote_label`
(the `owner/repo` GitHub label, if the remote is on GitHub), `branch`, `last_commit_at`,
`last_commit_subject`, `dirty` (the count of dirty entries from `git status`, not a boolean -
an untracked directory counts once, matching plain `git status`), `ahead`, `behind`, `note_path`,
`brand`, `status`, `issues`, `prs`, `group_key`, and `scanned_at`. `replaceProjects` deletes and
reinserts the whole table inside one transaction on every scan, so a project gone from the roots
also vanishes from the index - nothing here is reconciled row by row.

### The project level, above the rows

A `projects` row is a checkout; a **project** is a step up from that: a handoff note under
`50_Workflow/Handoffs/` in the vault, with zero or more `projects` rows coupled to it. `handoffs.ts`
reads the vault's `notes` table `WHERE folder = '50_Workflow/Handoffs'` (equality, not `LIKE
'50_Workflow%'` - see "Things that will bite") and turns each row into a `Handoff`:

| Field      | Source                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`     | frontmatter `projekt`, trimmed, lowercased - the card's own heading                                                                                                                                                       |
| `title`    | the body's first `# ` line outside any fenced code block, trimmed, wherever it falls; falls back to `slug` with no H1                                                                                                     |
| `notePath` | the note's vault-relative path, for the `Handoff im Vault` link                                                                                                                                                           |
| `updated`  | frontmatter `updated` as `YYYY-MM-DD`, or `null` when missing or unparsable                                                                                                                                               |
| `repos`    | frontmatter `repos`: an array of strings, each tilde-expanded and `path.resolve`d - a non-string entry warns and is dropped; a `repos` value present but not a list warns too and yields `[]`; simply absent stays silent |
| `zustand`  | the body's `## Zustand` section; absent, the first `## ` section; absent, `""`                                                                                                                                            |

A handoff without a string `projekt`, or one that is empty or whitespace-only after trimming,
becomes a warning line (`Handoff ohne projekt: <file>`) and is dropped; a second handoff claiming a
slug already seen becomes `Doppelter Slug <slug>: <file>` and is dropped too - first note path
(sorted) wins, the same dedupe rule `couple.ts` applies to duplicate project paths. `stand.ts`'s
`projektStand` couples each handoff's `repos` entries to `projects` rows by lowercased path
equality; entries that match nothing land in `missingRepos` as their basenames. Four signals are
computed at read time, never stored: `veraltet` (the handoff's `updated` is earlier than the local
calendar day of the newest coupled commit), `dirtyRepos` (how many coupled repos carry uncommitted
changes), `offeneTasks` (open vault tasks whose _containing note's_ `projekt` frontmatter
matches the slug, outside `50_Workflow`/`Templates`/`90_Archive`), and `plaudNotizen` (Plaud notes
dated after the handoff - see "The fourth signal" below). A `projects` row that no
handoff's `repos` names at all lands in `ohneProjekt`.

### The fourth signal: Plaud notes since the handoff

`projektStand` takes a third parameter, `notizenDir: string | null` - the located Plaud notes
folder, injected by the composition root the same way `ProjekteContext.notizenDir` reaches
`routes.ts` (`index.ts` passes it `plaudLocation.dir`, the same value Aufgaben's own Plaud reading
already uses). `plaudNotes` (`stand.ts`) reads every `.md` directly inside it once per `GET /stand`
call - `null` or an unreadable directory contributes nothing rather than throwing - and
`plaudNoteMeta` reads each one's `projekt` and `datum` frontmatter through
`server/src/shared/frontmatter.ts`'s `scanFrontmatter`. `plaudNotizenFor` then counts, per
handoff, the notes whose `projekt` equals the slug and whose `datum` is a day **after** the
handoff's `updated` - strictly later, not on the same day, so the meeting that produced the handoff
note itself never counts against it - answering `0` when the handoff carries no `updated` at all.

Only `.md` regular files are read: `plaudNotes` filters on `Dirent.isFile()` the same way
`listInbox`/`noteQuellen` do in Eingang, so a symlinked note is silently excluded here too (see
Eingang's own "Things that will bite" for the same gap on that side).

## The scan pipeline

`scanProjects` (`pipeline.ts`), in order:

1. **`findRepos`** (`scan.ts`) walks the configured roots for `.git` entries.
2. **`readStates`** (`pipeline.ts`) calls `readGitState` (`git.ts`) for each checkout, in batches of
   8 (`GIT_STATE_BATCH`) rather than all at once - each read spawns several git processes, and
   unbounded parallelism over a large root would exhaust file descriptors. `readGitState` itself
   reads exactly one checkout's state per call, via `git status --untracked-files=normal` - the
   same untracked mode plain `git status` uses; the batching is `readStates`'s concern, not its
   own.
3. **`vaultCouplings`** (`couple.ts`) reads every project-pointing note from the vault index.
4. **Rows are built**: one per found checkout (`kind: 'git'`), matched against a coupling by
   lowercased resolved path; one per coupling whose path exists on disk but was not itself found
   as a checkout (`kind: 'folder'`) - a plain working folder a vault note names.
5. **`attachGhCounts`** (`pipeline.ts`) fetches issue/PR counts once per unique GitHub label,
   shared across every row - duplicates included - that carries it; skipped entirely when `gh` is
   `"off"`.
6. **One `replaceProjects` transaction** writes the whole table, and a `ScanSummary` (`projects`,
   `repos`, `folders`, `duplicates`, `ms`) is returned and logged by the caller.

## Ignore rules and the depth cap

`findRepos` (`scan.ts`) walks each configured root recursively, stopping at the first `.git` entry
it finds in a directory (a repository is never walked into further) and skipping any directory
whose name starts with `.`, plus `node_modules`, `Library`, `Applications`, `Music`, `Movies` and
`Pictures` - the same rule Vault's indexer uses for the dot-prefix, plus the macOS bulk folders a
home-directory scan must not enter. Symlinked directories are never followed. **The walk stops at
depth 3 below each root** (`MAX_DEPTH`); a repository nested deeper than that root's own budget is
never found. Overlapping roots (`~/Downloads` and `~/Downloads/Projekte` both configured) yield
each repository once - the walk tracks the _best_ (smallest) depth each directory was reached at,
in a `Map`, rather than a plain seen-Set: a nested root gets its own full depth budget regardless
of scan order, so a repository too deep for the parent root's budget but within the nested root's
own is still found when the parent is configured first, which is the order `PROJECT_ROOTS` is
usually written in.

## Remote normalisation and the two duplicate notions

`normalizeRemote` (`remotes.ts`) is hand-rolled rather than a regex - a super-linear pattern
against arbitrary URL shapes is exactly what `sonarjs` flags. It strips the protocol
(`ssh://`, `git://`, `https://`, `http://`), the user before an `@`, turns scp-style
`host:path` into `host/path`, drops a trailing slash and a `.git` suffix, and lowercases the
result, so `git@github.com:Owner/Repo.git`, `https://github.com/owner/repo` and `ssh://git@github.com/Owner/Repo/` all normalise to `github.com/owner/repo` (allow-secret: git remote fixtures, not real addresses).
`githubLabel` returns the `owner/repo` part when the normalised remote is on `github.com`, null
otherwise - only GitHub remotes are asked for issue/PR counts.

`groupKey` (`remotes.ts`) is the normalised remote when there is one, or `` `name:${basename}` ``
(lowercased) when there is not - a folder-only or remoteless checkout groups by name alone. Two
notions of duplicate follow from this, both derived at request time in `routes.ts`'s
`withDerived`, not stored:

- **`Dublette`** (`isDuplicate`) - another row shares the same `group_key`: the same remote, so the
  same actual repository checked out twice.
- **`Mögliche Dublette`** (`sameName`, shown only when `isDuplicate` is false) - another row shares
  the same lowercased name under a _different_ `group_key`: two checkouts that look related by
  name but were not proven to be the same repository, because at least one has no remote or the
  remotes differ.

## The coupling convention

A vault note couples to a project by naming the project's path in its own frontmatter:
`path: ~/Downloads/<Repo>`. `vaultCouplings` (`couple.ts`) scans every note in the vault index,
keeps the ones with a non-empty string `path`, tilde-expands and `path.resolve`s it, and reads the
note's tags for a `brand/` and a `status/` prefix - the first tag with each prefix, prefix
stripped, becomes the project's `brand` and `status`; a note with neither tag couples with both
null. Couplings are sorted by `notePath` so that if two notes somehow point at the same resolved
path, a later dedupe keeps the first one deterministically.

**Working folders are visible only through a coupling.** A path that is not a git checkout only
becomes a `kind: 'folder'` row in the pipeline when some vault note's `path:` frontmatter names it
and the path exists on disk - Projekte does not otherwise list plain folders under the roots. That
is what keeps a broad root like `~/Downloads` from drowning the table in every subfolder that
happens to sit there.

## Issue and PR counts

`gh.ts` exposes `GhRunner = (args: string[]) => Promise<string>` and the real implementation,
`realGh`, which shells out to the `gh` CLI with a 15-second timeout. `fetchCounts` runs one
GraphQL query per label:

```
query($o:String!,$n:String!){repository(owner:$o,name:$n){issues(states:OPEN){totalCount}pullRequests(states:OPEN){totalCount}}}
```

invoked as `gh api graphql -f query=<query> -F o=<owner> -F n=<name>`. **It returns `null` on any
failure** - offline, not logged in, the repository gone, output that will not parse as the
expected shape - never throws. A GitHub label Bench cannot reach never fails a scan; the row's
`issues`/`prs` just stay null, which the UI shows as an em dash.

Routes take `gh: GhRunner | "off"`. `BENCH_GH=off` (set by every e2e worker, and available to
anyone who wants a scan without shelling out to `gh`) short-circuits `attachGhCounts` before any
label is even looked up - the real CLI is never invoked in tests, in e2e, or when the flag is set
on a developer machine.

## The lazy first scan and the single-flight guard

**No scan runs at startup.** The server opens `data/projekte.sqlite` and logs how many rows it
already holds, but the first scan happens on demand - `GET /list`, if the table is empty, runs a
scan before answering, so boot time does not pay for it and the UI never shows a permanently empty
state on a first run.

`scanQueue` (`routes.ts`) closes over one `inFlight` promise per router instance. A scan already
running is shared rather than repeated: two `GET /list` calls racing against an empty table, or a
`POST /scan` arriving while a lazy scan from `/list` is still running, all join the same
`scanProjects` call rather than stacking a second one against the same database. The summary log
line lives in `scanQueue` rather than at each call site, so it fires once per actual scan - not
once per request that happened to trigger or join one.

## The API

Mounted at `/api/projekte` (`routes.ts`), four routes:

| Route                | Returns                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /list`          | `{ scannedAt, summary, projects }` - runs a scan first if the table is empty; `summary` is null otherwise |
| `GET /stand`         | `{ projekte, ohneProjekt, warnings }` - never scans, see below                                            |
| `POST /scan`         | `{ summary }` - a full rebuild, joining an in-flight scan if one is already running                       |
| `GET /project?path=` | `{ project, duplicates }` for one absolute path, or 400/404                                               |

`GET /stand` calls `projektStand(vaultDb, listProjects(db), ctx.notizenDir)` and answers `{ projekte, ohneProjekt,
warnings }`, each `projekte` entry the project-level shape above ("The project level, above the
rows"). `projekte` is sorted `veraltet` first, then by `updated` ascending (oldest first, unknown
dates last); `ohneProjekt` keeps `listProjects`'s own order, `ORDER BY path` - path-ascending, not
insertion order. It **never triggers a scan** -
unlike `GET /list`, it reads `listProjects(db)` as it stands, so on an empty table (a fresh clone,
or `data/projekte.sqlite` deleted) it answers immediately with every handoff's repos in
`missingRepos` rather than blocking on a scan; the web app and the Cockpit both warm the table with
`GET /list` first for exactly this reason (see "The web app" below).

Only `GET /list` computes `isDuplicate` and `sameName`, via `withDerived` over the whole result set
at request time rather than stored columns - a row's duplicate status depends on every other row,
not on itself. `GET /project` deliberately does not: `project` and each entry in `duplicates` come
back as the raw scanned row, with neither flag. The web `ProjectDetail` type spells out the reason
in its own comment - those flags "describe a row's place in the whole list, not the row on its
own," so a single-project lookup has no list to place it in.

## The sample workshop

Without configured roots, the server builds a synthetic workshop under its data directory
(`locateProjects`, `buildSampleProjects` in `sample.ts`) - the same pattern as the sample vault, so
`npm start` without a `.env` still shows a living scan, and every e2e worker gets an isolated one.
Idempotent: an existing directory is trusted as already built, never rebuilt. The exact shape,
under the sample directory:

| Path                                          | Kind                                                   | State                                                          |
| --------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `.origins/leuchtfeuer.git`                    | bare origin                                            | two commits                                                    |
| `werkstatt/leuchtfeuer`                       | `git init`, `origin` added and pushed to the bare repo | branch `main`, one commit ahead (unpushed), one file dirty     |
| `archiv/leuchtfeuer-alt`                      | a clone of the same origin                             | one commit behind, clean - the duplicate pair with leuchtfeuer |
| `werkstatt/treibgut`                          | `git init`, no remote, one commit                      | the "Kein Remote" case                                         |
| `atelier/strandgut`                           | plain folder, one text file                            | only ever listed through a vault coupling                      |
| `.cache/hidden`, `werkstatt/node_modules/dep` | git repos                                              | decoys the scanner must skip                                   |

The sample is deliberately uncoupled: no vault note in the bundled fixture points at any of its
paths, so every row in the sample lands under `Ohne Marke` / `Unzugeordnet` on the board. All
identity in the sample is invented: `bench@example.com` as the git author, German-workshop names
translated for the paths, English commit subjects.

## The web app

`App.tsx` (served at `/projekte` from its own HTML entry point; `main.tsx` renders `<App />`
directly, with no `BrowserRouter` - the app has no client-side routes of its own to manage) offers
three views - `Projekte`, `Tabelle`, `Board` - with `Projekte` the default. On mount it fetches
`GET /list` first and `GET /stand` only once that resolves, not in parallel: `/list` is what
performs the lazy first-visit scan on an empty table (see "The API" above), so firing `/stand`
alongside it would show every handoff's repos as missing until the scan finishes - the list
response itself is discarded, only its side effect matters. `Neu scannen` re-runs the same
sequence (`POST /scan`, then `/list`, then `/stand`), disabled and reading `Scannt …` while
running, and re-enabled even if the scan fails. Selecting a repository row or card fetches
`GET /project?path=` and opens `Detail`, a side panel closed by its own button or Escape.

- **`ProjektView`** (`components/ProjektView.tsx`) renders `GET /stand`'s reply: `warnings` as
  plain lines, one `ProjektCard` per project, then an `Ohne Projekt` section listing `ohneProjekt`
  as compact repo rows (`RepoRow`, shared with the cards' own repo list). Empty states: `Keine
Handoffs.` when `projekte` is empty, `Alle Repos sind einem Projekt zugeordnet.` when
  `ohneProjekt` is empty.
- **`ProjektCard`** (`components/ProjektCard.tsx`) is headed by the **slug** (`<h2>`), not the
  handoff's own title - `handoffs.ts`'s `title` (the body's first H1) renders as a subtitle beneath
  it, and only when it differs from the slug, so a handoff whose H1 happens to equal the slug shows
  no redundant second line. Below that: `Handoff vom <date> · <age>` or `Datum fehlt`
  (`web/src/projekte/stand.ts`'s `ageDays`/`ageText`/`dayText`, the browser-side counterpart to
  `server/src/projekte/stand.ts`'s `localDay`); the badges `standHints` derives from the
  `signals` and `missingRepos`, in order: `Stand veraltet`, `1 Repo ungesichert` /
  `<n> Repos ungesichert`, `1 offene Aufgabe` / `<n> offene Aufgaben`,
  `1 Plaud-Notiz seit Handoff` / `<n> Plaud-Notizen seit Handoff`, one `Repo nicht gefunden: <name>`
  per missing entry - keyed by index, since two missing entries under different parents can share a
  basename; the `zustand` text verbatim in a `<pre>`
  (empty ones render no block at all); the `Handoff im Vault` link; then the coupled repositories
  as `RepoRow`s, each opening the same `Detail` panel as the other two views.
- **`ProjectsTable`** sorts rows by `lastCommitAt` descending, nulls last; each row shows the
  project name (opens the detail), its path, brand, status, branch, last commit date, a change
  summary, issue/PR counts, its vault note link (if coupled), and `WarningBadges`.
- **`Board`** groups by brand ascending with `Ohne Marke` last, then within each brand by status
  ascending with `Unzugeordnet` (no status) last.
- **`WarningBadges`** shows at most one duplicate badge (`Dublette` over `Mögliche Dublette`, never
  both) plus `Kein Remote` for a git checkout without one or `Ohne Git` for a folder row.
- **`format.ts`** - `deltaText(dirty, ahead, behind)` joins the non-zero parts
  (`` `${n} geändert` ``, `` `${n} voraus` ``, `` `${n} zurück` ``) with `·`, or reads `sauber` when
  everything is zero; `dateText` formats a millisecond timestamp with
  `Intl.DateTimeFormat("de-DE", { dateStyle: "medium" })`, or an em dash for null;
  `noteHref`/`noteTitle` build the link into Vault (`/vault/n/<encoded path>`, as a plain `<a>`
  since it crosses into a different document, never a router `Link`) and its display text.

## Configuration

`PROJECT_ROOTS` in `.env` (`server/src/config.ts`) - colon-separated paths, tilde-expanded,
trimmed, empty entries dropped. `locateProjects` (`locate.ts`) keeps the configured roots that
exist and reports the ones that do not (`missing`); with none usable it builds the sample workshop
instead and reports `source: "sample"`. `BENCH_GH=off` switches the `gh` counts off; without it
the real CLI is invoked.

After changing `PROJECT_ROOTS`, delete `data/projekte.sqlite` or click `Neu scannen` - the index
does not notice the change by itself.

## Tests

**Unit** (`server/test/projekte/`) run each module in isolation against a shared sample built once
per file in `beforeAll` (`scratchDir` in `tmp.ts`, cleaned up in `afterAll`), or against a scratch
vault database built and inserted into directly for `couple.ts` and the routes' vault-reading
paths. `gh.test.ts` never calls the real CLI - every case injects a fake `GhRunner`. `handoffs.test.ts`
covers the frontmatter fields, tilde expansion, fenced code blocks (`## `/`# ` lines inside a
` ``` ` fence read as prose, never as headings), `Zustand` extraction (including the first-H2
fallback and the no-H2 empty case), and the four warning shapes (missing or blank `projekt`,
duplicate slug, a non-string `repos` entry, and a `repos` value present but not a list).
`stand.test.ts` covers coupling by lowercased path, `missingRepos`, each signal with a positive and
a negative case, the sort order, and the `50_Workflow` task exclusion - `TZ=Europe/Berlin` is
pinned for the whole suite in `server/vitest.config.ts` so its day-boundary cases actually
discriminate a correct local-day comparison from a UTC one (see `docs/CONTROLS.md`).
`plaudNotizen` gets its own positive and negative cases, a note dated the same day as the handoff's
`updated` (not counted - strictly after, not on), and a `null`/missing `notizenDir`. `routes.test.ts`
covers `/stand`'s reply shape via supertest: a coupled handoff, a vault with no handoff notes at
all (every row falls to `ohneProjekt`), and an empty `projects` table answered without triggering
a scan.

Web: `web/src/projekte/stand.test.ts` covers `ageDays`/`ageText`/`dayText`/`standHints` directly;
`components/ProjektView.test.tsx` covers the cards, the badges (including two missing repos that
share a basename, keyed by index so neither is dropped), `Ohne Projekt`, both empty states, and the
vault link's path encoding; `App.test.tsx` pins the `/list`-before-`/stand` fetch sequencing and
`Projekte` as the default view.

**End to end** (`e2e/projekte/`) runs against the per-worker sample workshop, `BENCH_GH: "off"`:
`table.spec.ts` and `board.spec.ts` assert the sample's known state (the duplicate pair, the
remoteless repo, the em-dash issue cells) in each view; `scan.spec.ts` `git init`s a new repository
directly into the worker's `projectsDir` fixture after the first scan, clicks `Neu scannen`, and
waits for the new row without a reload - the "one scan finds it" criterion in miniature.
`stand.spec.ts` opens `/projekte/` (asserting `Projekte` is the default, pressed view), and checks
the fixture vault's two handoffs: `leuchtturm` - whose `repos:` entry `e2e/fixtures.ts` rewrites
per worker to that worker's own sample-workshop checkout, so its card shows `Stand veraltet`, the
open-task count, the coupled repo opening `Detail`, and the vault link - and `hafen`, which names
no `repos:` and so shows no repo button at all; the scanned repository no handoff names still
lands under `Ohne Projekt`.

## Things that will bite

- **Coupling matches by lowercased path**, on the assumption of a case-insensitive filesystem
  (macOS). Two configured paths that differ only in case would either fail to couple or couple to
  the wrong note on a case-sensitive filesystem.
- **A git worktree's `.git` is a file, not a directory.** `findRepos` only checks that `.git`
  exists, not what kind of entry it is, so a worktree checkout is found and scanned exactly like an
  ordinary clone - which works, but is worth knowing before assuming every found row is a full
  repository with its own object store.
- **An unborn HEAD has no log.** A freshly `git init`ed repository with no commit throws on
  `git log`; `readGitState` catches that specifically and leaves `lastCommitAt`/
  `lastCommitSubject` null rather than failing the whole read - every other field still comes back.
- **A broken checkout does not fail the scan.** A stale worktree pointer - a `.git` file naming a
  gitdir that no longer exists - makes every git command against that directory throw. `readStates`
  catches that per checkout rather than letting one broken repo take down the whole `Promise.all`,
  and the row comes back with every git field null: visible on disk, "Kein Git-Status" rather than
  gone.
- **The depth cap can hide a real repository.** A checkout nested more than three directories below
  _every_ configured root that could reach it is silently never found; there is no warning that the
  walk stopped short of it.
- **`e2e/projekte/scan.spec.ts` guards against its own retry.** `playwright.config.ts` sets
  `retries: 1`, and `projectsDir` is worker-scoped rather than per-test, so a retry of that spec
  re-enters against the exact repository the first attempt already built. `initNewRepo` checks
  `existsSync` before running any git command, mirroring the same idempotency guard in
  `sample.ts`'s `buildSampleProjects` - without it, a retry would try to `git init` into a
  directory that already has a `.git`, and fail for a reason that has nothing to do with the
  behaviour under test.
- **`updated` is a date, but it arrives as an ISO string from YAML.** `gray-matter` turns an
  unquoted `updated: 2026-08-01` into a JS `Date`, which the vault indexer serialises into
  `frontmatter` as an ISO datetime string; a quoted value stays a bare date string. Both start with
  the same ten characters, which is all `handoffs.ts`'s `parseUpdated` reads - anything not
  matching `^\d{4}-\d{2}-\d{2}` becomes `null` rather than a thrown parse error.
- **The `50_Workflow`/`Templates`/`90_Archive` exclusion in `stand.ts` is mirrored by hand from
  `server/src/aufgaben/tasks.ts`'s own `EXCLUDED` set**, not imported - the two apps never import
  each other. Without it, a checkbox line inside a handoff note itself would count as an open task
  against its own project. Keep the two sets in step by hand if either changes.
- **Read-time coupling means a handoff edit needs no scan, while a new checkout still does.**
  `GET /stand` reads the vault's `notes` table live and the `projects` table as last scanned, so
  editing a handoff's `Zustand` text or its `repos:` list shows up on the next request with no
  action - but a repository that did not exist at the last scan still shows as `missingRepos` until
  `Neu scannen` or the next lazy scan runs.
- **`folder = ?`, never `LIKE '50_Workflow/%'`.** The underscore in `LIKE` is a wildcard character,
  not a literal one - a sibling folder like `50xWorkflow` would match a `LIKE` pattern built from
  `50_Workflow` and silently pull in notes that were never handoffs.
- **`veraltet` compares local calendar days, not instants**, and the whole server test suite pins
  `TZ=Europe/Berlin` (`server/vitest.config.ts`) so that comparison's boundary cases actually run
  against a non-UTC zone - GitHub's runners default to UTC, where a bug in `localDay` could pass
  unnoticed. See `docs/CONTROLS.md`'s coverage section for why.
- **A repository two handoffs both name lists under both projects.** `stand.ts` deliberately does
  not split a coupled repo between the handoffs that claim it - a checkout can genuinely matter to
  more than one project - it only tracks whether at least one handoff has claimed it, which is all
  `ohneProjekt` needs to know.
- **Hardlinks and symlinks are untouched by any of this.** `handoffs.ts` and `stand.ts` compare
  resolved paths as plain strings; neither follows a symlink nor detects a hardlink to the same
  inode under a different path, so either would couple, miss coupling, or double-count exactly as
  the underlying string comparison dictates, with no special handling either way.
- **A `## `/`# ` line inside a fenced code block never reads as a heading.** `zustandSection` and
  the H1 title scan both mask fenced lines first (`handoffs.ts`'s `maskFencedLines`, mirroring
  `server/src/vault/index/wikilinks.ts`'s `stripCodeBlocks`), so a shell comment or a stray `## `
  inside a ` ``` ` block in a handoff never truncates the `Zustand` text or becomes the card's
  subtitle - handoffs are free-form LLM-written notes, not the fixed-shape output the scanner style
  was borrowed from.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
