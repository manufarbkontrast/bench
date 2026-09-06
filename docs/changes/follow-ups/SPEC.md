# Change: Review-Nacharbeit

Four follow-ups the Plaud-MCP change's final review recommended and the user accepted on
2026-09-06, in one branch: a React error boundary in every web document, one rule for what a
handoff slug may contain enforced where the vault is indexed, the Kontext Regeln tab no longer
listing handoffs as rules, and one frontmatter line scanner on the server instead of four. Nothing
here adds a feature a person would notice on a good day; each closes a way the last two changes
could go wrong on a bad one. The design was settled with the user in two question rounds on
2026-09-06 (scope and process, then the four design choices, every recommendation taken); this
file is the condensed spec the plan is built from.

## Goal

- A component that throws while rendering no longer blanks the whole page. The Bench strip stays
  usable, the page says what happened, and one click reloads. Final review Important 1 was
  exactly this: a recording with a blank start threw inside `recordingMetaText` and Eingang went
  white.
- A handoff slug has one definition, applied once, when the vault is indexed. The three modules
  that read `projekt:` today (Projekte's handoffs and stand, Eingang's fence through the injected
  slug list) read the checked value instead of each trimming and lowercasing a free string.
- Kontext's Regeln tab shows the vault's workflow rules and nothing else. Today it lists
  `50_Workflow/Handoffs/*` too, because a handoff lives under `50_Workflow/`.
- The "key: value up to the first `: `" line scanner exists once, in a shared server module, with
  one test suite, instead of four copies that each carry a comment naming the other three.

## Decisions settled at design approval

From the 2026-09-06 round (scope):

1. **All four follow-ups, one change, one branch `follow-ups`,** cut from `main` at 46c3b80. The
   fifth recommendation - per-request directory scans of the Plaud folders - stays out: the note
   archive is four files, and the reads are already once per request.
2. **Full process:** this spec, then `PLAN.md`, then subagent-driven development with the ledger
   under `.superpowers/sdd/PLAN-follow-ups/`, the same machinery Projektstand and Plaud-MCP used.
   The slug rule earns the spec on its own: it can turn a handoff a person wrote into a warning.

From the 2026-09-06 round (design):

3. **The error boundary renders the Bench strip, a message, the error text and a reload button.**
   One class component in `web/src/shared/`, wrapped around `<App />` in all nine entry points,
   outside the router where there is one. Its fallback is `<BenchNav active={...} />` above a
   block reading `Diese Seite ist abgestürzt.`, the error's message in a `<pre>`, and a button
   `Neu laden` that calls `location.reload()`. One machine, one person: the message is the
   fastest diagnosis, and hiding it would help nobody. It catches render errors only - React's
   boundary contract; a rejected fetch or a throwing event handler behaves exactly as today.
4. **A slug is trimmed and lowercased, then checked against `^[a-z0-9]+(-[a-z0-9]+)*$`.** The
   normalisation is what `handoffs.ts` and `stand.ts` already do and what Projekte's doc
   promises (`projekt: Bench` is the project `bench`); the check is new. Letters, digits and
   single hyphens between them, nothing else - a slug goes into a `claude -p` prompt, a select
   option, an equality against a Plaud note's `projekt:` and a heading, and this alphabet passes
   through every one unchanged. All eight real handoffs pass. A handoff whose `projekt` is present
   but fails the check gets the Projekte warning `Ungültiger Slug in <file>` and drops out of the
   list, the way one without `projekt` already does.
5. **The Regeln tab excludes the folder `50_Workflow/Handoffs/` by name,** through one mirrored
   constant in `kontext/` with the why-comment the twins in `vault/routes/tasks.ts` and
   `aufgaben/routes.ts` already carry. A future sibling subfolder under `50_Workflow/` stays
   visible; only handoffs are known not to be rules.
6. **The scanner lives in `server/src/shared/frontmatter.ts`, and no server-side lint rule comes
   with it.** `server/src/shared/` is the server's mirror of `web/src/shared/`: importable from
   every app by the denylist logic the web rule already documents. The server's app boundary stays
   a convention - a `no-restricted-imports` rule for it would need carve-outs for the three
   deliberate imports into the vault's write and query surface (`projekte/routes.ts`,
   `aufgaben/mapping.ts`, `aufgaben/routes.ts`), and that is a project decision of its own.

Settled in this spec, open for the user's approval with it:

