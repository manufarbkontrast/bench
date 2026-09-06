# Aufgaben

One board at `/aufgaben` over the vault's own tasks (writable through the vault's one guarded
write path), processed Plaud meeting notes (importable into the vault), and GitHub issues
(read-only). Backed by `data/aufgaben.sqlite`, which holds only the import ledger - the task table
itself lives in `data/vault.sqlite`, Aufgaben's one documented cross-app read.

- Backend: `server/src/aufgaben/` - `tasks.ts` (the excluded-folder filter over the vault's task
  table), `plaud.ts` (the note parser), `mapping.ts` (topic-to-note rules), `dedup.ts` (the
  overlap check), `gh.ts` (issue counts), `db.ts` (the ledger schema and queries), `locate.ts`
  (`PLAUD_HOME` or the bundled fixture), `routes.ts` (the four endpoints). The write path itself
  lives in `server/src/vault/write.ts` and `server/src/vault/routes/tasks.ts` - see
  [vault/IMPLEMENTATION.md](../vault/IMPLEMENTATION.md).
- Frontend: `web/src/aufgaben/` - `App.tsx`, `components/` (`TaskList`, `CreateForm`,
  `PlaudPanel`, `IssuesPanel`), `api.ts`, `format.ts`, `types.ts`, `styles.css`
- Tests: `server/test/aufgaben/`, `web/src/aufgaben/**/*.test.{ts,tsx}`, `e2e/aufgaben/`

## The line-offset rule

