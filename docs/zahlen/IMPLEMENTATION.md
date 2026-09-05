# Zahlen

A read-only window at `/zahlen` onto the last controlling run and its archive: the run's own
generated KPI table and break-even bullets, the rendered report, the raw files, and deep links
into myCrafton. No database of its own - every route resolves a run by its folder name against
`CONTROLLING_DIR` at request time, the same folder Eingang's own `controlling` job kind writes
into.

- Backend: `server/src/zahlen/` - `runs.ts` (listing run folders, resolving "the last run"),
  `summary.ts` (the `zusammenfassung.md` parser), `routes.ts` (the five endpoints)
- Frontend: `web/src/zahlen/` - `App.tsx`, `components/` (`KpiTable`, `RunsList`), `api.ts`,
  `format.ts`, `types.ts`, `styles.css`
- Tests: `server/test/zahlen/`, `web/src/zahlen/**/*.test.{ts,tsx}`, `e2e/zahlen/`

## No locate module of its own

Zahlen has no `locate.ts` - `ZahlenContext.dir` is wired at the composition root
(`server/src/index.ts`) straight from `eingangLocation.controllingDir`, the same value Eingang's
own `locateEingang` already resolved (sample fixture, configured, or `null` when `INBOX_WATCH` is
configured without `CONTROLLING_DIR`). Every route answers its own empty shape - `{ run: null }`,
`{ runs: [] }`, a 404 from `GET /file` - on a null `dir` rather than reading anything, so a
configured-but-controlling-less world never throws.

## Basename-only resolution, by design

`letzter-lauf.json`'s `ordner` field is an absolute path written by the controlling skill on
**another** machine - the fixture in this repo carries an invented one
(`/erfunden/2026-08-15-zwischenstand`) that never exists here, and even a real install's own path
is not this process's to trust as a literal filesystem location. `lastRun` (`runs.ts`) reads only
`path.basename(data.ordner)`, and only trusts it once `parseRunFolderName` confirms it still has
the exact run-folder shape and `existsSync`/`statSync` confirm a directory by that name actually
exists directly under `dir`. Failing any of that, `lastRun` falls back to `listRuns(dir)[0]` - the
newest folder by name, since `listRuns` sorts folders descending by their own `YYYY-MM-DD-...`
name rather than by mtime.

This is a deliberate design decision, not a defensive fallback bolted on afterwards: Zahlen never
follows a path written by another process on another machine, only a name it re-validates itself
against the one directory it was told to read.

## The KPI parse holds "same figures" by construction, not by comparison

`parseSummary` (`summary.ts`) is a hand-rolled line scanner over `zusammenfassung.md` - the shape
this file always has (one `# ` title, one pipe-delimited KPI table, one `## Kampagnen unter
Break-even` bullet section) is small and fixed enough that a scanner is both correct and
dependency-free, in the style of `aufgaben/plaud.ts`'s own table reader.

- **The title** is the text after the first line starting with `# `.
- **The KPI table** is the first pipe-table after the title: `parseKpiTable` skips the header row
  and the `|---|` separator row (matched by `SEPARATOR_CELL`, every cell either `-`-only or
  `:`-anchored dashes), drops any row with fewer than four cells rather than padding it, and stops
  at the first line that does not start with `|` - a blank line or the next section closes the
  table.
- **The break-even bullets** are every `- ` line strictly between the `## Kampagnen unter
Break-even` heading and the next `## ` heading (or the end of the file), with the leading `- `
  stripped. A `- keine ...` bullet - the controlling skill's own wording for "nothing found" - is
  returned as a literal bullet like any other; deciding that it means zero real campaigns is
  `breakEvenText`'s job in the web app, not the parser's.

Because both `GET /api/zahlen/last` and the Cockpit's own panel read this same parser's output
over the same file, the "same figures in both places" success criterion holds by construction -
there is exactly one parse, not two implementations that could drift apart. `rohdaten.json` is
linked for download, never parsed - its schema is the controlling skill's own private business.
See "Things that will bite" for what happens when the file the parser does read changes shape out
from under it.

