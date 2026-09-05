# Change: Projektstand

Make the per-project handoff note the source of truth for "what is the state of this project",
and let Bench show that state honestly: the handoff's own words, plus the signals Bench can
compute from the repositories and tasks that belong to the project. A project is no longer "a
git checkout"; it is a handoff note, with zero or more checkouts coupled to it. The design was
settled with the user on 2026-09-05 (twelve decisions, all listed below); this file is the
condensed spec the plan is built from. The Plaud half of the same conversation is a separate
change, `docs/changes/plaud-mcp/`, which follows this one.

## Goal

- Every project the user works on appears in Bench once it has a handoff note - including
  projects without a repository (today invisible: `julie-abrechnung`, `machupicyou`,
  `shoesplease-klaviyo`) and projects spanning several repositories (`shoesplease`).
- Projekte shows, per project, the handoff's `Zustand` section verbatim, freshness signals Bench
  derives, and the coupled repositories; the Cockpit shows the handoff list with its age.
- Bench writes nothing new. Handoffs are written by the `/handoff` skill in the project's own
  session; Bench reads them from the vault index it already has.

## Decisions settled at design approval

1. **Handoffs live in the vault** at `50_Workflow/Handoffs/Handoff_<projekt>.md` - one canonical
   file per project, overwritten by the `/handoff` skill, versioned by the vault's git.
2. **A project is exactly one handoff note.** No handoff, no project. A repository without a
   handoff is listed under `Ohne Projekt`, never hidden.
3. **Repositories couple explicitly** through a new frontmatter key `repos:` on the handoff - a
   list of paths, `~` allowed - resolved and compared lowercased against the scanned project
   paths, the same rule `couple.ts` applies to `path:` today. No name matching.
4. **Shown in Projekte and on the Cockpit.** Projekte gains a project-level view above the
   repositories; the Cockpit's Projekte panel lists handoffs with their age.
5. **Honest means verbatim plus computed signals.** Bench never interprets a handoff. It shows the
   text and puts three signals beside it: the handoff is older than the newest commit of a
   coupled repository (`veraltet`); how many coupled repositories carry uncommitted changes; how
   many open vault tasks belong to the project. No LLM summary.
6. **Only the `/handoff` skill writes handoffs.** Bench stays read-only for them.
7. **Tasks belong to a project through their note's frontmatter** `projekt: <slug>` - the same
   key the handoff carries, one convention for handoff, tasks and (with `plaud-mcp`) Plaud notes.
8. **The fourth signal - unprocessed Plaud notes per project - arrives with `plaud-mcp`**, which
   is what makes Plaud notes carry `projekt:`. This change builds nothing that nothing fills.
9. **Two specs, this one first.** Its own plan and its own branch against the protected `main`.
10. `updated:` stays a date (`YYYY-MM-DD`); an unparsable value produces the badge `Datum fehlt`
    and no `veraltet` verdict, never a throw.
11. Two handoffs with the same slug: the first by note path wins, the second is reported as a
    warning - the `couple.ts` dedupe rule, applied to slugs.
12. The existing seven handoffs get their `repos:` lists from the user, not from guessing: the
    `Ohne Projekt` list is what shows which repositories are still unassigned.

## Model

A **project** is a row of the vault index whose `folder` is `50_Workflow/Handoffs` and whose
frontmatter carries `projekt`. From the note:

| Field      | Source                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| `slug`     | frontmatter `projekt`, trimmed, lowercased                                       |
| `title`    | the note's indexed title (its H1, else the file name)                            |
| `notePath` | the note's vault-relative path, for the `Handoff im Vault` link                  |
| `updated`  | frontmatter `updated` as `YYYY-MM-DD`, or `null` when missing or unparsable      |
| `repos`    | frontmatter `repos`: array of strings, each tilde-expanded and `path.resolve`d   |
| `zustand`  | the body of the `## Zustand` section; absent, the first H2 section; absent, `""` |

The section is cut by a hand-rolled line scanner (the `zahlen/summary.ts` style): from the first
line matching `^## Zustand\b` up to the next line starting `## `. Frontmatter arrives already
parsed from the index (`notes.frontmatter` is JSON), so no YAML is parsed here.

