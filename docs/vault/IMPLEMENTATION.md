# Vault

A read-only index of one Obsidian vault at `/vault`. The vault's markdown is the truth; Bench
never writes to it. Backed by `data/vault.sqlite`.

- Backend: `server/src/vault/` - `db.ts`, `locate.ts`, `watch.ts`, `index/` (the indexer, the
  frontmatter split, wikilink and task grammar), `routes/` (the five endpoints), `fixture/` (the
  bundled sample vault)
- Frontend: `web/src/vault/` - `App.tsx`, `components/`, `api.ts`, `markdown.ts`, `obsidian.ts`,
  `tree.ts`, `types.ts`, `styles.css`
- Tests: `server/test/vault/`, `web/src/vault/**/*.test.{ts,tsx}`, `e2e/vault/`

## Data model

Five tables in `server/src/vault/db.ts`, all of it derived from the markdown files:

- **`notes`** - one row per file: `path` (vault-relative, posix, primary key), `title` (the
  filename, never frontmatter), `folder`, `frontmatter` (the parsed YAML as a JSON string), `body`,
  `mtime`, `size`.
- **`links`** - one row per `[[wikilink]]` found in a note's body: `target` as written, optional
  `heading` and `alias`, `embed` (`![[...]]`), and `to_path` - filled in a second pass, null until
  then and null forever if the link does not resolve.
- **`tags`** - one row per tag in a note's frontmatter.
- **`tasks`** - one row per Tasks-plugin checkbox line, keyed on `(path, line)`.
- **`notes_fts`** - an FTS5 virtual table over `title` and `body`, `unicode61` tokenizer with
  diacritics folded, kept in step with `notes` by the indexer rather than a trigger.

**Rebuilding is deleting `data/vault.sqlite`.** Nothing here is hand-entered; the next start
reindexes the vault from scratch.

## The indexer

`index/indexer.ts` parses one file at a time (`indexNote`) inside a transaction: delete the note's
old rows, then insert the new ones for `notes`, `notes_fts`, `links`, `tags`, `tasks`.

- **Frontmatter** comes from `gray-matter` (`index/frontmatter.ts`). Its YAML engine turns a bare
  date like `2026-08-01` into a JS `Date`, which does not survive `JSON.stringify` as a date -
  `splitNote` normalises every `Date` value back to an ISO string first, so a date frontmatter field
  round-trips through the `frontmatter` JSON column as the string it should be.
- **Malformed frontmatter falls back to an all-body note rather than throwing.** An unclosed `---`
  fence or invalid YAML inside a closed one - both things a note mid-edit in Obsidian can genuinely
  be caught in - would otherwise propagate out of `splitNote` through `indexNote`: uncaught, that
  aborted the whole `indexAll` transaction (every note, not just the broken one) and, from the
  watcher, became an uncaught exception on the `add`/`change` event. `splitNote` now catches the
  parse and treats the whole file as body, frontmatter `{}`, so the note still indexes and appears
  in search - with no tags and no frontmatter fields until the YAML is fixed.
- **Links go in unresolved.** `writeLinks` inserts every link with `to_path` null; `resolveLinks`
  fills it in afterwards, once every note in the vault is known, because a link can name a note
  that is indexed later in the same pass, or not at all.
- **The resolution rule** (`resolveTarget`): an exact vault path wins first. Otherwise Obsidian
  resolves by the note's name alone, case-insensitively, `.md` optional - so when two notes share a
  name, the one in the _linking_ note's own folder wins, matching Obsidian's "shortest path" mode;
  with no folder match, the first note found for that name is used, which is genuinely ambiguous.
- **Tasks** (`index/tasks.ts`) parse the Tasks-plugin grammar: `- [ ]` / `- [x]` / `- [X]`, then the
  emoji fields in any order - 📅 due, ⏳ scheduled, 🛫 start, ✅ done-at, a priority from 🔺/⏫/🔼/🔽/⏬,
  and a 🔁 recurrence that runs to the next emoji field or the end of the line. Whatever is left
  after stripping every field, whitespace-collapsed, is the task's `text`.
- **Code fences are blanked line-for-line**, not removed (`stripCodeBlocks` in `index/wikilinks.ts`,
  shared by the task parser): a fenced line becomes an empty string, so an example `[[link]]` or
  `- [ ] task` inside a code block is never read as one, and every later line number - a task's
  `line` field - still matches the original file.