## The file allowlist - the fence

`GET /file` is the one route that reads a file's own content rather than structured data, so it
carries the tightest validation: `folder` must match the exact `RUN_FOLDER` pattern
(`YYYY-MM-DD-(zwischenstand|abschluss)`, checked with `isRunFolderName`) and `name` must be a key
of `FILE_ALLOWLIST` - `bericht.html`, `rohdaten.json` or `zusammenfassung.md`, each mapped to its
own fixed content type - both checked **before** `ctx.dir === null` is even looked at, so a bad
request 400s the same way regardless of whether the app is configured. Only once both pass does
`path.join(ctx.dir, folder, name)` get built, and even then a missing file 404s rather than
throwing - a run folder is allowed to carry only `zusammenfassung.md` before its report has
rendered, which is exactly what the fixture's `2026-07-15-zwischenstand` folder demonstrates.

`GET /run` applies the same `isRunFolderName` check to its own `folder` query parameter before
looking anything up, so `folder=../etc` or `folder=2026-08-15-zwischenstand/x` both 400 before any
`readdirSync` or `path.join` happens.

## `bestellungen` always reflects the last run

`bestellungenFor` (`runs.ts`) reads `<dir>/letzter-lauf.json` directly - not
`<dir>/<folder>/letzter-lauf.json` - because the controlling skill writes exactly one
`letzter-lauf.json` per `CONTROLLING_DIR`, describing its own last run, never one per run folder.
`runDetail` (`routes.ts`) calls it the same way regardless of which run it is building a detail
for, so **`bestellungen` on an archived run's detail is always the order count from the machine's
actual last run, not from the run currently being viewed** - an inherited quirk of the source
data's own shape, not a bug in how Zahlen reads it. See "Things that will bite".

## The API

Mounted at `/api/zahlen` (`routes.ts`), five routes:

| Route        | Returns                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `GET /last`  | The last run's full detail (`run`, `kpis`, `breakEven`, `zusammenfassung`, `bestellungen`), or `{ run: null }` |
| `GET /runs`  | `{ runs }` - every run folder found, newest first                                                              |
| `GET /run`   | One named run's own full detail; 400 a malformed `folder`, 404 one that does not exist                         |
| `GET /file`  | One of the three allowlisted files, served with its own content type; 400/404 as above                         |
| `GET /links` | `{ base, paths }` - the configured myCrafton base (or `null`) and the four fixed deep-link paths               |

`RunDetail`'s shape is identical between `/last` and `/run` - the web app's `RunReply` type is one
union across both, and selecting an archived run just re-fetches the same shape for a different
folder rather than switching views.

## The web app

`App.tsx` (served at `/zahlen`, `main.tsx` renders it directly with no router) fetches the last
run, the archive list and the myCrafton links on load, and renders, in order: Letzter Lauf, Archiv,
Bericht (only once a run is selected), Zusammenfassung (likewise), and myCrafton.

- **`RunsList`** renders one `aria-pressed` button per archived run, newest first as the server
  already sorted it, reusing the house pattern `Projekte`'s own view toggle already carries.
  Clicking one refetches `GET /run?folder=...` and replaces the whole "current run" state with
  its reply - the KPI table, the break-even line, the iframe and the downloads all move together.
- **`KpiTable`** always renders a table, even with zero rows - the run's own empty state
  (`Noch kein Lauf.`) is handled by the caller before `KpiTable` is reached at all.
- **`breakEvenText`** reads a single `keine`-prefixed bullet as the word `keine` rather than the
  number `1`, mirroring `parseSummary`'s own choice to leave that judgement to the UI.
- **`fileUrl`** builds the `/api/zahlen/file` URL used directly as the Bericht iframe's `src` and
  as both download links' `href` - the file's content is never fetched by this app's own code,
  only linked to.