`tasks.line` in the vault's `tasks` table counts inside the **frontmatter-stripped body** the
indexer parsed (`extractTasks` in `server/src/vault/index/tasks.ts`), not the file on disk - a
note with ten lines of frontmatter has its first body task at `line: 1`, not `line: 11`. A write
has to reverse that offset to find the real file line: `bodyOffset` (`server/src/vault/write.ts`)
runs the same `splitNote` the indexer used and subtracts the body's line count from the whole
file's, so the offset it produces is always the frontmatter block that same parse saw - `fileLine
= bodyOffset(text) + line`. Computing the offset from anything other than `splitNote` risks the
two disagreeing by even one line, silently toggling the wrong row.

## The 409 contract

`toggleTask` reads the file fresh on every call and compares the line at `fileLine` against the
`raw` text the caller last saw. A mismatch means the note moved since the caller's last read - in
Obsidian, from another Aufgaben tab, or from a Plaud import landing nearby - and the write is
refused with a 409 from `PATCH /api/vault/tasks`. **Either way the note is reindexed before the
handler replies**, on the refusal path exactly as much as the success path: the caller's next
fetch always sees the file as it now stands, not the stale copy that caused the conflict. The
route layer (`server/src/vault/routes/tasks.ts`) turns `{ ok: false }` into 409; the write
function itself never throws for an ordinary conflict, only for a line that turns out not to be a
task line at all.

## Atomic writes

Both `toggleTask` and `appendTask` go through `atomicWrite` (`server/src/vault/write.ts`): write
the new content to `.bench-write-<basename>` in the note's own directory, then `renameSync` it
over the real file. A rename within one directory is a single filesystem operation, so a reader -
Obsidian, or Bench's own watcher - never observes a half-written file. The tmp name starts with a
dot on purpose: `watchVault`'s `ignored` rule (`server/src/vault/watch.ts`) skips any path segment
starting with `.`, so chokidar never fires a spurious `add` for the tmp file appearing and
vanishing a moment later. The watcher does still fire once the rename lands on the real filename,
which is redundant with the write function's own synchronous `indexNote`/`resolveLinks` call
immediately after - harmless, since indexing one note is idempotent and cheap, but worth knowing
before assuming every reindex trace came from the watcher. `atomicWrite` only makes the write
itself atomic, not the whole operation: `toggleTask` and `appendTask` each read the note, build the
new content from what they read, and only then reach `atomicWrite` - a save from Obsidian landing
in that window is invisible to the read and gets overwritten by the rename, same as any other
read-modify-write race with no lock between the two writers.

## The exclusion list

`EXCLUDED` (`server/src/aufgaben/tasks.ts`) is `50_Workflow`, `Templates` and `90_Archive` -
Bench's own housekeeping folders, whose tasks are templates and workflow notes rather than user
work. `hasExcludedSegment` checks every path segment of a task's note, not just a prefix, so a
task nested inside `50_Workflow` at any depth is filtered. **This applies in `listTasks`
(`aufgaben/tasks.ts`), not in the vault indexer** - the indexer holds every task from every note
without judging any of them, and the Vault app still shows those notes and their checkboxes in
full. Aufgaben is the only reader that drops them, because a task in `Templates/Neues-Projekt.md`
is a placeholder, not a commitment.

## The ledger

`data/aufgaben.sqlite` holds one table, `task_imports`, keyed on `(source_file, row_hash)` - the
Plaud note's filename and a SHA-256 of `wer|was|bis` for that row, computed identically in
`plaud.ts`. `recordImport` is a plain `INSERT`, so importing the same row twice throws on the
primary key rather than silently duplicating - `POST /api/aufgaben/import` catches that as a 409
before it ever reaches the ledger, by checking `findImport` first.

**Write the vault line, then record the ledger row - never the other way round.** `routes.ts`
calls `appendTask` before `recordImport`, with the comment spelling out why: a failed append must
never leave a ledger entry claiming a task exists that the vault does not have. Recording first and
appending second would risk the opposite failure - a ledger entry for a task that was never
written - which is worse, because nothing about it looks wrong until someone goes looking for the
task and cannot find it.

**A `targetPath` whose realpath escapes the vault answers 400 before anything is recorded.**
`appendTask` (`server/src/vault/write.ts`) returns `{ ok: false }` when `targetPath` resolves
outside the vault once every symlink on the way is followed (`resolvesInsideVault`, the same
containment the vault's own write path uses) - `POST /api/aufgaben/import` turns that into 400
"targetPath must stay inside the vault" and never reaches `recordImport`, on the same
append-first-record-second discipline above. This is the import route's only path containment:
`knownTarget` above it only checks that `targetPath` is `TASK_INBOX` or already a row in the
`notes` table - it says nothing about where that path resolves on disk, which is what let a
vault-relative path through a symlink reach a real write outside the vault before this containment
existed.

**A `targetPath` under `50_Workflow/Handoffs/` answers 400 "handoff notes are read-only", checked
before `knownTarget` and before anything is recorded.** A local `HANDOFF_FOLDER` constant, not an
import from `projekte/handoffs.ts` - the two apps never import each other.

**The ledger's `line` is provenance, not a live pointer.** It records where the task landed at
import time, for the `Übernommen` link the UI shows afterwards. Nothing keeps it in step with
later edits to the note - insert a line above it in Obsidian and the ledger's `line` now names the
wrong row. This is deliberate: recomputing it from the (now possibly changed) `raw` text on every
read would need the same raw text stored twice, once in the ledger and once as whatever landed in
the vault's own `tasks` table, and reconciling the two adds a failure mode for no real gain -
nothing reads the ledger's `line` back into the vault.

## Mapping and dedup

`suggestTarget` (`mapping.ts`) is a fixed rule table, hard-coded from the `aufgaben-import` skill
this user already runs by hand - **this vault's own conventions, not a general algorithm**. Each
rule pairs a keyword list with a target note; the first rule whose keyword appears as a whole word
in the Plaud note's text, and whose target note already exists in the vault index, wins - a rule
can match its keyword and still be skipped when the note it would file under is not there yet, on
the chance a later rule's target does exist. The ÆND row is widened past the brand name itself:
"ænd" carries a non-ASCII letter no plain word-boundary check can rely on being spoken in a
transcript, so that row also matches the artist- and release-language the meetings about it
actually use ("artist", "release", "tier"). With no rule matching, the target falls back to
`TASK_INBOX`.

`findExisting` (`dedup.ts`) looks for an open vault task whose text shares at least half its
significant words with a Plaud item's `was` - words of four or more letters, lowercased, with
umlauts kept as letters (`[^a-zäöüß]+` is the split, not a plain non-word boundary). **A done task
can never win the match**, deliberately: a Plaud item that turns out to already be finished
elsewhere should still surface for import, not get silently absorbed into a closed row nobody will
look at again. The result is a hint shown next to the row in the Plaud panel, never a block on
importing - the person doing the importing decides whether it really is the same work.

## GitHub issues

`gh.ts` is a small, deliberate duplicate of `projekte/gh.ts`'s own runner - cross-app imports stay
banned, and issue-listing is the whole of what either side needs from the CLI. `fetchIssues` runs
`gh issue list -R <label> --state open --json number,title,url,labels --limit 200` and **returns
null on any failure** - offline, not logged in, the repository gone, output that will not parse -
never throws, so one unreachable repository never fails the whole `/issues` response; the UI shows
"GitHub nicht erreichbar" for that repo's section and every other section still renders.

The repository labels come from Projekte's own scanned rows (`githubLabelsFrom` in
`server/src/app.ts`), deduplicated, so Aufgaben never scans anything itself - it only asks `gh`
about repositories Projekte has already found. `GET /api/aufgaben/issues` takes `gh: GhRunner |
"off"`; `BENCH_GH=off` (every e2e worker, and available on a developer machine) answers
`{ source: "off", repos: [] }` before any label is looked up, so the real CLI is never invoked in
tests or in e2e.

## The API

Mounted at `/api/aufgaben` (`routes.ts`), four routes:

| Route          | Returns                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /tasks`   | `{ tasks }` - every vault task outside the excluded folders                                                    |
| `GET /plaud`   | `{ source, notes }` - every processed Plaud note, each item flagged with its import and dedup state            |
| `POST /import` | `{ targetPath, line, raw }` - imports one Plaud row; 404 unknown row, 409 already imported, 400 unknown target |
| `GET /issues`  | `{ source, repos }` - open issues per known GitHub label, or `{ source: "off", repos: [] }`                    |

