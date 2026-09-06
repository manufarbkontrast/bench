# Cockpit

The start page at `/`, replacing the old card-grid launcher in place - same document, same route.
One page onto what needs attention across the vault, the repositories and the tasks, holding no
database and no write path of its own.

- `web/src/home/` - `App.tsx`, `api.ts`, `format.ts`, `types.ts`, `session.ts`, `styles.css`
- Tests: `web/src/home/**/*.test.{ts,tsx}`, `e2e/cockpit.spec.ts`, plus the shared seams in
  `e2e/smoke.spec.ts` and `e2e/theme.spec.ts`

## Five sibling reads, no database

`api.ts` reads five siblings - `GET /api/aufgaben/tasks`, `GET /api/eingang/inbox`,
`GET /api/vault/note?path=00_Index/Session_Context.md` (through `getOrNull`, since a vault without
that note is expected, not an error, and resolves to `null` on a 404 rather than throwing),
`GET /api/zahlen/last`, and Projekte, whose panel needs a pair of requests rather than one:
`GET /api/projekte/list` then `GET /api/projekte/stand`. The panel's rows come from `/stand`;
`/list` is fetched first solely because it performs the lazy first-visit scan on an empty
`projects` table (see `server/src/projekte/routes.ts`) - `/stand` itself never scans, so warming
`/list` first (`api.warmProjects`, its resolved body discarded) means the panel does not show every
handoff's repos as missing on a fresh install. `web/src/projekte/App.tsx` sequences its own mount
effect the same way, `list` then `stand`, and again after `Neu scannen`. Each panel filters and
sorts its own slice of one response; nothing is shared across panels, and nothing is cached beyond
the component's own state. `types.ts` deliberately redeclares narrow local shapes for `Task`,
`Project`, `InboxFile`, `Kpi`, the Zahlen reply and Projekte's `HandoffRow`/`StandReply` rather than
importing them from `aufgaben`, `projekte`, `eingang` or `zahlen` - the comment at the top of the
file names this directly: the Cockpit stays free of any import from a sibling app, the same rule
every other pair of apps already follows, so these few fields are duplicated here instead.

**`web/src/home` deliberately duplicates the small formatters too**, rather than importing them.
`format.ts`'s `dateText` and `deltaText` are near-identical to `web/src/aufgaben/format.ts`'s
`dateText` and `web/src/projekte/format.ts`'s `deltaText`, and `runLineText`/`breakEvenText` mirror
`web/src/zahlen/format.ts`'s functions of the same name (built on this document's own `dateText`
rather than that app's) - a handful of lines each, and a shared helper module would be a fourth or
fifth cross-app dependency for lines that already have a home in the apps that own the data.

## The seven panels, in fixed order

`App.tsx` renders, always in this order: `Überfällig`, `Diese Woche`, `Eingang`, `Projekte in
Bewegung`, `Hier weitermachen`, `Zahlen`, `Zuletzt erledigt`. Each is a plain bordered
`section.home-panel` with an `h2` - no card grid, no KPI tiles, the same flat section shape the
apps behind them use.

- **Überfällig** / **Diese Woche** (`overdueTasks`, `weekTasks` in `types.ts`) - open tasks with a
  due date before today, and due today through six days out, both earliest-first; each row links
  to `/aufgaben/` and shows `Fällig <date>`.
- **Eingang** (`EingangPanel`, `unverarbeitetCount` in `types.ts`) is live: it counts the watched
  files whose `status` is `unverarbeitet` from `GET /api/eingang/inbox`, shows `Nichts Neues.` at
  zero or `"<n> unverarbeitet"` otherwise, and always links to `/eingang/` labelled `Verarbeiten` -
  the same exclusion-free count Eingang's own inbox list shows, since the Cockpit applies no filter
  of its own beyond the status check.