- **The Bericht iframe is sandboxed to `sandbox="allow-scripts"`.** `bericht.html` is generated
  from ad-platform-controlled strings this app never escapes itself, so the sandbox's opaque
  origin strips the same-origin fetch authority an unescaped one would otherwise carry into
  Bench's authless write routes, while `allow-scripts` still lets the report's own inline chart
  JS run. Relative subresources inside it already 404 under `FILE_ALLOWLIST`'s three-name
  allowlist, so the sandbox is the second layer, not the only one.

## Tests

**Unit** (`server/test/zahlen/`) covers `listRuns`'s folder-shape filter and descending sort,
`lastRun`'s basename resolution against the fixture and its empty/missing-file fallbacks,
`parseSummary` against the fixture's real `zusammenfassung.md` and hand-built edge cases (no
table, a short row, a `keine` bullet, garbage input), and the five routes against the fixture
`CONTROLLING_DIR` and a null-`dir` context, including the file-allowlist 400s and the
folder-shape 400s on `/run` and `/file`.

**End to end** (`e2e/zahlen/`) runs against the extended Eingang controlling fixture - two run
folders, the newer one carrying a full report, the older one only `zusammenfassung.md`: the last
run shows its `stichtag`, the `Umsatz gesamt` row and the Bericht iframe, with the myCrafton panel
reporting `Nicht konfiguriert.` since every e2e worker runs with `MYCRAFTON_URL: ""`; the archive
lists both runs and clicking the July one swaps the run line and the summary text while the
iframe stays present even though July has no `bericht.html` of its own.

## Things that will bite

- **A `lauf.py` format change breaks the KPI parse silently to an empty table, not an error.**
  `parseKpiTable` finds no line starting with `|` after the title and returns `[]` - the same
  shape a run with genuinely no KPIs produces. If the controlling skill ever changes how it
  generates `zusammenfassung.md`'s table (a different heading level, a table that no longer
  starts flush against the left margin, cells that stop being pipe-delimited), Zahlen shows an
  empty KPI table with no indication that anything is wrong, rather than an error naming the run
  or the file.
- **`letzter-lauf.json`'s `ordner` path field is read for its basename only, and never followed as
  a path** - see "Basename-only resolution" above. A person reading the raw JSON file on disk
  might reasonably expect Zahlen to open exactly what it points at; it does not, by design. The
  file's own `bericht` and `zusammenfassung` fields are not this app's business at all - `runs.ts`'s
  `LetzterLaufFile` interface declares only `ordner` and `bestellungen`, so those two path fields
  are present in the file but never read anywhere in `server/src/zahlen/`; the actual `bericht.html`
  and `zusammenfassung.md` are found by the run folder's own name plus `FILE_ALLOWLIST`, not by
  anything in `letzter-lauf.json`.
- **`bestellungen` always reflects the machine's actual last run, even while viewing an older
  archived one.** Selecting July's run through the archive still shows August's order count next
  to it, because `bestellungenFor` always reads the one `letzter-lauf.json` at the top of
  `CONTROLLING_DIR`, never a per-run figure - see "`bestellungen` always reflects the last run"
  above. This is inherited from the source data's own shape (one pointer file, not one per run),
  not a bug introduced by how Zahlen reads it.
- **A run folder with no files at all still lists in the archive.** `listRuns` only checks the
  folder's own name against `RUN_FOLDER`; a folder that matches the shape but holds none of the
  three allowlisted files still appears as a selectable archive entry, and every `GET /file` for
  it then 404s.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [eingang/IMPLEMENTATION.md](../eingang/IMPLEMENTATION.md) - `locateEingang`'s sample/configured
  switch, which Zahlen's own `dir` is resolved through
- [cockpit/IMPLEMENTATION.md](../cockpit/IMPLEMENTATION.md) - the Zahlen panel on the Cockpit
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