## The watcher

`watch.ts` wraps chokidar over the vault directory: `ignoreInitial: true`, and
`awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }` so a note is only read once an
editor has actually finished writing it, not mid-save. Any path segment starting with `.`, or
`node_modules`, is ignored - `.obsidian` and, in the real vault, `.superpowers` and `.claude` as a
side effect of the same rule. `add` and `change` re-index the one file; `unlink` removes it; both
then call `resolveLinks(db)` for the whole vault, because one file changing can create or break
links written by any other note, and re-resolving everything is cheap enough to just do.

## The API

Mounted at `/api/vault` (`routes/index.ts`), five routes, JSON only:

| Route             | Returns                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `GET /info`       | `{ name, notes }` - the vault's folder name and note count                   |
| `GET /tree`       | every note as `{ path, title, folder }`, ordered by path                     |
| `GET /note?path=` | one note in full: frontmatter, body, tags, its outgoing links, its backlinks |
| `GET /search?q=`  | up to 20 FTS hits: `{ path, title, folder, snippet }`, best match first      |
| `GET /file?path=` | one file from inside the vault, served as-is - images and other attachments  |

- **Search quoting.** `ftsQuery` splits the query on whitespace and turns each word into a quoted
  prefix term - `"word"*`, with embedded quotes doubled - joined back with spaces. That keeps
  anything the user types from being read as FTS5 query syntax, and makes every search a prefix
  match.
- **bm25 weights.** `ORDER BY bm25(notes_fts, 0, 8, 1)`: column 0 is `path`, unindexed and
  irrelevant; a hit in the title (column 1) counts eight times a hit in the body (column 2).
- **`/file` guards its path.** `path.resolve` the request against the vault root, then
  `path.relative` back from the root - if that starts with `..`, is empty, or is itself absolute,
  the request is rejected with 400 before anything touches the filesystem. This is the one route
  that can be pointed outside the vault by a crafted `path`, so it is the one that checks.

## The web app

Two routes inside the vault document (`App.tsx`, mounted at `/vault` by its own `BrowserRouter`):
`/` redirects to the note titled "Start", or the first note in the tree if there is none; `/n/*`
renders whatever note the rest of the path names. The `*` splat already comes back URL-decoded from
`useParams()`, so `NoteView` uses it directly as the vault-relative path key for `api.note()`.

- **`prepareMarkdown`** (`markdown.ts`) turns Obsidian syntax into markdown `react-markdown` can
  render: a wikilink becomes a link to `/vault/n/<path>` when `to_path` resolved, or plain text when
  it did not; an embed becomes an image pulled through `/api/vault/file`; a callout's `> [!type]`
  line becomes a bold line inside the same blockquote. Fenced code is left untouched, not blanked -
  this pass is for display, not extraction.
- **`resolveAsset`** resolves a relative image path against the _note's own folder_, not the vault
  root, matching how Obsidian resolves relative links, then routes it through the `/file` route.
- **In-app hrefs use `Link`.** `NoteView`'s custom `a` renderer swaps in react-router's `Link` for
  any href starting with `/vault/` so navigation between notes never reloads the document; anything
  else stays a plain anchor.