- **Projekte in Bewegung** lists handoffs before repositories. `stand.projekte` (`GET
/api/projekte/stand`, already sorted staleness-first) renders one row per project - its slug, then
  age and the same badge wording `standHints` produces in the Projekte app itself (`Stand
veraltet`, `1 Repo ungesichert` / `<n> Repos ungesichert`, `1 offene Aufgabe` / `<n> offene
Aufgaben`, `Repo nicht gefunden: <name>` - `handoffMeta`/`handoffHints` in `types.ts`, written
  again here rather than imported), capped at
  `HANDOFF_ROWS` (8) with a trailing `… und <n> weitere` row linking to `/projekte/` once there are
  more. Below that, `movingProjects` renders repositories - but only from `stand.ohneProjekt`, the
  scanned checkouts no handoff claims, where `dirty > 0`, `ahead > 0`, `behind > 0`, or the last
  commit landed within the past seven days, sorted by most recently committed; each row's meta text
  is the same `<n> geändert · <n> voraus · <n> zurück` / `sauber` wording Projekte's own `deltaText`
  produces, computed locally rather than imported. Reading `ohneProjekt` rather than every scanned
  row is what keeps a coupled repository from ever appearing twice - once as part of its handoff's
  own row, once again in the moving-repositories list. No handoff rows and no moving repositories
  renders `Alles ruhig.` instead of an empty panel.
- **Hier weitermachen** reads `firstSection` (`session.ts`) of the session note's body: the first
  `## ` heading becomes the panel's subline, the paragraph-split text under it renders as-is, and a
  plain link opens the note in Vault. A missing note, or one with no `## ` heading at all, renders
  `Keine Session-Notiz gefunden.` rather than an empty panel.
- **Zahlen** (`ZahlenPanel`, `zahlenKpis` in `types.ts`) reads `GET /api/zahlen/last`: the run line
  (`runLineText`, `Zwischenstand vom <date>` / `Abschluss vom <date>`), then the two KPI rows picked
  from the reply by exact Kennzahl match - `Umsatz gesamt` and `Google-ROAS`, in that order, each as
  `` `${kennzahl}: ${aktuell}` `` - a row the reply does not carry is omitted rather than padded,
  then the break-even line (`breakEvenText`). `run: null` renders `Noch kein Lauf.` instead of those
  three lines; the `Zur Zahlen-App` link into `/zahlen/` renders either way.
- **Zuletzt erledigt** (`recentDone`) - the last five completed tasks by `doneAt` descending, a
  task with no `doneAt` sorted last.

**Task counts respect the same exclusion list Aufgaben applies** - `Überfällig`, `Diese Woche` and
`Zuletzt erledigt` all read `GET /api/aufgaben/tasks`, which already drops tasks filed under
`50_Workflow`, `Templates` and `90_Archive` before the Cockpit ever sees the list; the Cockpit does
not re-apply or know about that filter itself.

**The app row below the header links all eight apps** - Vault, Projekte, Aufgaben, Eingang,
Kontext, Zahlen, CRM, Rolodex, in that order - each a plain anchor with the app's own icon from
`web/src/shared/AppIcons.tsx`, distinct from the `BenchNav` strip above it.

## Tests

**Unit** (`web/src/home/App.test.tsx`, `session.test.ts`) mocks every `api` function and asserts all
seven headings render in order, that fixture rows land in the right panel - including the Eingang
panel's count and its `Nichts Neues.` empty state, the Zahlen panel's run line and KPI lines with a
missing KPI row omitted, and its `Noch kein Lauf.` empty state - that `firstSection` picks the
first `## ` heading and stops at the next one or end of body, and that the Projekte panel's own
`api.stand()` call only fires after `api.warmProjects()` has resolved, not in parallel with it.

**End to end** (`e2e/cockpit.spec.ts`) loads `/` against the built sample data and asserts all
seven headings, an overdue task under `Überfällig`, the Eingang panel's count against the sample
fixture's own two unprocessed files with its link into `/eingang/`, the session note's text under
`Hier weitermachen` with a working link into Vault, and under `Projekte in Bewegung` both the
`leuchtturm` handoff row (`Stand veraltet`, since `e2e/fixtures.ts` rewrites its `repos:` entry to
this worker's own sample-workshop checkout) and the uncoupled `treibgut` row from `ohneProjekt`,
with `leuchtfeuer` itself asserted absent from that list since it is coupled to the handoff row
already shown - the handoff assertion with a generous 20-second wait, because a fresh worker's
first `GET /api/projekte/list` can trigger the same lazy scan of the sample workshop that
`/projekte/`'s own first visit does, which shells out to `git` several times before any row exists.
It also asserts the Zahlen panel's run line and `Umsatz gesamt` line against the sample
controlling fixture's last run (`server/src/eingang/fixture/controlling/2026-08-15-zwischenstand`,
the one `letzter-lauf.json` names).

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
