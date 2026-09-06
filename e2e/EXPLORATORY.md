# Exploratory testing charter

What the automated suite deliberately does **not** cover, and how to check it by hand or with an
agent. Run this when you change something the assertions cannot see: visual design, animation,
feel.

The automated suite lives beside this file. Prefer adding a spec over adding a line here - this
document is for what genuinely cannot be asserted.

## Running the apps

```bash
npm run dev     # Vite :8101 (+ API :8100) - the usual choice
npm start       # everything from :8100 - the production path
```

**Check both when you touch routing.** Deep-link fallback is implemented twice - `server/src/app.ts`
for production, the `appFallback` plugin in `web/vite.config.ts` for the dev server. They have
already disagreed once: prod served the right app while dev served the Cockpit.

With `agent-browser`: `agent-browser --session bench open http://localhost:8101/crm/`, then
`snapshot -i` to list interactive elements. Two traps worth knowing - `fill @ref ""` does **not**
clear a field (reload instead), and refs go stale after navigation, so re-snapshot before clicking.

**Check both themes.** The toggle sits on the right of the nav strip and applies to all eight apps.
The specs assert that each app's background actually changes and that the choice survives a
reload; whether the result is _legible_ - chart axes, chips on tinted backgrounds - is a judgement
only you can make.

## Vault

Covered by specs against the fixture vault (`e2e/vault/{notes,search,live}.spec.ts`): the tree
opens a note and marks it selected, a wikilink jumps and the backlinks region lists the referrers,
a dangling link renders as plain text rather than a link while the raw view still shows the
`[[...]]` source and the Obsidian link carries the right `obsidian://` href, a relative image is
served from the vault, quick-find opens by shortcut and by the header button, narrows live,
supports keyboard-only arrows-plus-Enter, shows "Keine Treffer", and a note written or edited on
disk is re-read and shown within three seconds without a restart. Task 11 re-ran the same shape of
checks against the real vault (77 notes, 367 links, 173 tasks): ten notes sampled across folders,
including two with umlauts and spaces in the filename and five with callouts, all had rendered
links, backlinks and search hits matching a `grep` over the markdown - once that `grep` accounts
for wikilinks written as a full path (`[[50_Workflow/Coding_Style|Alias]]`, the norm in this vault
rather than the bare-title form the fixture vault uses) and for the escaped pipe Obsidian requires
inside a table cell (`[[Note\|Alias]]`), both of which the app resolves correctly and neither of
which the fixture vault happens to exercise.

Left to judgement: rendering fidelity on a real vault's own notes - tables, long pages, and
callouts (an Obsidian `> [!tip] Title` renders as a plain blockquote with a bold first line; the
callout type itself carries no icon or colour). Embedded `dataview` and `tasks` query blocks show
as inert code, correctly unexecuted, but that also means a note built entirely around one - the
real vault's own Cockpit note - renders as headings over code rather than the dashboard Obsidian
would show. Whether `obsidian://open?vault=<name>&file=<path>` actually opens Obsidian and lands on
the right note - the suite and this task both only assert the href. The feel of the tree past 70
notes: how deep nesting gets before you scroll, and whether a note that links to the same target
many times over (real project notes do) reads oddly repeated in the body.

Under `npm run dev`, a hard navigation to a note URL ending in `.md` serves the Cockpit rather
than Vault, because the `appFallback` plugin in `web/vite.config.ts` treats the `.md` suffix as a
static asset and skips its rewrite. Production (`npm start`) and the e2e suite, which navigate
through the app rather than by direct URL, are unaffected.

An adversarial pass by hand against a scratch vault (Phase 6 Task 3) found and closed one real bug
(malformed frontmatter aborting the whole index - see `docs/vault/IMPLEMENTATION.md`) and left these
confirmed-but-unasserted:

- **Malformed frontmatter's browser rendering.** The parse fallback and the FTS insert are both
  proven at the unit level; that a note with an unclosed `---` fence or invalid YAML still renders
  its body in a real browser was confirmed once by hand against a scratch `VAULT_DIR`, not by an
  e2e spec. A spec opening such a note and asserting its body still renders would close this.
- **Umlauts and emoji in a note's path.** Confirmed end to end by hand against a scratch vault: the
  tree, the encoded `/vault/n/...` deep link, backlinks, full-text search and the `obsidian://` href
  all round-trip correctly for a folder and filename carrying both - none of this is asserted by a
  spec, and no fixture note's path carries either.
