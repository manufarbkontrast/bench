# Change: Bench OS

Turn Bench into a personal operating system for one user: a window onto the sources that already
hold their work - an Obsidian vault, Plaud meeting notes, local git repositories and their GitHub
remotes, controlling reports - plus the context their AI tooling runs on. The full German brief,
with the inventory and the reasoning behind each decision, lives in the user's vault at
`30_Projekte/KI_Automatisierung/Bench_OS_Plan.md`. This file is the condensed spec the plan is
built from.

## Goal

One local server, one launcher, and these apps:

| App      | Route       | Purpose                                                                                                                                                                                    | Phase |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Cockpit  | `/`         | The desk: overdue and due tasks, inbox counts, repos with uncommitted work, the last controlling run, "continue here" from the vault's session note. Replaces the launcher.                | 3     |
| Vault    | `/vault`    | Read the Obsidian vault: folder tree, rendered notes with wikilinks, backlinks, full-text search, tags, open-in-Obsidian.                                                                  | 1     |
| Projekte | `/projekte` | Every repo and working folder under the configured roots: brand, status, branch, last commit, dirty/ahead/behind, issues and PRs via `gh`, the vault note it belongs to, duplicates.       | 2     |
| Aufgaben | `/aufgaben` | One board over vault tasks (writable), Plaud work items (importable into the vault) and GitHub issues (read-only). Views: today, week, by project, by brand, unassigned.                   | 3     |
| Eingang  | `/eingang`  | What arrived and is not yet processed (transcripts, voice notes); start jobs - Plaud processing, task import, controlling runs - through the existing skills, with logs and a kill switch. | 4     |
| Kontext  | `/kontext`  | What the system knows about the user: profile and rules from the vault, Claude Code memory per project, `CLAUDE.md`/`AGENTS.md` of every repo, the skill catalogue, MCP server names.      | 5     |
| Zahlen   | `/zahlen`   | The last controlling run and its archive, deep links into myCrafton.                                                                                                                       | 5     |

CRM and Rolodex stay. Groove is removed in Phase 0. Space is removed once the Vault app is live.

## Principles

1. **Sources stay the truth.** Vault markdown, git, `~/Plaud`, controlling output. Bench indexes
   into SQLite files under `data/`; every one of them can be rebuilt from the sources.
2. **Two write paths, nothing else.** (a) Toggle or create a task in the vault - a single-line edit
   in the `.md`, guarded: the line must still read as it did when Bench last indexed it, or the
   write is refused with 409. (b) Import a Plaud work item into the vault as a task, with a link
   back to the note and a ledger that stops the same row being imported twice. Notes are never
   edited in Bench; Obsidian stays the editor.
3. **Bench's architecture stands.** New apps follow "Adding a fifth app" in `PROJECT.md`: own
   HTML entry, own `web/src/<app>/`, own `/api/<app>` router, no imports between apps. One SQLite
   file per app domain. One documented exception: `aufgaben` reads the vault index, because a task
   is a vault line.
4. **No secrets in the repo, machine paths in `.env`.** `VAULT_DIR` first; `PLAUD_HOME`,
   `PROJECT_ROOTS`, `CONTROLLING_DIR` and `INBOX_WATCH` are added with the app that reads each,
   never before. `.env` is gitignored; `.env.example` lists the keys. Without `.env` Bench runs
   against bundled synthetic samples, so `npm start` still shows a living app and e2e workers stay
   isolated.
5. **Local CLIs, never the cloud directly.** Bench calls `git`, `gh` and `claude` the way it would
   call any tool on the machine. `gh` carries its own login; Bench holds no token.
6. **Assisted before autonomous.** A job runs when clicked, with a tool allowlist, a turn limit, a
   timeout and a kill button. No scheduling inside Bench.
7. **The user's UI rules override Bench's taste.** No eyebrow labels, no gradients, no hover
   transforms, no pills, normal sidebars, one accent. Accent: neon orange `#ff5c00`. Dark is the
   first-visit theme; light is the second, given equal care.
8. **German interface, English code.** Routes, labels and copy in German; identifiers, file names,
   commit messages and these documents in English, matching the rest of the repo.

## Global constraints

- Node `^22.22.0 || >=24.0.0`, TypeScript `6.0.3` exactly, better-sqlite3 `12`, everything else
  as the lockfile says.
- `npm run check` and `npm run e2e` pass before every commit. Coverage stays at or above 80 %
  statements in both workspaces. No rule is loosened to get there.
- ESLint size limits apply to new code: 500 lines a file, 200 a function, complexity 15, depth 4,
  five parameters.
- Immutable data in new code: build new objects, do not mutate.
- Fixtures use `example.com` addresses and `555-01xx` numbers; no real names of staff, artists or
  customers anywhere in tracked files.
- Agents commit; the user pushes. A session that starts on `main` branches first.
- Commit messages in Conventional Commits form (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`,
  `test:`), the user's house rule; `STANDARDS.md` is brought in line in Phase 0.

## Out of scope

Editing notes, git operations from the UI, scheduling, mobile or remote access, calendar and
mail, autonomous loops, anything that keeps data only in Bench.

## Success criteria for the whole change

- Every app in the table above exists at its route, in both themes, with `IMPLEMENTATION.md` and
  `REQUIREMENTS.md` under `docs/<app>/`.
- The user's real vault, Plaud notes, repositories and controlling runs appear in Bench without
  any of them being copied, and a task toggled in Bench shows as done in Obsidian.
- The full suites pass with coverage, and the running product has been walked through in a real
  browser, in both themes, screen by screen.
