# Bench - project overview

Six local-first apps behind **one frontend server and one backend server**: three merged from
four separate repos into one project, three built for Bench OS. Everything runs on your own
machine: no login, no cloud, no external services, no secrets. Data lives in local SQLite files.

This fork is becoming **Bench OS**: a window onto one person's Obsidian vault, Plaud notes, local
repositories and controlling reports. The plan is in [changes/bench-os/](./changes/bench-os/):
`SPEC.md` for what, `PLAN.md` for the phases. Groove was removed in Phase 0; the apps below are
what remain of the original four, and the new ones arrive one phase at a time.

| App          | Path        | What it is                                                                                                                                                                                                  | Backend                                     |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Vault**    | `/vault`    | A window onto an Obsidian vault, writable only through Aufgaben's guarded task toggle and create: folder tree, rendered notes with wikilinks and backlinks, tags, full-text search                          | `data/vault.sqlite`                         |
| **Projekte** | `/projekte` | Read-only inventory of git checkouts and coupled working folders: branch, dirty/ahead/behind, duplicates, brand and status from the vault, issues and PRs via `gh`                                          | `data/projekte.sqlite`                      |
| **Aufgaben** | `/aufgaben` | One board over the vault's tasks (toggle and create), Plaud work items awaiting import, and GitHub issues read-only                                                                                         | `data/aufgaben.sqlite` (import ledger only) |
| **Eingang**  | `/eingang`  | What arrived and is not yet processed: watched folders reconciled against the Plaud archive, fenced jobs against the local skills with a live log and a kill switch, scheduled launchd runs shown read-only | `data/eingang.sqlite` (job log only)        |
| **CRM**      | `/crm`      | Personal sales CRM: organizations, contacts, deals, drag-and-drop pipeline, activities, dashboard                                                                                                           | `data/crm.sqlite`                           |
| **Rolodex**  | `/rolodex`  | Personal CRM for your own people: check-in cadences, circles, birthdays, a timeline of every conversation, CSV and vCard import                                                                             | `data/rolodex.sqlite`                       |

The Cockpit at `/` replaces the old card-grid launcher: seven panels onto tasks, the watched
inbox, moving repositories and the vault's own session note, plus a plain link into each app.
Every page carries the same navigation strip: the Bench mark, then Start, Vault, Projekte,
Aufgaben, Eingang, CRM and Rolodex, each with the icon that identifies it inside its own app too,
and one theme toggle on the right.

## Detailed app documentation

One directory per app. Read these on demand - they are not loaded into context by default. Open the
app you are working in before changing its behaviour.

| App      | Implementation                                             | Requirements                                           | Also |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------ | ---- |
| Cockpit  | [cockpit/IMPLEMENTATION.md](./cockpit/IMPLEMENTATION.md)   | [cockpit/REQUIREMENTS.md](./cockpit/REQUIREMENTS.md)   |      |
| Vault    | [vault/IMPLEMENTATION.md](./vault/IMPLEMENTATION.md)       | [vault/REQUIREMENTS.md](./vault/REQUIREMENTS.md)       |      |
| Projekte | [projekte/IMPLEMENTATION.md](./projekte/IMPLEMENTATION.md) | [projekte/REQUIREMENTS.md](./projekte/REQUIREMENTS.md) |      |
| Aufgaben | [aufgaben/IMPLEMENTATION.md](./aufgaben/IMPLEMENTATION.md) | [aufgaben/REQUIREMENTS.md](./aufgaben/REQUIREMENTS.md) |      |
| Eingang  | [eingang/IMPLEMENTATION.md](./eingang/IMPLEMENTATION.md)   | [eingang/REQUIREMENTS.md](./eingang/REQUIREMENTS.md)   |      |
| CRM      | [crm/IMPLEMENTATION.md](./crm/IMPLEMENTATION.md)           | [crm/REQUIREMENTS.md](./crm/REQUIREMENTS.md)           |      |
| Rolodex  | [rolodex/IMPLEMENTATION.md](./rolodex/IMPLEMENTATION.md)   | [rolodex/REQUIREMENTS.md](./rolodex/REQUIREMENTS.md)   |      |