A task's own checkbox toggle and the hand-created task both go through the vault's own
`PATCH`/`POST /api/vault/tasks` instead - Aufgaben's frontend calls those directly, since the write
path belongs to the vault, not to Aufgaben.

## The web app

`App.tsx` (served at `/aufgaben`, `main.tsx` renders it directly with no router) fetches tasks,
the vault tree, Plaud notes and issues on load, and switches between seven tabs: Heute, Woche,
Projekt, Marke, Unzugeordnet, Erledigt, Issues.

- **Heute** splits into three sections: overdue, due today, and open tasks with no due date but
  highest or high priority.
- **Woche** lists open tasks due from today through six days out, sorted by due date.
- **Projekt** and **Marke** group open tasks by note title and by brand tag respectively, each
  alphabetical with the unbranded group sorted last on Marke.
- **Unzugeordnet** is two panels at once: `PlaudPanel` (every Plaud note's work items, an import
  button and dedup hint per row) above the vault's own unassigned open tasks.
- **Erledigt** shows the last 30 completed tasks, most recently finished first.
- **Issues** renders `IssuesPanel` - one section per GitHub repository, or the off-mode message.

Toggling a task calls `PATCH /api/vault/tasks`; a 409 shows a fixed conflict message and refetches
the task list rather than trying to resolve the conflict itself. `CreateForm` posts to
`POST /api/vault/tasks` with only the fields that have a value - the server treats an empty string
for `due` or `priority` as invalid input, not as absent.

## Tests

**Unit** (`server/test/aufgaben/`) covers the parser, the mapping rules, the dedup threshold, the
ledger, and the routes against a scratch vault database; `gh.test.ts` never calls the real CLI -
every case injects a fake `GhRunner`, the same pattern `projekte/gh.test.ts` uses.

**End to end** (`e2e/aufgaben/`) runs against the per-worker fixture vault and the bundled Plaud
fixture note: `tasks.spec.ts` covers the toggle-and-revert round trip, a conflicting edit on disk
rejected without losing the edit, and creating a task from the default target; `import.spec.ts`
covers the dedup hint, importing an unmatched row into its suggested target, the ledger surviving
a reload, and the Issues tab's off-mode message.

## Things that will bite

- **Recurrence is never computed.** A task's `recurrence` field is read and shown, but toggling a
  recurring task off just flips that one line's checkbox and stamps `✅ <date>` like any other -
  Aufgaben never writes a new occurrence. Obsidian's Tasks plugin computes and inserts the next
  occurrence itself, the next time the note is opened there; a recurring task toggled only in
  Aufgaben and never reopened in Obsidian stays a one-off.
- **A task inside a code fence is not indexed, and so cannot be toggled from Aufgaben at all.**
  `stripCodeBlocks` blanks fenced lines before the indexer's task parser ever sees them, by design
  - an example `- [ ]` inside a code block in a vault note is documentation, not work. It never
    reaches the `tasks` table, so it never reaches Aufgaben either.
- **Two tasks with identical raw text on different lines are disambiguated by line number, not
  text.** `toggleTask` matches on the exact line the caller names, not on a search for matching
  text - if a note has "`- [ ] Anker streichen`" twice, toggling the row Aufgaben shows for the
  second occurrence toggles that occurrence, never the first, because the request carries the
  specific line the list fetch returned.
- **The ledger's `line` goes stale the moment the note is edited above it.** See "The ledger"
  above - it is where the row landed at import time, not a pointer kept in step with the file.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [vault/IMPLEMENTATION.md](../vault/IMPLEMENTATION.md) - the write path Aufgaben's writes go
  through
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
