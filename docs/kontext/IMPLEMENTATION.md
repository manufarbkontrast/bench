# Kontext

A read-only window at `/kontext` onto what the system already knows about the user: the vault's
own profile and workflow-rules notes, Claude Code's rule files and per-project memory, every
registered project's `CLAUDE.md`/`AGENTS.md`, the local skill catalogue, and the configured MCP
server names. No database of its own, and no write path - every route is a GET over the
filesystem or the vault's own database.

- Backend: `server/src/kontext/` - `locate.ts` (finds `~/.claude`, or the `BENCH_CLAUDE_DIR`
  override), `readers.ts` (the vault reads, the Claude-side file reads, the MCP config read),
  `skills.ts` (the skill catalogue, cached), `routes.ts` (the seven endpoints), `fixture/` (the
  committed `claude-home` tree tests and e2e point `BENCH_CLAUDE_DIR` at)
- Frontend: `web/src/kontext/` - `App.tsx` (the seven tabs), `components/` (`NoteList`,
  `SkillsPanel`), `api.ts`, `format.ts`, `types.ts`, `styles.css`
- Tests: `server/test/kontext/`, `web/src/kontext/**/*.test.{ts,tsx}`, `e2e/kontext/`

## No sample world

Unlike every other app in Bench, `locateKontext` (`locate.ts`) never falls back to a bundled
fixture on a real machine: it returns `~/.claude` outright, or `expandTilde` of `BENCH_CLAUDE_DIR`
when that is set, without checking that either exists. The real machine reading the real
`~/.claude` is the point of the app; a fallback would hide the product rather than demonstrate it.
Tests and e2e instead point `BENCH_CLAUDE_DIR` at the committed `server/src/kontext/fixture/claude`
tree - a synthetic `claude-home` with one rule file, two skill folders, one project's memory note,
and a `claude.json` whose only secret-shaped value is a poisoned MCP server URL that exists
precisely to prove it never reaches a response.

## The injected-handle pattern, extended to a third reader

`server/src/kontext/` never imports `server/src/vault/` or `server/src/projekte/` -
`KontextContext` (`routes.ts`) is built at the composition root (`server/src/index.ts`) from a
plain `vaultDb: Database.Database` handle plus a `projectPaths: () => { name; path }[]` getter,
the same shape Aufgaben's and Projekte's own vault reads already use for the exception
`PROJECT.md`'s Bench OS decisions document. Kontext is the third reader of `vault.sqlite` through
this pattern, and the first to read Projekte's own registered paths rather than a database it
owns.

`vaultNotesUnder` and `vaultNoteAt` (`readers.ts`) run a plain `SELECT ... FROM notes` against the
injected handle and filter in JS - `vaultNotesUnder`'s prefix filter uses `String.startsWith`
rather than a SQL `LIKE`, since `LIKE` treats `_` as a single-character wildcard and every prefix
this app filters on (`10_Profile/`, `50_Workflow/`) contains one; a naive `LIKE '10_Profile/%'`
would also match `10XProfile/...`.

## Seven parameterless routes

Mounted at `/api/kontext` (`routes.ts`):

| Route         | Returns                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `GET /profil` | `{ notes }` - the vault's `10_Profile/` notes                          |
| `GET /regeln` | `{ claude, vault }` - `~/.claude/rules` and the vault's `50_Workflow/` |
| `GET /stand`  | `{ note }` - the vault's `00_Index/Session_Context.md`, or `null`      |
| `GET /memory` | `{ projects }` - Claude Code's per-project memory notes                |
| `GET /repos`  | `{ repos }` - each registered project's `CLAUDE.md`/`AGENTS.md`        |
| `GET /skills` | `{ count, skills }` - the local skill catalogue                        |
| `GET /mcp`    | `{ servers }` - configured MCP server names, nothing else              |

None of the seven takes a client-supplied path, query parameter or body - each tab is its own
closed route, so there is nothing for a request to parametrize and nowhere for a path-traversal
attempt to land.

## The MCP file split

`mcpConfigPath` (`readers.ts`) resolves two different layouts. On a real machine `claudeDir` is
literally `~/.claude`, and Claude Code's own MCP configuration sits **next to** it, not inside it -
`<claudeDir>/../.claude.json` - so `mcpConfigPath` special-cases a `claudeDir` whose basename is
exactly `".claude"` to read that sibling file. The fixture `claude-home` is deliberately not named
`.claude` (it is `fixture/claude`), so tests and e2e take the simpler `<claudeDir>/claude.json`
branch instead - proving the same reader against a file that lives in a different place relative
to `claudeDir` than the real one does.

`readMcpServers` parses the file, then keeps only `Object.keys(parsed.mcpServers ?? {})` - the
parsed config, which may carry connection URLs, tokens or other per-server secrets, never leaves
the function. The fixture's `claude.json` hides `"https://secret.example.com/token?x=1"` inside
one server's own config for exactly this reason: `server/test/kontext/readers.test.ts` and
`e2e/kontext/kontext.spec.ts` both assert the string never reaches a response or the rendered
page - the unit half and the browser half of the no-secret guarantee.

## The skills cache

`listSkills` (`skills.ts`) is the one sanctioned exception to `STANDARDS.md`'s immutability rule:
a module-local `Map` keyed on `claudeDir`, each entry holding the last scan plus the skills
directory's own `mtimeMs`. A real machine carries roughly 500 skill folders, so re-reading and
re-parsing every `SKILL.md` on every `/skills` request would be wasteful when nothing has changed
since the last scan.

