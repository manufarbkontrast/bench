# Projekte

A read-only inventory of git checkouts and coupled working folders at `/projekte`. The
filesystem, `git` and `gh` are the truth; Bench never writes to any of them. Backed by
`data/projekte.sqlite`, rebuilt whole on every scan.

- Backend: `server/src/projekte/` - `scan.ts` (the directory walk), `git.ts` (state via
  `simple-git`), `remotes.ts` (normalisation and grouping), `couple.ts` (the vault side of the
  coupling), `gh.ts` (issue/PR counts), `pipeline.ts` (`scanProjects`, the whole scan in order),
  `db.ts` (schema and queries), `routes.ts` (the three endpoints), `locate.ts` and `sample.ts`
  (roots and the synthetic workshop)
- Frontend: `web/src/projekte/` - `App.tsx`, `components/` (`ProjectsTable`, `Board`, `Detail`,
  `WarningBadges`), `api.ts`, `format.ts`, `types.ts`, `styles.css`
- Tests: `server/test/projekte/`, `web/src/projekte/**/*.test.{ts,tsx}`, `e2e/projekte/`

## Data model

One table, `projects` (`server/src/projekte/db.ts`) - a denormalised scan result, no foreign
keys: `path` (primary key), `name`, `kind` (`'git'` or `'folder'`), `remote`, `remote_label`
(the `owner/repo` GitHub label, if the remote is on GitHub), `branch`, `last_commit_at`,
`last_commit_subject`, `dirty` (SQLite's 0 or 1, not a boolean - the same convention as CRM's
`Activity`), `ahead`, `behind`, `note_path`, `brand`, `status`, `issues`, `prs`, `group_key`, and
`scanned_at`. `replaceProjects` deletes and reinserts the whole table inside one transaction on
every scan, so a project gone from the roots also vanishes from the index - nothing here is
reconciled row by row.

## The scan pipeline

`scanProjects` (`pipeline.ts`), in order:

1. **`findRepos`** (`scan.ts`) walks the configured roots for `.git` entries.
2. **`readStates`** (`pipeline.ts`) calls `readGitState` (`git.ts`) for each checkout, in batches of
   8 (`GIT_STATE_BATCH`) rather than all at once - each read spawns several git processes, and
   unbounded parallelism over a large root would exhaust file descriptors. `readGitState` itself
   reads exactly one checkout's state per call; the batching is `readStates`'s concern, not its own.
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
depth 3 below each root** (`MAX_DEPTH`); a repository nested deeper is never found. Overlapping
roots (`~/Downloads` and `~/Downloads/Projekte` both configured) yield each repository once - the
walk tracks visited directories in a `Set`.

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

Mounted at `/api/projekte` (`routes.ts`), three routes:

| Route                | Returns                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /list`          | `{ scannedAt, summary, projects }` - runs a scan first if the table is empty; `summary` is null otherwise |
| `POST /scan`         | `{ summary }` - a full rebuild, joining an in-flight scan if one is already running                       |
| `GET /project?path=` | `{ project, duplicates }` for one absolute path, or 400/404                                               |

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

`App.tsx` (mounted at `/projekte` by its own `BrowserRouter`) fetches the list on load, offers
`Neu scannen` (`POST /scan` then a re-fetch of `/list`, disabled and reading `Scannt …` while
running), and toggles between `ProjectsTable` and `Board`. Selecting a row or card fetches
`GET /project?path=` and opens `Detail`, a side panel closed by its own button or Escape.

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

## Tests

**Unit** (`server/test/projekte/`) run each module in isolation against a shared sample built once
per file in `beforeAll` (`scratchDir` in `tmp.ts`, cleaned up in `afterAll`), or against a scratch
vault database built and inserted into directly for `couple.ts` and the routes' vault-reading
paths. `gh.test.ts` never calls the real CLI - every case injects a fake `GhRunner`.

**End to end** (`e2e/projekte/`) runs against the per-worker sample workshop, `BENCH_GH: "off"`:
`table.spec.ts` and `board.spec.ts` assert the sample's known state (the duplicate pair, the
remoteless repo, the em-dash issue cells) in each view; `scan.spec.ts` `git init`s a new repository
directly into the worker's `projectsDir` fixture after the first scan, clicks `Neu scannen`, and
waits for the new row without a reload - the "one scan finds it" criterion in miniature.

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
- **The depth cap can hide a real repository.** A checkout nested more than three directories below
  a configured root is silently never found; there is no warning that the walk stopped short of it.
- **`e2e/projekte/scan.spec.ts` guards against its own retry.** `playwright.config.ts` sets
  `retries: 1`, and `projectsDir` is worker-scoped rather than per-test, so a retry of that spec
  re-enters against the exact repository the first attempt already built. `initNewRepo` checks
  `existsSync` before running any git command, mirroring the same idempotency guard in
  `sample.ts`'s `buildSampleProjects` - without it, a retry would try to `git init` into a
  directory that already has a `.git`, and fail for a reason that has nothing to do with the
  behaviour under test.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