7. **The slug rule is enforced through a derived column, `notes.projekt`,** filled by the indexer
   and `NULL` unless the frontmatter's `projekt` is a string that passes decision 4 after
   normalisation. The readers select the column instead of parsing the frontmatter JSON. This is
   the only way to have one place: Projekte may not import from `vault/index/`, so the rule has to
   reach it through the data, and the index is derived and rebuilt on every start (`indexAll` in
   `index.ts`), so the column costs one `ALTER TABLE` migration on an existing file and nothing
   afterwards. The alternative - rewriting the stored frontmatter JSON to drop or normalise the
   key - was rejected: the `frontmatter` column is the note's own words and the Vault app shows
   it; a derived value beside it is honest, a doctored copy is not.
8. **Plaud notes keep their own `projekt:` reading, through the shared scanner, without the rule.**
   `stand.ts`'s `plaudNoteMeta` reads notes under `<plaudHome>/notizen`, which are not in the
   vault index; their `projekt:` was written by the `/plaud` skill from a slug the fence had
   already checked against the handoff list, and it is only ever compared for equality against a
   checked slug. Admitting it needs no rule; the comparison is the rule.
9. **`scanFrontmatter(text)` is the whole shared API:** `{ fields, body }`, where `fields` maps
   each key between the opening `---` (line one, exactly) and the closing `---` to the trimmed
   text after its first `: `, first occurrence winning, and `body` is everything after the closing
   line. No frontmatter, or an unclosed one, gives an empty map and the whole text as body. No
   YAML semantics, by design - the same reason each copy gives today: a machine-written `titel:`
   can carry its own `: `, and a line scanner reads it where a YAML parser refuses. The vault's
   own `splitNote` (gray-matter, for human-written notes) is a different tool for a different
   input and stays.
10. **Plaud-MCP decision 14 is superseded.** "Frontmatter scanning stays per app" was argued from
    the app boundary; a shared module under `server/src/shared/` keeps the boundary between apps
    and removes the copies. The marker goes into that spec, the way Projektstand's superseded
    lines are marked.

## Web

`web/src/shared/`, the one module the nine documents share.

- `ErrorBoundary.tsx` (new): a class component - React 19 still has no hook for
  `getDerivedStateFromError` - taking `active: AppKey` and `children`. Renders the children
  until one throws during render; then the fallback of decision 3. `AppKey` becomes an export of
  `BenchNav.tsx` for it.
- `crash.css` (new): the fallback's styles, `bench-crash-` prefixed, every value a literal with a
  `[data-theme="dark"]` twin - the same self-containment rule as `nav.css`, for the same reason:
  it renders over nine colliding stylesheets.
- The nine `main.tsx` files: `<ErrorBoundary active="<key>"><App /></ErrorBoundary>` around what
  each renders today; for crm, rolodex and vault the boundary sits outside `BrowserRouter`, and
  for crm outside `StrictMode` too, so a router or provider that throws is caught as well.
- `ErrorBoundary.test.tsx`: children render untouched; a child that throws yields the navigation
  landmark `Primary`, the heading `Diese Seite ist abgestürzt.`, the error message text and the
  button `Neu laden`. React reports the caught error on `console.error`; the test expects that
  call rather than letting it print.

No app's own code changes. The crash screen is chrome, like the strip: it says where you are and
lets you leave.

## Server

### `server/src/shared/` (new)

- `frontmatter.ts`: `scanFrontmatter` per decision 9.
- `server/test/shared/frontmatter.test.ts`: no frontmatter; unclosed fence; a value with its own
  `: `; a key repeated (first wins); a line without `: ` ignored; body starts after the closing
  line; CRLF is not handled (the copies do not either - stated, not fixed).

The four callers change to use it and lose their copies and their cross-naming comments:
`aufgaben/plaud.ts` (`splitFrontmatter`), `eingang/inbox.ts` (`frontmatterValue`, which
`plaud-fetch.ts` and `localRecordingIds` read through), `kontext/skills.ts` (`frontmatterField`),
`projekte/stand.ts` (`plaudNoteMeta`, which keeps its own `projekt`/`datum` validation on top).
Their existing suites are the regression net; each keeps passing unchanged.

### `server/src/vault/`