- **A very large note.** A roughly 5 MB note indexed in about 60ms and rendered in a real browser
  (about 600ms load, about 1.1s to next interactive) without freezing the tab - confirmed once by
  hand against a scratch vault; no spec fixture approaches this size.
- **Symlinks inside the vault: the read/list half.** A fresh index never sees one, file or
  directory, in-vault or pointing outside it - `scan.ts`'s `listNotes` reports a symlink's `Dirent`
  as neither a file nor a directory. The live watcher disagrees: it follows a newly added symlink
  and indexes what it finds through it, including content from outside the vault, until the next
  full reindex silently drops it again (see `docs/vault/IMPLEMENTATION.md`'s "Things that will
  bite"). The write-refusal half is proven at the unit level
  (`server/test/vault/write.test.ts`'s "realpath containment" cases); this read/list inconsistency
  itself is not exercised by any spec.
- **An invalid `VAULT_DIR`.** Confirmed once by hand: the startup log says the configured path was
  not found, and every vault-backed route falls back to the bundled sample fixture rather than an
  empty state, with no route answering 500. Not covered by a spec - `e2e/fixtures.ts` always points
  every worker at a real per-worker `VAULT_DIR`, so a missing-vault boot is never exercised.
- **A known, unfixed residual: `watch.ts`'s `add`/`change` handler still lets an uncaught throw
  reach chokidar.** Phase 6 Task 3 closed the _parse_ half of this failure class - `splitNote` now
  catches malformed frontmatter - but `indexNote`'s own `readFileSync` in the watcher's handler is
  not wrapped, so a note deleted or made unreadable between the chokidar event and the read still
  takes the process down. Narrow in practice - `awaitWriteFinish` and the dot-file rule already
  cover the common editor temp-file case - but it is the one corner of the class this phase did not
  close, deliberately left for its own reviewed fix rather than folded in here.

## Projekte

Covered by specs against the built sample workshop
(`e2e/projekte/{table,board,scan,stand}.spec.ts`): the table lists the sample's git checkouts with
their git state, the duplicate pair carries `Dublette`, the remoteless checkout carries `Kein
Remote`, issue cells read the em dash with `gh` off; the board groups the (uncoupled) sample into
one `Ohne Marke` section and one `Unzugeordnet` column, a card opens the detail panel and lists its
duplicate; `Neu scannen` picks up a checkout created after the first scan without a reload; the
`Projekte` view opens by default and shows the fixture vault's two handoffs - one coupled and
`Stand veraltet` against the worker's own rewritten `repos:` entry, one with no `repos:` at all -
with the uncoupled checkout left in `Ohne Projekt`.

Left to judgement, because the sample workshop cannot exercise it and a live `gh` call has no
place in an automated suite:

- **Scan breadth on a real machine.** The sample is three checkouts and one coupled folder; a real
  `PROJECT_ROOTS` scan over an actual home directory - depth, checkout count, how long it takes,
  which repositories the depth cap or the ignore rules quietly miss - is only exercised by hand,
  against the real machine's roots.
- **`gh` against live repositories.** Every e2e worker runs with `BENCH_GH: "off"`, so
  `fetchCounts` reaching the real CLI, a real GraphQL response, and a real offline/not-logged-in
  failure path are none of them exercised by the suite. `server/test/projekte/gh.test.ts` covers
  the parsing and the null-on-failure rule against a fake runner only.
- **Coupled brand/status grouping, in the browser.** `web/src/projekte/components/Board.test.tsx`
  covers multi-brand, multi-status grouping against mock rows in jsdom, but the bundled sample
  vault couples none of the sample workshop's checkouts - `board.spec.ts` only ever sees one
  section and one column. A board actually split across several brands and statuses has never been
  seen rendered in a real browser by the automated suite.
- **An unborn-HEAD repo.** A fresh `git init` with no commit is covered at the unit level
  (`git.test.ts`), but no e2e spec puts one in the scanned roots - the sample fixture commits to
  every repo it builds. The table and detail rendering for that state (branch reads, every delta
  column empty) was confirmed once by hand against a real Chrome (Phase 6 Task 4), not by an
  automated spec.
- **The real handoffs' `repos:` lists.** The committed fixture vault's two synthetic handoffs
  couple to nothing on their own - `Handoff_leuchtturm.md` names `~/Projekte/leuchtturm`, which
  matches no scanned row, and `Handoff_hafen.md` names no `repos:` at all; only each e2e worker's
  own rewritten copy (`e2e/fixtures.ts`) points `leuchtturm` at a real, scanned checkout, as this
  file's own Projekte paragraph above states. The seven real handoffs' own `repos:` entries -
  several projects spanning more than one checkout, three with none at all - are only exercised by
  hand against the real vault and the real `PROJECT_ROOTS` scan.
- **A Stand card's age text against the real clock.** `ageText`'s day-count wording (`heute`, `vor
1 Tag`, `vor <n> Tagen`) is covered at the unit level for fixed inputs; whether it reads right
  next to a real handoff's actual age - months old, or from today - is only seen by hand.
- **The seven real projects' signals**, together rather than one at a time: `veraltet` against a
  real newest commit, `dirtyRepos` and `offeneTasks` counted correctly across real coupled
  checkouts and real vault tasks, is confirmed piecewise by the unit suite but has not been watched
  rendered together for every real handoff in one pass.
- **The H1-after-H2 ordering.** `handoffs.ts`'s `handoffTitle` reads the body's first `# ` line
  wherever it falls, independent of any `## ` section around it - but every fixture and test body
  puts the H1 first, before any `## ` heading, so a handoff whose H1 sits after its first `##`
  section (unusual, but not forbidden) has never actually been fed through the function.
- **`gh` absent from `PATH`**, rather than `BENCH_GH=off`'s explicit switch, is covered at the unit
  level for the two realistic failure shapes (`gh.test.ts`), but no e2e spec restricts `PATH` to
  reproduce it - the suite's `BENCH_GH=off` exercises a different, pre-existing code path. Confirmed
  once by hand (Phase 6 Task 4): a built server on a `gh`-less `PATH` scans a repository with a
  `github.com` remote in under 200ms and renders an em dash for issues and PRs with no console
  errors.

## Aufgaben and Cockpit

Covered by specs against the fixture vault and the bundled Plaud sample
(`e2e/aufgaben/{tasks,import}.spec.ts`, `e2e/cockpit.spec.ts`): a checkbox toggle writes the file
and moves the task between Heute and Erledigt, unchecking reverts the file exactly, a conflicting
edit on disk is rejected with the file left as the edit made it, creating a task from the default
target lands it under the inbox's heading; importing an unmatched Plaud row files it under the
suggested target and the ledger survives a reload, the dedup hint appears on a row that overlaps
an existing open task, the Issues tab shows its off-mode message. The Cockpit's own spec covers all
seven panels rendering in order against the sample data, an overdue task, the session note's first
section with its Vault link, and under `Projekte in Bewegung` the `leuchtturm` handoff row and the
uncoupled `treibgut` row from `ohneProjekt`, with `leuchtfeuer` asserted absent since it is already
shown coupled to the handoff.

Left to judgement, for the same reason as Projekte's own `gh` gap below - a live call has no place
in an automated suite, and the fixture data was built to exercise specific behaviour once each
rather than realistic breadth:

- **`gh` against live repositories, on the Aufgaben side.** Every e2e worker runs with
  `BENCH_GH: "off"`, so `GET /api/aufgaben/issues` reaching the real CLI, a real GraphQL-adjacent
  `gh issue list` response and a real offline/not-logged-in failure path are none of them exercised
  by the suite - the same gap Projekte's own issue counts already carry.
  `server/test/aufgaben/gh.test.ts` covers the parsing and the null-on-failure rule against a fake
  runner only.
- **Real Plaud notes.** The fixture note is one synthetic meeting with four rows, built to exercise
  the dedup hint and one mapping rule each. A real `PLAUD_HOME/notizen` folder - months of
  meetings, a note with no `Arbeitsaufträge` table at all, a `titel` carrying more than one
  unquoted colon, a `Was` cell long enough to wrap or carrying its own markdown - is only exercised
  by hand.
- **Recurrence is deliberately not computed**, and no spec demonstrates that by omission - it is
  documented behaviour (see [docs/aufgaben/IMPLEMENTATION.md](../docs/aufgaben/IMPLEMENTATION.md)),
  not a gap a new test could close, since there is no code path that computes a next occurrence to
  exercise.
- **The watcher-vs-sync-reindex overlap.** Every write through `vault/write.ts` reindexes the note
  synchronously before its response goes out, and the same write's rename onto the real filename
  also trips `watchVault`'s own `change` handler a moment later, reindexing the same note again.
  Each path is covered on its own - the write path by `aufgaben/tasks.spec.ts`, the watcher by
  `vault/live.spec.ts` - but nothing asserts that the watcher's follow-on reindex is a harmless
  no-op rather than a race against a request landing in the gap between the two. It has not
  misbehaved in practice; it has also not been proven not to.

## Eingang

Covered by specs against the built sample fixture (`e2e/eingang/{inbox,jobs,plaud}.spec.ts`): the
four fixture inbox files reconciled to their status with the audio file correctly unbuttoned, an
internal job (`vault-reindex`) reaching `Fertig` without a reload and its log showing the real
reindex line, a spawned job (`plaud-sync`, over the fake runner) cancelled mid-run reaching
`Abgebrochen` with its log intact followed by the double-start 409, and the sample
`Plaud-Aufnahmen` panel - its three recordings and their three marks, `Holen` on the new one
reaching `Fertig` against the sample fetch that writes nothing, and `Verarbeiten` with a project
chosen carrying the chosen slug into the job's own label. The unit suite (`server/test/eingang/`)
covers the whole write fence one check at a time - including the `plaud-fetch` id and
`plaud-process` `projekt` cases - against hostile arguments, the stdio client against
`fixture/fake-plaud-mcp.mjs`, the fetch's parsers and file writer, and the runner's
spawn/internal/broken-stream/kill/timeout paths against the real fake-job fixture.

Left to judgement, because a real `claude -p` invocation, a real skill script and a real machine's
`~/Library/LaunchAgents` have no place in an automated suite:

- **The real `claude -p` jobs.** `plaud-process` and `aufgaben-import` only ever run
  `fixture/fake-job.mjs` under sample data and in every test - the real prompt, `--allowedTools`
  list and `--add-dir` argument `planPlaudProcess`/`planAufgabenImport` build are never handed to
  the actual `claude` CLI by the suite. Whether the real run stays inside the folder it was told to
  write under is enforced by the fence before the process starts, not observed after the fact.
- **The real skill scripts.** `plaud-sync.sh` and `geplanter_lauf.sh` are named by `jobs.ts` but
  never executed by a test - the fake job stands in for both. A change to either script's own
  behaviour (its exit code on a real failure, what it writes to stdout) is invisible here.
- **Launchd parsing against real plists.** `schedule.test.ts` and `jobs.spec.ts` both read only the
  bundled fixture plists (or hand-written ones built for one case each), never a real
  `~/Library/LaunchAgents` directory. A plist using the `StartCalendarInterval` **array** form
  (several run times in one job), or scheduled by `StartInterval` instead of a calendar, has only
  been reasoned about, never fed through `listScheduledRuns` and read by eye.
- **Symlink containment for `plaud-process`/`aufgaben-import`'s file argument** is covered at the
  unit level (`jobs.test.ts`) and confirmed once against the routed 400 by hand (Phase 6 Task 4); it
  was not re-proven against a real `claude -p` invocation with a symlinked target, since doing so
  would require letting a real, un-fenced-by-anything-but-the-prompt subprocess run against a file
  outside the folder it was told to write under - the same trust boundary "The real `claude -p`
  jobs" above already names. Separately, `listInbox`/`noteQuellen` excluding a symlinked entry
  outright (rather than following or crashing on it) is confirmed by hand, not by an automated spec.
  A hardlink passes either of Bench's two realpath containments (here and the vault's own write
  guard) unnoticed - `realpathSync` only resolves symlinks - but placing a hardlink into a watched
  folder already needs write access to that folder, which already permits placing an ordinary file
  there, so this is out of scope by design rather than a gap in either fence. Both containments
  also check then act, and a path component swapped for a symlink in the gap between the two
  escapes - the same dismissal applies: the swap needs the same write access to the folder that
  already permits placing a file there.
- **The real Plaud MCP.** Every e2e worker and every unit test talks to
  `fixture/fake-plaud-mcp.mjs`, never the real `npx -y @plaud-ai/mcp@latest` - a listing against a
  real, populated library, paging past the first page, the 401/not-authenticated path, and a real
  `Holen` actually writing a `.md` under `~/Plaud/inbox` are none of them exercised by the suite;
  checked by hand instead, against the real account, in this change's own real-machine gate.
- **The real `/plaud` skill run with a project.** `Verarbeiten` with a `projekt` chosen only ever
  starts `fixture/fake-job.mjs` in the suite - whether the real skill actually writes
  `projekt: <slug>` into the finished note's frontmatter the way the fence's prompt tells it to is
  confirmed by hand, not by an automated spec.
- **The listing is not polled, by design** (see `docs/eingang/IMPLEMENTATION.md`'s "The web app").
  `plaud.spec.ts` never leaves the panel open across a background fetch finishing - the sample
  fetch settles inside the same test before anything asserts on it - so a recording's mark actually
  going stale until the next `Neu laden` or page load is reasoned about, not watched happen.

## Kontext

Covered by specs against the committed `claude-home` fixture (`e2e/kontext/kontext.spec.ts`):
Profil, Regeln and Stand render the fixture vault notes and the one Claude-side rule file - Regeln
reads `50_Workflow/` as a prefix, so the fixture's two handoff notes now render there too, alongside
the fixture's other workflow note, unremarked by any assertion; Skills
counts the fixture's two folders and a search narrows the list without moving the counter off
`2 Skills`; MCP lists the two fixture server names and the page never contains the poisoned URL's
own host, `secret.example.com`. Task 9 re-ran the same shape of check against the real
`~/.claude`: every one of the seven routes rendered real data, the Skills tab's counter (564)
matched `ls ~/.claude/skills | wc -l` exactly, Memory rendered 22 project sections and Repos 24,
and concatenating every `/api/kontext/*` response body (767 KB) into one file and running
`gitleaks detect --no-git` over it found zero leaks.

Left to judgment, because a real `~/.claude` and a real, populated MCP config have no place in an
automated suite built on a synthetic fixture:

- **Real `~/.claude` scale, confirmed.** The fixture's Skills tab counts two folders;
  `server/src/kontext/skills.ts`'s own code comment puts a real machine at roughly 500 - Task 9
  found 564 real skill folders (549 with a readable `SKILL.md`), and the UI's own counter matched
  `ls ~/.claude/skills | wc -l` exactly. Whether the scan, the cache and the client-side search
  still feel instant at that size is a judgment only a person watching it render can make.
- **The gitleaks page dump, run live.** The no-secret design (server names only, out of MCP
  config) is proven two ways already against the fixture - `readers.test.ts`'s unit assertion and
  `kontext.spec.ts`'s page-text assertion, both against the one poisoned URL committed there. Task
  9 ran `gitleaks detect --no-git` over every tab's actual rendered text, against the real
  `~/.claude`, real registered repositories and the real vault, and found zero leaks - the
  automated suite proves the design, this proved it against real data.
- **Real projects and repos, confirmed.** The fixture registers one invented project
  (`-tmp-beispiel`) with one memory note; against the real, multi-project `~/.claude/projects` and
  the real checkouts under `PROJECT_ROOTS`, Task 9 found Memory rendering 22 sections and Repos
  24 - the same count as the 24 projects Projekte itself indexes, so nothing was silently dropped
  this run. Whether a stale or moved project's silent omission (see
  [docs/kontext/IMPLEMENTATION.md](../docs/kontext/IMPLEMENTATION.md)'s "Things that will bite")
  is ever actually hit on a machine where one does go stale is still only seen by hand.

## Zahlen

Covered by specs against the extended Eingang controlling fixture (`e2e/zahlen/zahlen.spec.ts`):
the last run's `stichtag`, its `Umsatz gesamt` KPI row and the Bericht iframe; the archive listing
both fixture runs and swapping every panel to the older one's own figures, including the
missing-report case. Task 9 re-ran the same shape of check against the real archive and a real
myCrafton host: the last run's seven KPI rows matched `zusammenfassung.md`'s own table exactly,
diffed programmatically row by row, and `bestellungen` (3070) matched `letzter-lauf.json`; the
archive listed all three real run folders, newest first, and opening an older one served its own
KPI table and summary; with `MYCRAFTON_URL` configured to the real base, all four deep-link paths
answered non-5xx (`301`, redirecting to the canonical domain).

Left to judgment, because a real myCrafton host and a real archive size have no place in an
automated suite:

- **Real myCrafton resolution, confirmed.** `MYCRAFTON_URL` is `""` for every e2e worker
  (`e2e/fixtures.ts`), so the deep-links panel always renders `Nicht konfiguriert.` in the suite,
  and the four links' actual targets are never requested. Task 9 configured the real base and ran
  `curl -sk` against all four - `/`, `/umlagerungen`, `/nachbestellungen`, `/marken` - each
  answering `301`, a redirect rather than a 5xx.
- **A real archive's size and shape, confirmed at three runs.** The fixture carries exactly two
  run folders, one of them missing `bericht.html`/`rohdaten.json` on purpose. Task 9 found the
  real `CONTROLLING_DIR` carrying three runs; all three listed in the archive, newest first, and
  the KPI table parsed cleanly for both the last run and an older one opened from the archive. How
  the list reads once it grows to months of runs is still only seen by hand.
- **`bestellungen` always reading the last run while browsing the archive** (see
  [docs/zahlen/IMPLEMENTATION.md](../docs/zahlen/IMPLEMENTATION.md)'s "Things that will bite") is
  provable from the code and the fixture alone, and Task 9 confirmed it live - selecting an older
  archived run still showed the same order count as the last run's own panel. Whether it reads as
  confusing in practice, with every other figure on the page changing except that one, is a
  judgment only a person looking at the real archive can make.

## CRM

Covered by specs: CRUD for organizations, contacts and deals, search, status filter, keyboard drag
on the pipeline, delete confirmation, deep links. Left to judgement:

- Dashboard charts: the unit suite now asserts the month labels, the `$40k` axis shortening, the
  forecast marker and the funnel's own figures, against a chart given a fixed size. What it cannot
  see is the picture - whether the bars line up under their months, whether the funnel reads as a
  funnel, whether anything overlaps at a real width. Look at it.
- Chart tooltips. They only appear on a real hover, so nothing asserts their wording or their
  figures. Hover each of the four.
- Mouse dragging on the pipeline. The specs drag with the keyboard, which is what
  `@hello-pangea/dnd` supports natively and what makes them stable, and the unit suite stubs the
  library out entirely - so the mouse path is **untested at every level**. Drag a card with the
  mouse after touching the pipeline, between columns and up and down within one, and reload to
  confirm the order stuck.
- Whether a column that overflows scrolls sensibly, and whether dragging a card to the bottom edge
  of a full column auto-scrolls it. The board is sized to the window, so this only shows up with
  enough deals in one stage, or a short window.
- Chart readability: do the funnel proportions, the stacked won-versus-expected bars and the
  probability meters actually communicate at a glance? Only their presence and figures are asserted.
- The forward half of "Revenue and deal volume" only fills if open deals carry future close dates.
  A database seeded weeks ago has a pipeline that has all gone past due, so the months ahead read
  empty - correctly, but it does not look like much. Delete `data/crm.sqlite*` to reseed against
  today before judging that chart.
- Long values: very long organization names, huge deal values, empty descriptions.
- Does the pipeline stay usable with many deals in one stage?

## Cross-app

- The Cockpit, then into each app and back. Because the apps are separate documents, back is a
  full page load, not a router transition, and moving between apps through the nav strip is a
  navigation rather than a transition.
- **The nav strip should look identical in all nine documents (the Cockpit and eight apps)** - same
  height, same dark, same orange line - including Vault in dark mode. The suite asserts the
  links and the current tab; it cannot see that the strip has picked up a host app's font,
  letter-spacing or palette. That is exactly what would go wrong.
- Each app should keep its own look below the strip: CRM light, Vault light/dark, Projekte
  light/dark, Aufgaben light/dark, Eingang light/dark, Kontext light/dark, Zahlen light/dark,
  Rolodex light/dark. Any styling bleeding between them means the multi-page split has been
  broken.
- Refresh on a deep link in **both** dev and prod.
- After a chrome change, run `node e2e/tools/chrome-shots.mjs` against `npm start` and look at
  every screen it captures, both themes - its own docstring names exactly what that covers. The
  suite asserts labels and the current tab; whether orange on the dark strip is legible next to
  CRM's light sidebar is a judgement.
- A full walkthrough of every document, tab and modal (49 states, both themes) plus one toggle
  round trip on a probe task, driven by hand against the real machine (Phase 6 Task 7): zero
  console errors anywhere, and the real vault, Plaud archive, repositories and controlling run all
  rendered live with no copies. This is a one-time confirmation, not something the suite re-runs -
  see the app sections above for what each Phase 6 task's own real-machine pass found.