- **The cache key is the skills DIR's own mtime, not a recursive scan.** A request only re-scans
  when `statSync(skillsDir).mtimeMs` differs from what is cached - and a directory's mtime only
  changes when an entry is added to or removed from _that_ directory, not when a file inside one
  of its subdirectories is edited. So editing an existing skill folder's `SKILL.md` in place never
  bumps the skills dir's own mtime, and the cached name/description for that skill stays stale
  until some other change adds or removes a folder under `skills/` and forces a rescan. See
  "Things that will bite" below.
- **The count is the folder count, not the readable-`SKILL.md` count.** `scanSkills` returns
  `folderNames.length` as `count`, separately from `skills`, the filtered list of folders whose
  `SKILL.md` parsed successfully - a folder mid-setup with no `SKILL.md` yet still counts as a
  skill folder, so the counter and the list length can legitimately differ.
- **A missing skills dir is `{ count: 0, skills: [] }`, and clears any stale cache entry** - a
  `claudeDir` that used to have skills and no longer does is not left showing its last scan.

`frontmatterField`'s frontmatter reader is the same tolerant first-`": "` line scan
`aufgaben/plaud.ts` and `eingang/inbox.ts` already carry, not a YAML parser: a skill's own
description can contain its own `": "` (`"Sammelt A: ein Beispiel"`), which a real YAML parser
would reject as an incomplete mapping.

## Memory directory names render undecoded

Claude Code names each project's folder under `~/.claude/projects/` after the working directory's
absolute path with every `/` turned into `-` - so `/tmp/beispiel` becomes `-tmp-beispiel`.
`readMemory` (`readers.ts`) renders that folder name **as-is** rather than decoding it back into a
path: the encoding is lossy (a literal `-` already in the real path is indistinguishable from an
encoded separator), so decoding it would print something that only looks like a path without
reliably being one. The Memory tab's section headings are exactly these encoded names - see
"Things that will bite" below.

`readMemory` gets those folder names from `directoryNames` (`server/src/kontext/dirs.ts`), a
one-function module shared with `skills.ts`'s own `scanSkills` - both readers only ever needed the
subdirectory names directly inside one folder, so the scan lives in one place rather than twice.

## Tests

**Unit** (`server/test/kontext/`) covers `locateKontext`'s no-fallback behaviour against a
configured, blank and unset `BENCH_CLAUDE_DIR`; every reader in `readers.ts` against the fixture
and hand-built scratch directories, including the MCP file-split branch and the never-leaks-the-
secret-URL case; `listSkills`'s folder-vs-readable-count distinction and its mtime-only cache
invalidation; and the seven routes against an in-memory vault database and the fixture
`claude-home`, including a sweep that no response's JSON contains the fixture's own absolute path.

**End to end** (`e2e/kontext/`) runs against the committed fixture: Profil, Regeln and Stand render
the fixture vault notes and the Claude-side rule file; Skills counts the fixture's two folders and
narrows the list on a search without moving the counter off `2 Skills`; MCP lists the two fixture
server names and asserts the page never contains `secret.example.com`.

## Things that will bite

- **Rules, memory notes, and every repo's `CLAUDE.md`/`AGENTS.md` body render verbatim.** Regeln,
  Memory and Repos read each file whole and pass its body straight to a `<pre>`, with no scan or
  scrub of their own - a secret a person pastes into one of those files **will** render, on this
  tab, in full. The structural names-only guarantee - `readMcpServers` keeping only
  `Object.keys(parsed.mcpServers ?? {})`, see "The MCP file split" above - covers the MCP config
  alone; REQUIREMENTS.md scopes it the same way ("Any secret, token or connection detail. MCP
  server configuration can carry these..."), and it says nothing about the other five sources. The
  Task 9 gitleaks dump sweep - a live `gitleaks detect --no-git` run over every tab's rendered
  text (`changes/bench-os/PLAN-phase-5.md`) - is the detection this relies on; rotating whatever it
  finds is the remedy, not a scrub this app is meant to perform itself.
- **An unreadable file under `~/.claude/rules` or a project's `memory` folder 500s that whole tab,
  silently.** `readClaudeFile` (`readers.ts`) calls `readFileSync`/`statSync` with no `try`/`catch`,
  deliberate per STANDARDS.md's no-defensive-code rule and not an oversight, so a file
  `readdirSync` already listed failing to open (an EACCES permission bit, say) throws straight past
  the route handler into Express's default 500. The web app's `get()` helper (`api.ts`) turns that
  into a rejected promise the `void api.regeln().then(...)`-style calls in `App.tsx` never catch,
  so the tab's state stays at its empty default and the UI shows `Nichts gefunden.` exactly as it
  would for a genuinely empty folder - no error reaches the page anywhere.
- **An edited `SKILL.md` inside an existing skill folder is invisible until the next folder add or
  remove.** The cache invalidates on the skills directory's own mtime, and editing a file one
  level down does not touch its parent directory's mtime - a person who fixes a typo in a skill's
  description will not see it reflected in the Skills tab until some other skill folder is added
  or removed and forces a rescan. A server restart also clears the in-memory cache and picks up
  the edit immediately, which is why this is easy to miss in day-to-day development.
- **A project's Memory section heading is Claude Code's own encoded folder name, not a path.**
  `-tmp-beispiel` reads as an odd heading rather than `/tmp/beispiel` on purpose - decoding it back
  would be a guess dressed up as a path, since the encoding cannot distinguish a literal `-` in the
  real path from an encoded `/`.
- **A stale or moved project is silently absent from Repos, not listed with an empty file list.**
  `readRepos` skips a project whose `path` is not a directory outright - useful for not showing a
  misleading empty section for a checkout that moved, but it also means a genuinely broken
  `projectPaths` entry produces no error anywhere in this app to notice by.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
