# Cockpit

The start page at `/`, replacing the old card-grid launcher in place - same document, same route.
One page onto what needs attention across the vault, the repositories and the tasks, holding no
database and no write path of its own.

- `web/src/home/` - `App.tsx`, `api.ts`, `format.ts`, `types.ts`, `session.ts`, `styles.css`
- Tests: `web/src/home/**/*.test.{ts,tsx}`, `e2e/cockpit.spec.ts`, plus the shared seams in
  `e2e/smoke.spec.ts` and `e2e/theme.spec.ts`

## Three sibling reads, no database

`api.ts` makes exactly three requests - `GET /api/aufgaben/tasks`, `GET /api/projekte/list`,
`GET /api/vault/note?path=00_Index/Session_Context.md` (the last through `getOrNull`, since a
vault without that note is expected, not an error, and resolves to `null` on a 404 rather than
throwing). Each panel filters and sorts its own slice of one response; nothing is shared across
panels, and nothing is cached beyond the component's own state. `types.ts` deliberately redeclares
narrow local shapes for `Task` and `Project` rather than importing them from `aufgaben` or
`projekte` - the comment at the top of the file names this directly: the Cockpit stays free of any
import from a sibling app, the same rule every other pair of apps already follows, so these few
fields are duplicated here instead.

**`web/src/home` deliberately duplicates the small formatters too**, rather than importing them.
`format.ts`'s `dateText` and `deltaText` are near-identical to `web/src/aufgaben/format.ts`'s
`dateText` and `web/src/projekte/format.ts`'s `deltaText` - two or three lines each, and a shared
helper module would be a fourth cross-app dependency for a handful of lines that already have a
home in the apps that own the data.

## The seven panels, in fixed order

`App.tsx` renders, always in this order: `Überfällig`, `Diese Woche`, `Eingang`, `Projekte in
Bewegung`, `Hier weitermachen`, `Zahlen`, `Zuletzt erledigt`. Each is a plain bordered
`section.home-panel` with an `h2` - no card grid, no KPI tiles, the same flat section shape the
apps behind them use.

- **Überfällig** / **Diese Woche** (`overdueTasks`, `weekTasks` in `types.ts`) - open tasks with a
  due date before today, and due today through six days out, both earliest-first; each row links
  to `/aufgaben/` and shows `Fällig <date>`.
- **Eingang** and **Zahlen** are `PlaceholderPanel`s with a fixed line naming the phase that fills
  them - `Kommt mit der Eingang-App (Phase 4).` and `Kommt mit der Zahlen-App (Phase 5).` The panel
  exists now, honestly labelled, so the page's final shape is settled before the apps behind those
  two panels exist.
- **Projekte in Bewegung** (`movingProjects`) - rows from Projekte's own scan where `dirty > 0`,
  `ahead > 0`, `behind > 0`, or the last commit landed within the past seven days, sorted by most
  recently committed; each row's meta text is the same `<n> geändert · <n> voraus · <n> zurück` /
  `sauber` wording Projekte's own `deltaText` produces, computed locally rather than imported.
- **Hier weitermachen** reads `firstSection` (`session.ts`) of the session note's body: the first
  `## ` heading becomes the panel's subline, the paragraph-split text under it renders as-is, and a
  plain link opens the note in Vault. A missing note, or one with no `## ` heading at all, renders
  `Keine Session-Notiz gefunden.` rather than an empty panel.
- **Zuletzt erledigt** (`recentDone`) - the last five completed tasks by `doneAt` descending, a
  task with no `doneAt` sorted last.

**Task counts respect the same exclusion list Aufgaben applies** - `Überfällig`, `Diese Woche` and
`Zuletzt erledigt` all read `GET /api/aufgaben/tasks`, which already drops tasks filed under
`50_Workflow`, `Templates` and `90_Archive` before the Cockpit ever sees the list; the Cockpit does
not re-apply or know about that filter itself.

## Tests

**Unit** (`web/src/home/App.test.tsx`, `session.test.ts`) mocks the three fetches and asserts all
seven headings render in order, that fixture rows land in the right panel, and that `firstSection`
picks the first `## ` heading and stops at the next one or end of body.

**End to end** (`e2e/cockpit.spec.ts`) loads `/` against the built sample data and asserts all
seven headings, an overdue task under `Überfällig`, the session note's text under `Hier
weitermachen` with a working link into Vault, and a sample project under `Projekte in Bewegung` -
the last with a generous 20-second wait, because a fresh worker's first `GET /api/projekte/list`
can trigger the same lazy scan of the sample workshop that `/projekte/`'s own first visit does,
which shells out to `git` several times before any row exists.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
