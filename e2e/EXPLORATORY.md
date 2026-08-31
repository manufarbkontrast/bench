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
already disagreed once: prod served the right app while dev served the launcher.

With `agent-browser`: `agent-browser --session bench open http://localhost:8101/crm/`, then
`snapshot -i` to list interactive elements. Two traps worth knowing - `fill @ref ""` does **not**
clear a field (reload instead), and refs go stale after navigation, so re-snapshot before clicking.

**Check both themes.** The toggle sits on the right of the nav strip and applies to all three apps.
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

- The launcher, then into each app and back. Because the apps are separate documents, back is a
  full page load, not a router transition, and moving between apps through the nav strip is a
  navigation rather than a transition.
- **The nav strip should look identical in all four documents (launcher and three apps)** - same
  height, same dark, same orange line - including Vault in dark mode. The suite asserts the
  links and the current tab; it cannot see that the strip has picked up a host app's font,
  letter-spacing or palette. That is exactly what would go wrong.
- Each app should keep its own look below the strip: CRM light, Vault light/dark, Rolodex
  light/dark. Any styling bleeding between them means the multi-page split has been broken.
- Refresh on a deep link in **both** dev and prod.
- After a chrome change, run `node e2e/tools/chrome-shots.mjs` against `npm start` and look at
  all eight images. The suite asserts labels and the current tab; whether orange on the dark strip
  is legible next to CRM's light sidebar is a judgement.