A **coupled repository** is a `projects` row whose lowercased `path` equals one of the resolved
`repos` entries. Entries that match no row land in `missingRepos` as their basenames.

**Signals**, computed at read time:

- `veraltet`: `updated` is non-null and earlier than the day of the newest `last_commit_at`
  among the coupled repositories. No repositories or no `updated` -> `false`.
- `dirtyRepos`: count of coupled repositories with `dirty = 1`.
- `offeneTasks`: count of `tasks` rows with `done = 0` whose note's frontmatter `projekt`
  (trimmed, lowercased) equals the slug. Handoff notes themselves sit under `50_Workflow`, whose
  tasks Aufgaben already excludes; the count follows the same exclusion so a checkbox line inside
  a handoff never counts against its own project.

## Server

Module `server/src/projekte/`, no new database, no writes. The vault index is read through the
handle `projekte` already receives (the documented exception).

- `handoffs.ts` (new): `vaultHandoffs(vaultDb): { handoffs: Handoff[]; warnings: string[] }` -
  the model above, plus one warning line per handoff without `projekt` (`Handoff ohne projekt:
<file>`) and per duplicate slug.
- `stand.ts` (new): `projektStand(vaultDb, rows: ProjectRow[])` assembles the reply below from the
  handoffs and the scanned rows; pure, testable with an in-memory vault database and literal rows.
- `routes.ts`: `GET /api/projekte/stand` ->

```
{
  projekte: [{ slug, title, notePath, updated, zustand,
               repos: ProjectRow[], missingRepos: string[],
               signals: { veraltet: boolean, dirtyRepos: number, offeneTasks: number } }],
  ohneProjekt: ProjectRow[],
  warnings: string[]
}
```

sorted: projects with `veraltet` first, then by `updated` ascending (oldest first), unknown
dates last; `ohneProjekt` in the table's existing order. The route reads the current `projects`
table without triggering a scan - the handoff side is live from the vault watcher, the repo side
is as fresh as the last scan, exactly like `/list`.

## Web - Projekte

A third view button `Projekte` beside `Tabelle` and `Board`, and the new default view. Each
project renders as one card (`projekte-` prefixed classes, token discipline, dark first):

- header: `title`, then `Handoff vom <dateText(updated)>` and its age in days, or `Datum fehlt`;
- badges, using the existing `WarningBadges` shape: `Stand veraltet`, `<n> Repos ungesichert`,
  `<n> offene Aufgaben`, `Repo nicht gefunden: <name>` (one per missing entry);
- the `zustand` text verbatim in a `<pre>` (the Kontext pattern), followed by the link
  `Handoff im Vault` -> `/vault/n/<encoded notePath>`;
- the coupled repositories as compact rows (name, branch, dirty/ahead/behind, last commit),
  each opening the existing `Detail`.

Below the cards a section `Ohne Projekt` lists `ohneProjekt` the same compact way; `warnings`
render as plain lines above it. Empty states: `Keine Handoffs.` when `projekte` is empty;
`Alle Repos sind einem Projekt zugeordnet.` when `ohneProjekt` is empty.

## Web - Cockpit

The panel `Projekte in Bewegung` keeps its name and gains, above today's moving repositories,
the handoff list: one row per project - title, age, the same badges - sorted as the API sorts,
capped at eight with `... und <n> weitere` linking to `/projekte/`. The moving-repository rows
stay for repositories in `ohneProjekt` only, so nothing is listed twice. The Cockpit keeps its
rule of importing nothing from siblings: it declares the reply shape locally, like `InboxFile`.

## Error handling

Expected cases answer, they do not throw: a handoff without `projekt` or with a duplicate slug
becomes a warning line; a `repos` entry that is not a string is skipped with a warning; a missing
or unparsable `updated` is `null`; a `repos` path that exists on disk but was never scanned is a
`missingRepos` entry (the user re-scans or extends `PROJECT_ROOTS`). No vault handle (the
sample world) yields `{ projekte: [], ohneProjekt: rows, warnings: [] }`.

## Testing