**IMPLEMENTATION.md** is how the app is built now: structure, domain rules, and the traps.
**REQUIREMENTS.md** is the original product brief, kept for intent and scope; their phased plans
are complete, not outstanding work. Where the two disagree, the code is the truth - but the gap is
worth understanding before you close it.

## Layout

```
package.json        npm workspaces: web, server. All commands run from the root.
web/                ONE Vite project, multi-page (MPA)
  index.html          Cockpit             -> src/home/
  crm/index.html      -> src/crm/main.tsx
  rolodex/index.html  -> src/rolodex/main.tsx
  vault/index.html    -> src/vault/main.tsx
  projekte/index.html -> src/projekte/main.tsx
  aufgaben/index.html -> src/aufgaben/main.tsx
  eingang/index.html  -> src/eingang/main.tsx
  src/shared/         the navigation strip and the theme - the only code all seven documents share
server/             ONE Express app
  src/index.ts        opens the six DBs, listens on :8100
  src/app.ts          mounts routers, serves web/dist with per-prefix SPA fallback
  src/crm/            crm routes + db + seed
  src/rolodex/        rolodex routes + db + seed
  src/vault/          vault routes + db + indexer, and the one write path (write.ts)
  src/projekte/       projekte routes + db + scan pipeline
  src/aufgaben/       aufgaben routes + import ledger db, reads vault.sqlite
  src/eingang/        eingang routes + jobs db + runner; index.ts wires its two internal job
                      kinds to the vault and projekte modules' own indexing code, in-process
  test/{crm,rolodex,vault,projekte,aufgaben,eingang}/   vitest suites
data/                 crm.sqlite, rolodex.sqlite, vault.sqlite, projekte.sqlite, aufgaben.sqlite,
                      eingang.sqlite, eingang-jobs/*.log (gitignored, seeded/scanned on first run)
.env                  this machine's vault path (gitignored); .env.example lists the keys as they arrive
server/src/config.ts  loads .env and describes the sources at startup
docs/                 this documentation; docs/<app>/ per app
e2e/                  Playwright specs
scripts/              check-secrets.mjs, the repo-specific half of the secrets check
                      stop-lint.mjs, the Claude Code Stop hook
eslint.config.js      one flat config covering web, server and e2e
knip.json             entry points, so knip can see what is reachable
lefthook.yml          pre-commit: format the staged files, then lint the tree
.github/workflows/    ci.yml - npm run check and npm run e2e, the only gate
.claude/settings.json the Stop hook registration (settings.local.json is not committed)
.vscode/              settings.json and extensions.json only, both shared deliberately
```

## Run

```bash
npm ci          # once, at the root
npm run dev     # API :8100 + Vite :8101 -> open http://localhost:8101
npm start       # build, then serve everything from :8100
```