- **The tree is built client-side** from the flat `/tree` list (`tree.ts`'s `buildTree`), sorted
  with `localeCompare(..., "de")` so umlauts collate correctly. Which folders are open is kept in
  `localStorage` under `vault.expanded`, and the note currently open always shows as expanded even
  if it was not in that set.
- **The tree refetches on window focus.** The watcher keeps the index current while Bench runs, but
  nothing pushes that change to an open tab - `App.tsx` re-fetches `/tree` whenever the window
  regains focus, which is enough for a tab left open while you edit in Obsidian to catch up.
- **`obsidianUrl`** builds `obsidian://open?vault=<name>&file=<path>`, stripping the `.md`
  extension Obsidian's own URI scheme does not want.

## Configuration

`VAULT_DIR` in `.env` (`server/src/config.ts`), trimmed and treated as unset if blank.
`BENCH_DOTENV=off` skips loading `.env` at all, which is how the e2e servers stay clear of a
developer's real vault path however many keys `.env` grows. `locateVault` (`locate.ts`) picks the
configured directory if it exists, otherwise the bundled sample at
`server/src/vault/fixture/` - and if a configured path was set but does not exist, it says so
(`missing`) so the startup log can report it rather than silently substituting.

## Tests

**Unit** (`server/test/vault/`) mostly run against a private copy of the fixture vault
(`fixture.ts`'s `copyFixture`, a `mkdtemp` plus a recursive copy), so a test that writes into it -
the watcher tests above all - disturbs nobody and is thrown away afterwards.

**End to end** (`e2e/vault/`) gets one copy of the fixture per Playwright worker, under that
worker's own `VAULT_DIR` (`e2e/fixtures.ts`). Specs that write into it during the test poll with
`expect.poll` on a count that only ever grows - the note count from `/tree`, or a note's own body
containing new text - because a growing count cannot alias with a stale read the way an equality
check on a value that could go either way can.

## Things that will bite

- **An Obsidian vault's name is its folder's name**, taken verbatim (`path.basename`) and used in
  every `obsidian://` link. Renaming the checkout folder renames the vault as far as both Bench and
  Obsidian are concerned.
- **`.md` links resolve by basename**, so two notes with the same name anywhere in the vault are
  genuinely ambiguous - the one in the linking note's own folder wins; otherwise it is whichever one
  was found first, which is not meaningful.
- **Every search term becomes an FTS prefix match.** `"prof"*` matches "Profile", which is usually
  what you want, but also means the query is never an exact-word search - there is no way to ask
  for one from the search box.
- **The fixture vault is asserted on by its own counts.** `watch.test.ts` hardcodes note counts (12,
  13); change a file under `server/src/vault/fixture/` and the counts it is compared against, or a
  passing test starts failing on an unrelated fixture edit.
- **The watcher needs `ready` in tests.** Chokidar's first scan is asynchronous; a test that writes
  a file before the watcher fires `ready` can write before anything is listening and see no event at
  all. `watch.test.ts` awaits it before doing anything else.
- **The real vault's `.superpowers` and `.claude` folders are skipped for free** - `scan.ts`'s dot
  rule excludes any path segment starting with `.`, which was written for `.obsidian` but also
  keeps an AI coding agent's own working folders out of the index without a special case for them.
- **A symlink inside the vault is invisible to a fresh index, but not to the watcher.**
  `scan.ts`'s `listNotes` walks `readdirSync`'s `Dirent` entries, and a symlink's dirent type is
  neither file nor directory, so `indexAll` (boot, and the `vault-reindex` job) never sees a
  symlinked note or a symlinked folder full of notes - not an error, just silently absent. The live
  watcher disagrees: chokidar follows symlinks by default, so adding one while the watcher is
  running does get indexed, under the vault-relative path the symlink sits at - a file symlink to
  another vault note re-indexes that note's content a second time under the new path, and a
  directory symlink to somewhere outside the vault pulls every `.md` file under it into the index as
  if it lived there. Neither crashes anything, but the two disagree: a note only ever seen through a
  live-watched symlink does not survive the next full reindex, because `indexAll`'s "present" list
  comes from `listNotes`, which never counted it as present in the first place. This is read/list
  behaviour, deliberately left as-is - only the write surface below refuses to follow a symlink
  outside the vault.
- **`toggleTask` and `appendTask` (`write.ts`) refuse to write through a symlink that resolves
  outside the vault**, once every symlink on the way - the note itself or a folder above it - is
  followed to its real path. A lexically vault-relative path can still escape this way, and the
  route-level checks that gate both functions (`insideVault` in `routes/tasks.ts`, `knownTarget` in
  `aufgaben/routes.ts`) do not catch it, because a symlink the watcher already indexed (see above)
  reads as a perfectly normal known note. `toggleTask` answers this the same way it answers a stale
  `raw` - `{ ok: false, current: null, escapesVault: true }`, the existing 409 in `routes/tasks.ts`
  - and `appendTask` gained an `ok` discriminant it never needed before, since it could not
    previously fail; both of its callers (task creation and the Plaud import write path) now check it
    and answer 400 rather than writing outside the vault. See `write.test.ts`'s "realpath containment"
    cases for exactly what does and does not get refused.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