- `index/frontmatter.ts`: `projektOf(frontmatter): string | null` - decision 4, beside `tagsOf`.
- `db.ts`: `notes.projekt TEXT` in the schema, and the `PRAGMA table_info` / `ALTER TABLE ADD
COLUMN` migration in the pattern `crm/db.ts` set. No backfill: the next `indexAll` fills it.
- `index/indexer.ts`: `indexNote` writes `projektOf(frontmatter)` into the column.
- `GET /api/vault/note` builds its reply field by field and does not gain the column; the web
  `Note` type does not change.

### `server/src/projekte/`

- `handoffs.ts`: selects `projekt` beside `frontmatter`; a `NULL` with a `projekt` key present in
  the frontmatter is `Ungültiger Slug in <file>`, a `NULL` without one stays
  `Handoff ohne projekt: <file>`; the `trim().toLowerCase()` goes. `Doppelter Slug` and the
  `repos` warnings are unchanged.
- `stand.ts`: `openTaskCounts` joins on `n.projekt` and no longer parses frontmatter JSON. The
  `EXCLUDED_FOLDERS` rule stands.
- Eingang's fence inherits the rule through `projektSlugs()`, which is `vaultHandoffs`'s slugs -
  no change in `eingang/`.

### `server/src/kontext/`

- `routes.ts`: the `vault` half of `GET /regeln` filters out paths under
  `50_Workflow/Handoffs/` (decision 5). Unit test: a handoff row inserted into the test database
  is absent from the reply. The Profil, Stand and other tabs do not change.

## Docs

- `PROJECT.md`: the layout gains `server/src/shared/`; the "One shared module" decision becomes
  one per workspace, with the server's boundary stated as convention (decision 6); the vault
  decisions gain the slug rule and the derived column.
- `vault/IMPLEMENTATION.md`: the column and `projektOf`. `projekte/IMPLEMENTATION.md`: the `slug`
  row of the handoff table, the new warning. `kontext/IMPLEMENTATION.md`: the Regeln exclusion.
  `eingang/IMPLEMENTATION.md` and `aufgaben/IMPLEMENTATION.md`: the scanner sentences now name the
  shared module. `CONTROLS.md`: the coverage table from a fresh `npm run coverage`.
- `changes/plaud-mcp/SPEC.md` decision 14: superseded marker pointing here.
- `e2e/EXPLORATORY.md`: the crash screen - the suite cannot make a page throw on purpose, so the
  unit test is the proof and the browser check is a temporary `throw` under the sample world,
  reverted before commit.
- The `/handoff` skill outside the repo already writes `projekt: <projekt>` from a name the user
  chooses; its instruction gains one clause naming the alphabet, on the user's go, the way the
  `/plaud` skill was changed in the last change.

## Success criteria

1. **The crash screen.** `ErrorBoundary.test.tsx` passes; every one of the nine `main.tsx` renders
   through the boundary (a grep proves it); under the sample world a temporary `throw` inside
   one app's panel shows the strip, the message and the error text, and `Neu laden` restores the
   page - screenshot in the SDD workspace, untracked.
2. **The slug rule.** Indexer tests cover a valid slug, a slug needing normalisation, an invalid
   one, a non-string and an absent key; `handoffs.test.ts` covers the new warning. Against the
   real vault, `GET /api/projekte/stand` still lists eight projects with the same warnings as
   before the change (criteria report: counts only).
3. **The Regeln tab.** `e2e/kontext/kontext.spec.ts` asserts that neither fixture handoff appears
   under Regeln while `Testing` still does.
4. **One scanner.** `grep -rn 'indexOf(": ")' server/src` finds exactly one file; the four
   callers' suites pass unchanged; `server/test/shared/frontmatter.test.ts` exists and passes.
5. **The gate.** `npm run format`, `npm run check` (coverage at or above 80 % statements in both
   workspaces) and `npm run e2e` all exit 0 at the branch head.

## Out of scope

- Per-request directory scans of the Plaud folders (the review's fifth recommendation).
- A server-side `no-restricted-imports` rule (decision 6).
- `GET /inbox`'s `quelle` reconciliation in the "PLAUD_HOME set, notizen/ missing" world, the
  module-local `handoffTitle`, the once-seen `zahlen/App.test.tsx` failure under load - all left
  with their ledger rulings.
- `repos:` lists in the five handoffs still without one: the user's, in the vault.
- Catching anything a React error boundary does not catch: event handlers, promises, effects
  that reject. Those stay as the apps handle them today.