**`npm ci`, not `npm install`.** npm drops optional platform packages often enough that a fresh
`npm install` here leaves `@rolldown/binding-darwin-arm64` uninstalled on Apple Silicon, and the
build dies with "Cannot find native binding" - reproduced on two clean clones out of two, while
`npm ci` succeeded. The lockfile names the binding correctly; `npm install`'s reconciliation is
what skips it ([npm/cli#4828](https://github.com/npm/cli/issues/4828)). `npm ci` also matches what
CI runs. Use `npm install <pkg>` only when adding a dependency, since `npm ci` will not update the
lockfile - and see [CONTROLS.md](./CONTROLS.md) for the same bug biting mid-project.

`npm run build` (typecheck + bundle), `npm test` (vitest, server + web), `npm run e2e` (Playwright),
`npm run check` (everything: typecheck, lint, formatting, secrets, dead code, coverage).
Commands run from the root; `-w web` / `-w server` targets one workspace.

Under `npm run dev` use **8101**. Port 8100 serves the last build, not your live edits.

## Architectural decisions

These are settled. Changing one is a project-level decision, not an implementation detail.

- **Multi-page, not one SPA.** The three apps keep their own global `styles.css`, and those files
  genuinely collide: `.app`, `.sidebar`, `.btn`, `.chip`, `.board`, `.brand`, `.card`, and
  `:root` variables. Projekte is the deliberate exception - every one of its classes is
  `projekte-`-prefixed, so it never collides on those bare names. Separate HTML entry points give
  one Vite server and one build while the stylesheets and routers never meet. Do **not** merge
  these into a single bundle without scoping the CSS first.
- **Router basenames.** crm and vault each mount at `/` inside their own document, via
  `<BrowserRouter basename="/crm">` / `basename="/vault"`.
- **API namespaces.** `/api/crm/*`, `/api/rolodex/*` and `/api/vault/*`. The underlying route
  names were already disjoint; the prefixes keep ownership obvious.
- **`/api` answers `Cache-Control: no-store`.** Express attaches an ETag to every JSON reply, so a
  browser that revalidates one gets **304 with an empty body** - which the client then parses as
  JSON and fails on, with a message that names neither the request nor the status. Nothing is
  saved by caching a list that changes whenever you touch it, on a machine talking to itself.
- **Six SQLite files, one process.** The schemas are unrelated - do not merge them. Each is
  opened separately and seeded if empty. They run in WAL mode, so recent writes live in the `-wal` sidecar
  rather than the main file: copy or move the whole set together, or checkpoint first
  (`sqlite3 f.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"`). Deleting a `-wal` as a stray artifact
  discards data - a 4KB `.sqlite` beside a 3MB `-wal` is a full database, not an empty one.
- **Ports:** 8100 API, 8101 Vite, 8150+ e2e (one per Playwright worker).
- **Deep-link fallback lives in two places.** `server/src/app.ts` handles production; the
  `appFallback` plugin in `web/vite.config.ts` does the same for the dev server. Without it a
  refresh on `/crm/contacts` serves the Cockpit. Both carry the same `APPS` list, and they have
  disagreed before - check both when you touch routing.
- **One shared module: `web/src/shared/`.** The navigation strip and the theme are the only code
  the seven documents have in common, and the `no-restricted-imports` rule allows it because that
  rule is a denylist of the sibling apps, not an allowlist. **Its CSS has to be self-contained.**
  It loads into seven stylesheets that collide on `.brand` and `:root`, each app redefines its own
  palette under `[data-theme]` - so every class in `nav.css` is `bench-nav`-prefixed and every
  value is a literal, never a variable. The strip looks the same over all of them, which is the
  point: it is chrome above the app, not part of it.
- **One theme, chosen once.** `web/src/shared/theme.ts` writes `data-theme` on the document
  element and remembers the choice in `localStorage` under `bench.theme`; each entry point calls
  `initTheme()` **before it renders**, because setting it after the first paint flashes the wrong
  theme on every navigation between apps. The first visit is dark. Every app
  defines its palette twice - once on `:root`, once under `[data-theme="dark"]` - and sets
  `color-scheme` so native controls follow.
- **Colour means state, not identity.** In the strip and on the Cockpit, **orange `#ff5c00`** marks
  the app you are in and nothing else; the apps are told apart by their glyph. That is what keeps
  each new app from needing a brand colour of its own. Inside an app, its own accents are its own
  business.
- **One dependency set per workspace.** Every app's UI lives in `web/`, so they share one set of
  versions: TypeScript 6, Vite 8, vitest 4, react-router 8, React 19.
- **TypeScript 6.0.3, pinned exactly, everywhere.** Root and both workspaces, one hoisted copy.
  6.0.3 is the last release carrying the JS compiler API that type-aware linting needs, so one
  compiler serves both `tsc --noEmit` and ESLint; TypeScript 7 is the native Go build and exposes no
  such API until 7.1. The pin is exact rather than `^6.0.3` because 6.1.0 would fall outside
  typescript-eslint's supported range. The cost is roughly three seconds a typecheck against 7.
  **Revisit when typescript-eslint supports the native compiler.** See
  [CONTROLS.md](./CONTROLS.md).
- **better-sqlite3 stays on 12.** `npm ci` prints one deprecation warning for its
  `prebuild-install` dependency; that is accepted, not an oversight. v13 ships `binding.gyp`
  inside the tarball next to its prebuilt binaries and relies on `gypfile: false` to stop npm
  compiling - but the lockfile and the registry's install metadata do not carry that field, so
  `npm ci` injects `node-gyp rebuild` and every install compiles from source. That succeeds
  silently on machines with Python and a C++ toolchain and fails hard on a stock Windows machine;
  the prebuilds inside the tarball are only read at require time, never at install. v12 downloads
  a prebuilt binary instead, which needs no toolchain. Revisit if npm starts carrying `gypfile`
  through the lockfile, or upstream stops shipping `binding.gyp` in the tarball.

## Bench OS decisions

Settled in [changes/bench-os/SPEC.md](./changes/bench-os/SPEC.md); listed here because they bend
the rules above.

- **Bench reads outside `data/`.** The vault, the repositories and the Plaud folder are the truth
  and stay where they are; Bench indexes them into `data/` and can rebuild every index. Paths come
  from `.env`, never from code.
- **The vault index is derived.** `data/vault.sqlite` can be deleted at any time; the next start
  rebuilds it from the markdown.
- **Two write paths into the vault, guarded.** Toggling or creating a task, and importing a Plaud
  work item - both go through the single write surface in `server/src/vault/write.ts`. Nothing
  else writes to a source.
- **Local CLIs are fair game.** `git`, `gh` and `claude` run as processes on this machine, the way
  Bench already runs `gitleaks`. No cloud call is made directly and no token is held.
- **A job runs on click, through a fence, never on its own schedule.** `eingang` starts a skill
  script or a `claude -p` run only when a person clicks a button, and only after `planJob`
  (`server/src/eingang/jobs.ts`) has checked the job's kind against a closed catalog and any file
  argument against a bare basename that already exists in the one folder that kind may touch -
  every check runs before any command is built, so a rejected request never reaches a shell. Bench
  itself schedules nothing; `eingang` only displays the launchd entries a person already set up
  outside it (SPEC.md principle 6).
- **`aufgaben` and `projekte` read the vault index.** A task is a line in a vault note, and a
  project's brand and status come from the vault note that couples to it, so both apps read
  `vault.sqlite` through `server/src/vault/` - the exception to "one database per app", and a
  one-way dependency in each case.
- **German interface, English code.** Routes and labels are German (`/projekte`, `Aufgaben`); the
  code, the docs and the commits stay English.
- **Immutable data.** New code builds new objects rather than mutating - the user's standing rule,
  on top of STANDARDS.md.
- **Conventional Commits.** One-line messages with a type prefix (`feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`, `test:`) - the user's house rule, and what STANDARDS.md now says.

## Adding an app

A new `web/<name>/index.html`, a new `web/src/<name>/`, an entry in `vite.config.ts`
`rollupOptions.input`, the prefix in the `APPS` list in **both** `server/src/app.ts` and
`web/vite.config.ts`, and a link in the Cockpit's app row in `web/src/home/App.tsx`. A backend, if
it has one, is a `server/src/<name>/` with its own database file opened in `server/src/index.ts`
and its router mounted at `/api/<name>` - and a `no-restricted-imports` entry in
`eslint.config.js` so it stays separate from its siblings.

Then the navigation: an icon in `web/src/shared/AppIcons.tsx`, an entry in the `APPS` list in
`web/src/shared/BenchNav.tsx`, the new key in that file's `AppKey` union, and
`<BenchNav active="<name>" />` above the app's own shell. No colour to pick - the strip's only
accent is orange, for wherever you are. Two things to get right in the app's own stylesheet: a
`[data-theme="dark"]` palette and `color-scheme`, and the height chain - the app's root element has
to leave room for a 47px strip; see how the existing apps do it.

## Design

Palette: orange `#ff5c00` as the one accent over greys, dark first and light second. Flat, sharp,
modern. See [STANDARDS.md](./STANDARDS.md) for the rules, including what to avoid.

## Related documents

- [PROCESS.md](./PROCESS.md) - how to implement a change and how to keep the test suite honest
- [STANDARDS.md](./STANDARDS.md) - coding standards
- [CONTROLS.md](./CONTROLS.md) - lint, static analysis, coverage and how each is enforced
- [e2e/EXPLORATORY.md](../e2e/EXPLORATORY.md) - what the automated suite deliberately does not cover
- [README.md](../README.md) - the short public-facing readme
