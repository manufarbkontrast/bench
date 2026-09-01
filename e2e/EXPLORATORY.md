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

**Check both themes.** The toggle sits on the right of the nav strip and applies to all five apps.
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

## Projekte

Covered by specs against the built sample workshop (`e2e/projekte/{table,board,scan}.spec.ts`): the
table lists the sample's git checkouts with their git state, the duplicate pair carries `Dublette`,
the remoteless checkout carries `Kein Remote`, issue cells read the em dash with `gh` off; the
board groups the (uncoupled) sample into one `Ohne Marke` section and one `Unzugeordnet` column, a
card opens the detail panel and lists its duplicate; `Neu scannen` picks up a checkout created
after the first scan without a reload.

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

## Aufgaben and Cockpit

Covered by specs against the fixture vault and the bundled Plaud sample
(`e2e/aufgaben/{tasks,import}.spec.ts`, `e2e/cockpit.spec.ts`): a checkbox toggle writes the file
and moves the task between Heute and Erledigt, unchecking reverts the file exactly, a conflicting
edit on disk is rejected with the file left as the edit made it, creating a task from the default
target lands it under the inbox's heading; importing an unmatched Plaud row files it under the
suggested target and the ledger survives a reload, the dedup hint appears on a row that overlaps
an existing open task, the Issues tab shows its off-mode message. The Cockpit's own spec covers all
seven panels rendering in order against the sample data, an overdue task, the session note's first
section with its Vault link, and a moving project.

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
- **The nav strip should look identical in all six documents (the Cockpit and five apps)** - same
  height, same dark, same orange line - including Vault in dark mode. The suite asserts the
  links and the current tab; it cannot see that the strip has picked up a host app's font,
  letter-spacing or palette. That is exactly what would go wrong.
- Each app should keep its own look below the strip: CRM light, Vault light/dark, Projekte
  light/dark, Aufgaben light/dark, Rolodex light/dark. Any styling bleeding between them means the
  multi-page split has been broken.
- Refresh on a deep link in **both** dev and prod.
- After a chrome change, run `node e2e/tools/chrome-shots.mjs` against `npm start` and look at
  all eight images. The suite asserts labels and the current tab; whether orange on the dark strip
  is legible next to CRM's light sidebar is a judgement.