- Unit (`server/test/projekte/`): `handoffs.test.ts` - frontmatter fields, tilde expansion,
  `Zustand` extraction incl. the first-H2 fallback and the empty case, warnings for missing
  `projekt` and duplicate slugs; `stand.test.ts` - coupling by lowercased path, `missingRepos`,
  each signal with a positive and a negative case, the sort order, the 50_Workflow task
  exclusion; `routes.test.ts` - `/stand` shape via supertest and the no-vault empty shape.
- Web: `ProjektView.test.tsx` (cards, badges, `Ohne Projekt`, both empty states, the vault link
  encoding), Cockpit `App.test.tsx` (handoff rows, cap and `weitere` link, no double listing).
- e2e (`e2e/projekte/stand.spec.ts`): the fixture vault gains
  `50_Workflow/Handoffs/Handoff_leuchtturm.md` (`updated: 2020-01-01`, a `Zustand` section) and
  `Handoff_hafen.md` (no `repos`). `e2e/fixtures.ts`, which already copies the vault per worker,
  rewrites `repos:` of the first to that worker's `git init` fixture repository at copy time, so
  the spec sees one project that is `veraltet` with one repository, one project without
  repositories, and at least one repository under `Ohne Projekt`. Retry-safe by construction
  (read-only), proven with `--workers=1 --repeat-each=2`.
- Coverage stays at or above 80 % statements per workspace; `npm run check` and `npm run e2e`
  green before every commit.

## Companion changes outside the repository

- The `/handoff` skill (`~/.claude/skills/handoff/SKILL.md`) writes `repos:` from now on: the
  session's working directory when it is a git checkout, plus any paths the user names, `~`-form.
  The skill file is the user's; the plan names the exact wording to add and the user applies or
  approves it.
- The seven existing handoffs receive their `repos:` lists from the user (decision 12).

## Documentation

`docs/projekte/IMPLEMENTATION.md` (the project level, `handoffs.ts`, `stand.ts`, the signals and
their traps: `updated` is a date, tasks under `50_Workflow` never count, the read-time coupling
means a handoff edit needs no scan while a new repository still does),
`docs/projekte/REQUIREMENTS.md` (this change's brief), `docs/cockpit/IMPLEMENTATION.md` (the
panel), `docs/PROJECT.md` ("A project is a handoff note" under the Bench OS decisions, the
`projekt:` convention), `e2e/EXPLORATORY.md` (what stays manual: the real handoffs' `repos:`
lists, the age display against the real clock).

## Out of scope

Writing or updating handoffs from Bench; LLM summaries of any kind; hiding handoffs from
Kontext's Regeln tab (it lists all of `50_Workflow` and may later exclude `Handoffs/` - a
separate one-line change); the Plaud signal (`plaud-mcp`); tags or folder conventions for tasks
beyond `projekt:`; any change to the scan pipeline, the board or the table.

## Global constraints

Those of `docs/changes/bench-os/SPEC.md` "Global constraints" apply unchanged: TypeScript
`6.0.3`, ESLint limits, no `any`, immutable data, German UI and English code, Conventional
Commits, fixtures synthetic, machine paths only in `.env`, no new dependency without a reason.
Vault reads from `projekte` go through the injected handle; no import from `server/src/vault/`.

## Success criteria

1. With the real vault, `GET /api/projekte/stand` lists every handoff under
   `50_Workflow/Handoffs/` as a project - seven today - each with its `Zustand` text and a
   correct `updated`; the three handoff projects without a repository appear with zero
   repositories rather than not at all.
2. After the user fills `repos:` for `bench`, the `bench` project shows this checkout coupled,
   and `veraltet` flips to true once a commit lands after the handoff's date, back to false after
   the next `/handoff`.
3. `Ohne Projekt` lists exactly the scanned repositories no handoff names; nothing is listed
   twice across projects and `Ohne Projekt`.
4. `offeneTasks` for a project equals a hand count of open tasks in notes carrying its
   `projekt:` slug, excluding `50_Workflow`.
5. The Projekte view and the Cockpit panel render in both themes with real data; every
   interaction and empty state in the e2e spec passes; `npm run check` and `npm run e2e` green.
