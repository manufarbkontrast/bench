# Eingang

One page at `/eingang` over three things: the folders Bench watches for new material, the local
CLIs Bench can run against them, and the launchd entries that already run some of those CLIs on a
schedule. Backed by `data/eingang.sqlite`, which holds only the job log - one row per spawned or
in-process run, never the watched files or the source folders themselves.

- Backend: `server/src/eingang/` - `locate.ts` (finds the watch dirs, or falls back to the bundled
  fixture), `inbox.ts` (lists and reconciles watched files, by name and by Plaud recording id),
  `jobs.ts` (the fence: what job kinds exist, what arguments they take, what command each becomes),
  `plaud-mcp.ts` (the stdio client for the Plaud MCP), `plaud-fetch.ts` (parses the MCP's reply
  shapes and writes the fetched file), `runner.ts` (spawns or runs a job, streams its log, kills
  it), `db.ts` (the jobs table), `schedule.ts` (reads launchd plists), `routes.ts` (the eight
  endpoints), `fixture/` (the sample inbox, controlling report and plists, a bundled Plaud listing
  and its stand-in MCP script, plus `fake-job.mjs`, the stand-in child process under sample data
  and in tests).
- Frontend: `web/src/eingang/` - `App.tsx`, `components/` (`AufnahmenPanel`, `InboxList`,
  `JobsPanel`, `LogView`, `SchedulePanel`), `api.ts`, `format.ts`, `types.ts`, `styles.css`
- Tests: `server/test/eingang/`, `web/src/eingang/**/*.test.{ts,tsx}`, `e2e/eingang/`

## Sample and configured worlds

`locateEingang` (`locate.ts`) picks one world for the whole app, gated on a single field rather
than one per source: `INBOX_WATCH` names one or more folders, and if none of them exist on disk,
every part of Eingang - watch dirs, the controlling report folder, the launchd directory, and
whether a job actually spawns a real command - falls back together to the bundled fixture tree
under `server/src/eingang/fixture/`.

Two fields are the deliberate exceptions to that rule: a configured world never borrows the
fixture for either, real-or-null instead.

- A configured `INBOX_WATCH` with no `CONTROLLING_DIR` is real, not sample - `controllingDir` is
  `null` in that case rather than silently borrowing the fixture's controlling folder. `planJob`'s
  `controlling` kind then refuses with 400 ("controlling is not configured") instead of running
  the fixture's script against a real vault and a real `skillsDir`.
- A configured `INBOX_WATCH` with no `PLAUD_HOME` is the same shape: `index.ts`'s wiring gives
  `JobPaths.plaudHome` the value `null` rather than the tracked fixture tree under
  `server/src/eingang/fixture/`. `planJob`'s four plaud-facing kinds - `plaud-sync`,
  `plaud-process`, `aufgaben-import`, `plaud-fetch` - each refuse with 400 ("plaud is not
  configured") before any other check that would build a path from `plaudHome`, so a real watch
  folder can never end up paired with the sample fixture as the target of a real `claude -p`,
  `plaud-sync.sh` or MCP fetch.

## The fence

Every job Bench can run passes through `planJob` (`jobs.ts`) before anything is spawned, and every
check inside it runs **before any argv or cwd is built** - an unknown kind, a bad argument, or a
missing target file never reaches a command:

- **A closed catalog of seven kinds** - `plaud-sync`, `plaud-process`, `aufgaben-import`,
  `controlling`, `vault-reindex`, `projekte-scan`, `plaud-fetch`. Anything else answers
  `unknown job kind: <kind>`.
- **A file argument must be a bare basename.** `fileNameOf` rejects a value that is not a string,
  contains `/` or `\`, or starts with `.` - the one check that is the whole fence for path
  traversal, since a real file name from `readdirSync` can never contain a separator. `POST
/api/eingang/jobs { kind: "plaud-process", args: { file: "../../etc/hosts" } }` is exactly the
  shape `routes.test.ts` checks answers 400.
- **The file has to already exist where the kind expects it** - `plaud-process` under
  `<plaudHome>/inbox`, `aufgaben-import` under `<plaudHome>/notizen` - checked with `existsSync`
  and `statSync(...).isFile()` against the real path, not trusted from the request.
- **The file's realpath must resolve inside the folder it was found in.** `resolvesInsideFolder`
  (`jobs.ts`) resolves both the folder's and the target's realpath and requires the target's to
  start with the folder's plus a path separator - the same boundary `vault/write.ts`'s
  `resolvesInsideVault` draws for a vault write, kept as a same-module helper here rather than a
  cross-app import. `fileNameOf`'s bare-basename check cannot see through a symlink, so this is
  what catches a symlink planted in `inbox/` or `notizen/` that resolves outside `plaudHome`:
  refused with `file escapes the inbox folder: <file>` / `... escapes the notizen folder: ...`,
  before any argv is built.
- **`controlling`'s `modus` is a two-value enum**, `"zwischenstand"` or `"abschluss"`; anything
  else is rejected before `controllingDir` is even looked at.
- **A no-argument kind rejects extras.** `plaud-sync`, `vault-reindex` and `projekte-scan` all
  route through `rejectExtraArgs`, which fails on any key at all in `args` - there is nothing for
  these kinds to parametrize, so an extra key is refused rather than silently ignored.
- **`plaud-fetch`'s `id` must match `^[A-Za-z0-9_-]{1,64}$`, and nothing else.** `planPlaudFetch`
  rejects a missing or non-matching `id`, any second key in `args`, a null `plaudHome`, and - via
  `localRecordingIds`/`isLocal` (`inbox.ts`) - an id already sitting in `inbox/`, `archiv/` or
  `notizen/`, answering `recording already local: <id>` before a `plaud-fetch` job is ever planned.
- **`plaud-process`'s optional `projekt` must name a real handoff.** `projektArgOf` lets an absent
  `args.projekt` through as `null`, rejects a non-string one, and otherwise requires it to appear
  in `ctx.projektSlugs()` - the vault's own handoff slugs, injected by the composition root -
  answering `unknown projekt: <slug>` for anything else. This check runs after the file argument is
  proven to exist but before `ctx.sample` is even looked at, so a bad `projekt` is refused in both
  worlds alike, before any prompt is built.

## Real jobs, fixture jobs, internal jobs

`JobPlan` is one of two shapes. `{ kind: "spawn", argv, cwd }` is a child process; the runner
spawns `argv[0]` with the rest as arguments. `{ kind: "internal", name, args }` names one of three
kinds - `"vault-reindex"`, `"projekte-scan"`, `"plaud-fetch"` - which run **in-process**: the
runner calls `internals[name](log, args)` directly instead of spawning anything, where `args` is
exactly the plan's own object (`{}` for the first two, `{ id }` for `plaud-fetch`).

`vault-reindex` and `projekte-scan` run **always for real, regardless of sample or configured** -
there is no fixture stand-in for either, because both already have their own bundled sample data
to run against (the fixture vault, the fixture workshop) and running them for real is cheap.
`plaud-fetch` differs: `index.ts` wires it to the same `runPlaudFetch` (`plaud-fetch.ts`) in both
worlds, but that function branches on `deps.sample` itself - under sample data it logs the three
calls it would have made (`list_files page 1`, `get_transcript <id>`, `get_note <id>`) and returns
without writing anything or ever reaching `withPlaud`. The sample stand-in lives inside the job
function, not in a swapped-out `argv` the way the four spawn kinds get `fakeSpawn` below.

`server/src/eingang/` itself never imports from `server/src/vault/` or `server/src/projekte/` -
`RunnerInternals`' three functions are generic `(log, args) => Promise<void>` closures, and
`index.ts`, the composition root, is what actually wires them to `indexAll` (vault), `scanProjects`
(projekte) and `runPlaudFetch` (Plaud, over `withPlaud`) when it builds the runner. This is
different from Aufgaben and Projekte's own documented exception to "one database per app" (see
`PROJECT.md`'s Bench OS decisions): those two import `server/src/vault/` directly inside their own
route and db modules, where Eingang's own module graph stays as isolated from its siblings as
every other pair of apps.

The four remaining kinds spawn a real command only in the configured world - each script lives
under `<skillsDir>`, but runs with its cwd set to the one folder its own work belongs in, never to
`skillsDir` itself:

- `plaud-sync` runs `<skillsDir>/plaud/scripts/plaud-sync.sh` with cwd `<plaudHome>`.
- `plaud-process` runs `claude -p` with cwd `<plaudHome>`, a prompt naming the target file under
  `<plaudHome>/inbox`, a `--max-turns` ceiling and an explicit `--allowedTools` list; when the
  request named a `projekt` (checked against the vault's handoff slugs, see `## The fence` above),
  the prompt gains one more sentence, `Trage projekt: <slug> in das Frontmatter der Notiz ein.` -
  so the prompt is no longer fixed once a project is chosen.
- `aufgaben-import` also runs `claude -p`, with cwd `<vaultDir>`, a prompt naming the target Plaud
  note, the same `--max-turns`/`--allowedTools` shape, and `--add-dir <vaultDir>` - the one
  directory this run may write under.
- `controlling` runs `<skillsDir>/shoesplease-controlling/scripts/geplanter_lauf.sh <modus>` with
  cwd `<controllingDir>`.

Under sample data (`ctx.sample`), every one of those four becomes `fakeSpawn`: the same argv
shape, but `argv[0]` is the current Node binary and the script is `fixture/fake-job.mjs <kind>`
instead of the real command. The fake reads `BENCH_FAKE_JOB` from its environment - unset prints
one start line then a line a second for three ticks before exiting 0; `"fail"` exits 2
immediately; `"hang"` never exits on its own, for the kill and timeout tests. Nothing about
`planJob`'s fence changes between the two worlds; only which command a passing plan turns into
does.

## The runner

`createRunner` (`runner.ts`) tracks one `InFlightJob` per running id: the child process (spawn
jobs only), any pending timers, and why the job is ending, if a kill or a timeout has already been
requested (`EndReason`, first cause wins via `markEndReason`'s `??=`).

- **A log file per job**, `data/eingang-jobs/<id>.log`, with the id assigned first by `insertJob`
  and the row's `log_path` corrected once the id is known.
  For a spawned job, stdout and stderr are piped into the same stream; for an internal job,
  `runInternal` writes a timestamped line for each call the job makes to the `log` function it is
  handed.
- **Resolution happens on `"close"`, not `"exit"`** - close only fires once stdout and stderr have
  finished draining into the log file, so every line the process wrote is guaranteed to already be
  there by the time a status is recorded.
- **A spawn `"error"` event - a missing binary, most commonly `ENOENT` - fails the job, never the
  server.** Without a handler on `child.on("error", ...)` an unhandled error would throw and take
  the whole process down; the runner instead writes `error: <message>` to the log and settles the
  job `"failed"`. `runner.test.ts` proves this by spawning a nonexistent binary and asserting every
  later test in the file still runs - reaching them at all is itself evidence the process survived.
- **A broken log stream fails the job the same way.** `out.on("error", ...)` (a full disk or a
  permissions problem, mid-job) kills the child best-effort and settles `"failed"` immediately,
  skipping `out.end()` since the stream that would carry it is already broken.
- **Kill escalates: SIGTERM first, SIGKILL after 5 seconds** (`KILL_ESCALATION_MS`) if the child
  has not exited by then - a child that ignores SIGTERM would otherwise wedge the runner forever.
  A timeout firing on a still-running job escalates through the exact same path.
  `createRunner`'s optional fourth parameter, `killEscalationMs`, exists purely as a test seam -
  every production call site relies on the default - so a test can shorten the grace period rather
  than wait out the real 5 seconds. `runner.test.ts` proves the escalation actually delivers
  SIGKILL, not just that `escalateKill` is called, against `fixture/hang-hard.mjs`, a child that
  installs a SIGTERM handler that ignores the signal and loops forever - `fake-job.mjs`'s own hang
  mode installs no handler, so Node's default SIGTERM action would end it before an escalation
  could ever be observed.
- **Per-kind timeouts** (`JOB_TIMEOUTS_MS` in `jobs.ts`): `plaud-sync` 5 minutes, `plaud-process`
  20 minutes, `aufgaben-import` 15 minutes, `controlling` 45 minutes, `vault-reindex` and
  `projekte-scan` 10 minutes each, `plaud-fetch` 5 minutes. A timeout on a spawned job escalates
  the kill; a timeout on an internal job cannot cut it short - the runner itself tracks no process
  for one - so it can only relabel the eventual outcome `"timeout"` once the function itself
  finishes. `plaud-fetch` is the one internal kind that does own a process the runner never sees:
  `withPlaud` (`plaud-mcp.ts`) spawns the MCP as its own child, over stdio, and ends the session
  itself after 120 seconds (`PLAUD_TIMEOUTS.sessionMs`) if nothing else has settled it by then - a
  hung fetch is cut short by that session timeout, well inside `plaud-fetch`'s own 5-minute ceiling,
  not by `runner.ts` sending anything.
- **`kill(id)` returns one of three outcomes** the route layer maps directly to HTTP: `"killed"` (a
  SIGTERM was sent, 200), `"not_running"` (the id is absent or already finished, 409 "not
  running"), `"internal"` (the record exists but has no child process the runner tracks - internal
  jobs cannot be cancelled through this endpoint, 409 "internal jobs cannot be cancelled"). The
  switch in `routes.ts` is on this string union, deliberately, not truthiness - `"not_running"` and
  `"internal"` are both non-empty strings and would otherwise read as success.
- **`failStaleRunning`** (`db.ts`), called once at boot in `index.ts` before any job can start,
  flips every row still `"running"` to `"failed"` with a null exit code - a server killed mid-job
  leaves its row stuck `"running"` forever otherwise, since nothing else ever calls `finishJob`
  for it.

## The log endpoint

`GET /api/eingang/jobs/:id` answers `{ job, log }`, where `log` is `tailLog`'s read of the job's
log file capped at the last **64 KB** (`LOG_TAIL_BYTES`) - enough to read comfortably, small enough
that a long or noisy job's log cannot grow the response without bound. A log file that does not
exist yet reads as an empty string rather than a 404 or a 500: `runner.start()` returns
synchronously once the job row is inserted, but the log file's `createWriteStream` open completes
asynchronously, so a client polling this route immediately after the 201 - exactly what the UI
does - can land in that window. `tailLog` catches only `ENOENT` for this; any other read failure
(a permissions error, a path that turns out to be a directory) still throws.

## The Plaud MCP

`plaud-mcp.ts` is Bench's own stdio client for `npx -y @plaud-ai/mcp@latest` - about two hundred
lines, no `@modelcontextprotocol/sdk` dependency, the same reasoning as running `gh` directly.
`withPlaud(command, fn, timeouts?)` spawns the command, performs the handshake, hands `fn` a
`call(tool, args)` closure, and kills the child once `fn` settles - **one process per listing or
per fetch**, never a kept-open connection.

- **The handshake** sends `initialize` (`protocolVersion: "2025-06-18"`, empty `capabilities`,
  `clientInfo: { name: "bench", version: "1.0.0" }`), waits for its reply, then sends
  `notifications/initialized` - a notification, carrying no id and expecting no reply - before
  handing `fn` its `call`. `call(tool, args)` sends `tools/call`, joins the result's text content
  blocks with `\n`, and throws a `PlaudError` when the result carries `isError: true`.
- **Four failure kinds** (`PlaudFailure`), typed so a route answers a `source` rather than a 500:
  `"off"` (`command === "off"` - `BENCH_PLAUD=off` or the sample world - thrown before anything is
  spawned), `"unauthenticated"` (the failing text matches `/401|not authenticated/i`), `"not_found"`
  (the text matches `/404|not found/i` - in practice this only ever fires from `findRecording`'s
  own client-side search, not from the MCP: the probe found the MCP itself answers an unknown id
  with a 500, not a 404, so that case classifies `"unreachable"` instead), and `"unreachable"` for
  everything else - a spawn `error`, a malformed JSON-RPC frame, a call exceeding its 30-second
  budget (`callMs`), the whole session exceeding 120 seconds (`sessionMs`), or the child exiting
  mid-session. `classifyFailure` is the one function deciding between the first two and the
  fallback; every other failure path constructs `"unreachable"` directly.
- **stderr is discarded** (`stdio: ["pipe", "pipe", "ignore"]`) - it carries the MCP's own pino
  JSON log, one line per tool call, nothing Bench reads.
- **`BENCH_PLAUD=off`** is the e2e/sample switch, the `BENCH_GH=off` twin: `index.ts` sets
  `plaudCommand` to the literal `"off"` when the env var is set or the sample world is active,
  `REAL_PLAUD_COMMAND` (`["npx", "-y", "@plaud-ai/mcp@latest"]`) otherwise, and prints
  `Plaud MCP: on | off` at boot either way.
- **The reply shapes, as the probe found them** (`.superpowers/sdd/PLAN-plaud-mcp/probe-report.md`,
  shapes only): `list_files` answers `{ type: "list", data: [...], page, page_size }`; Bench asks
  `page_size: 20` (the MCP's own floor is 10) and sets `nextPage = page + 1` only when `data` holds
  exactly 20 entries. Of an entry, `parseListFiles`/`toRecording` (`plaud-fetch.ts`) read `id`,
  `name` (blank becomes `"Ohne Titel"`), `start_at` (kept only when it matches
  `YYYY-MM-DDTHH:MM:SS`'s shape - it becomes a path segment in the fetched file's name, so an
  unexpected value is blanked rather than trusted) and `duration` (milliseconds). A transcript page
  (`block: "transaction"` or omitted) is `{ segments: [...], next_cursor }`, each segment carrying
  `start_time`/`end_time` (milliseconds) and `speaker`/`content`; Bench asks `limit: 500` and
  follows `next_cursor` until it is `null`. Three shapes mean "nothing here", not an error: a bare
  `[]` (untranscribed recording, any block), the `mark_memo` block's plain-text
  `Block "mark_memo" not available for this recording. ...` line for a transcribed recording
  without marks, and an empty `get_note` array - `jsonOf` returns `null` for the plain-text line,
  which the fetch logs verbatim (sliced to 120 characters) rather than as a mark count. `get_note`
  answers an array of entries; only the one with `data_type: "auto_sum_note"` is read, and only
  when its `data_content` is non-empty - the `high_light` entry is ignored, since highlights come
  from the `mark_memo` block instead.
- **The fetched file's name and text.** `fetchedFileName` picks
  `<start's day, or "ohne-datum">_<slugify(titel)>-transkript.md`, trying `-2`, `-3`, ... against
  whatever `taken` (a name already in `inbox/` or `archiv/`) reports. `slugify` lowercases, maps
  the four German umlauts/`ß` to their ASCII digraphs, replaces everything else with hyphens, trims
  the ends and caps the result at 60 characters, falling back to `"aufnahme"` if nothing is left.
  `renderFetchedFile` writes the frontmatter (`aufnahme`, `titel`, `datum`, `start`, `dauer`,
  `geholt`) and the three sections `## Transkript`, `## Markierungen`, `## KI-Notiz (Plaud)` -
  the latter two rendering the line `Keine.` when there are no marks or no note; `## Transkript`
  itself is never empty by the time this runs, since `assembleFetch` already refuses a recording
  with no segments before `renderFetchedFile` is ever called.

## Inbox reconciliation

`listInbox` (`inbox.ts`) lists every matching file directly inside each watch dir - no
recursion - filtered and reconciled, newest first by `mtime`:

- **Matched by name, by the watch dir's own name, or by extension.** `NAME_PATTERN`
  (`/transcript|transkript|besprechung/i`) tested against the file's own name, the same pattern
  tested against `path.basename` of the watch dir it sits directly in, or an audio extension
  (`.m4a`, `.mp3`, `.wav`) - a file matching none of the three is not inbox material at all and
  never appears. The dir-name rule is what lists a file sitting in, say,
  `~/Downloads/Besprechungs-Textfiles/`, even when the file's own name gives no hint.
- **Skipped: dotfiles and underscore-prefixed names.** `skipped` drops anything starting with `.`
  or `_` - the Plaud inbox's own `_HIER-...` marker file is exactly what the underscore rule
  exists for.
- **Status is reconciled in one fixed order: archive or a note's `quelle` beats an in-flight job
  beats `unverarbeitet`.** A file already in the Plaud archive, or named as the `quelle` of some
  note under `<plaudHome>/notizen`, is `notiz_vorhanden` even if a job also happens to be running
  against it - a job can be running for a file a previous run already turned into a note. Failing
  that, a file a running `plaud-process` job's own recorded `args.file` names is `in_arbeit`.
  Everything else is `unverarbeitet`.
- **The `quelle` scan is `server/src/shared/frontmatter.ts`'s line scanner**, not YAML: a note's
  own `titel` can carry a colon a YAML parser would reject; the module's docstring carries the
  reasoning.
- **The set of every note's `quelle` is built once per `listInbox` call**, in `noteQuellen`, not
  once per candidate file - this endpoint is polled, and re-reading every note for every inbox
  file would make the scan O(files × notes) instead of O(files + notes).
- **`inFlight` is composed in `routes.ts`, not `inbox.ts`.** `inFlightFiles` reads every running
  job's `args.file` back out of its stored `argsJson`; `listInbox` itself stays pure and takes the
  resulting set as plain data.

Beside that name-based reconciliation sits a second one, by Plaud recording id, for the
`Plaud-Aufnahmen` panel:

- **Both scans read `scanFrontmatter(text).fields`** - `quelleOf` for `quelle`, `localRecordingIds`
  for `aufnahme`.
- **`localRecordingIds(dirs)` reads every `.md` directly inside `inboxDir`, `archivDir` and
  `notizenDir` once**, collecting each folder's set of `aufnahme:` ids into a separate `Set` per
  folder (`LocalIds`) - the same once-per-listing-call shape `noteQuellen` already uses, not once
  per recording. `isLocal(id, local)` is true when any of the three sets carries it.
- **`plaudStatus(id, local, inFlight)` reconciles in one fixed order**: `notizen` beats `archiv`
  beats `inbox` beats a running `plaud-fetch` job whose own recorded `args.id` names it, beats
  `"neu"` - the id-based twin of `listInbox`'s own order, applied to recordings instead of watched
  files. `routes.ts`'s `inFlightIds` is `inFlightFiles`'s twin too, reading every running
  `plaud-fetch` job's `args.id` back out of its `argsJson`.
- **`localFolders` (`routes.ts`) has to agree with `jobs.ts`'s `planPlaudFetch`, the fence that
  refuses a fetch for an id already local.** In a configured world both read the same three real
  folders under `PLAUD_HOME`. In the sample world the panel composes the fixture inbox, no archiv
  and the aufgaben fixture notizen, while the fence sees only the fixture inbox - a mismatch that
  is harmless there because the sample fetch (`runPlaudFetch`'s sample branch) writes nothing.

## The launchd reader

`listScheduledRuns` (`schedule.ts`) is read-only over `~/Library/LaunchAgents` (or the fixture's
`launchagents/` under sample data) - Bench never writes, edits or installs a plist; the panel only
shows what a person already set up by hand.

- **A hand-rolled line scanner, not an XML parser.** `stringAfterKey` and `integerAfterKey` each
  find the line reading exactly `<key>${key}</key>` and read the very next line as
  `<string>...</string>` or `<integer>...</integer>` - correct and dependency-free for a plist's
  small, fixed shape, with no backtracking risk since the anchor is exact.
- **A label allowlist**, `ALLOWED_LABEL_SUBSTRINGS = ["shoesplease", "controlling"]` - a
  machine-local convention in the label an agent chooses when it installs the plist, not a policy
  Bench enforces; a plist whose label matches neither substring is dropped before it ever reaches
  the UI.
- **Only a single `StartCalendarInterval` dict is read.** `calendarIntervalLines` finds the first
  `<dict>` after the `StartCalendarInterval` key and the next `</dict>` after that - correct for
  the common one-schedule-per-job plist, but a launchd job scheduled with the **array** form
  (`<array><dict>...</dict><dict>...</dict></array>`, multiple run times in one plist) shows only
  its first entry. A known, accepted limit, not a bug to fix reflexively.
- **Sorted by label**, since `readdirSync`'s own order is filesystem-dependent and the panel needs
  a stable order across runs.
- **A missing or unreadable `launchAgentsDir` contributes nothing rather than throwing** - most
  machines have no scheduled Bench jobs at all, which is not an error.

## The API

Mounted at `/api/eingang` (`routes.ts`), eight routes:

| Route                 | Returns                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /inbox`          | `{ source, files }` - every watched file, reconciled                                                        |
| `GET /plaud?page=`    | `{ source, recordings, nextPage }` - the Plaud listing, reconciled by id; never a 500, see below            |
| `GET /projekte`       | `{ slugs }` - the vault's handoff slugs, for the `Projekt` select                                           |
| `GET /jobs`           | `{ jobs }` - the last 50 job rows, most recently started first                                              |
| `GET /jobs/:id`       | `{ job, log }` - one job and its log tail; 404 for an unknown id                                            |
| `POST /jobs`          | `{ kind, args? }` in, `{ job }` out (201); 400 a fenced kind or argument, 409 the same kind already running |
| `POST /jobs/:id/kill` | `{ job }` (200) killed; 404 unknown id; 409 not running, or internal                                        |
| `GET /schedule`       | `{ runs }` - the allowlisted launchd entries                                                                |

`GET /plaud` answers `source: "mcp" | "sample" | "off" | "unauthenticated" | "unreachable"` with an
always-200 `{ recordings: [], nextPage: null }` for every non-`mcp` source - a Plaud Bench cannot
reach never breaks the page. Under sample data, page 1 answers the bundled
`fixture/plaud-aufnahmen.json` (itself exactly a `list_files` reply, so the sample world runs
through the same parser as the real one) and every later page answers empty. In a configured
world, a `PlaudError` thrown out of `withPlaud` is caught here specifically - the same async-handler
shape `projekteRouter`'s `POST /scan` uses, where Express 5 forwards any other rejection to its
error middleware and still 500s.

`POST /jobs` builds the child's environment as
`{ ...process.env, PLAUD_HOME: paths.plaudHome ?? undefined }` - the one variable a spawned skill
script or `claude -p` invocation needs beyond what the parent process already carries. The `?? undefined`
only matters for a kind that never reads `plaudHome` in the first place - `planJob` already refused
any of the four plaud-facing kinds with a null `plaudHome` before a plan reaches this line.

## The web app

`App.tsx` (served at `/eingang`, `main.tsx` renders it directly with no router) fetches the inbox,
the jobs list, the schedule, the Plaud listing (`GET /plaud?page=1`) and the vault's handoff slugs
(`GET /projekte`) on load, and renders, in order: the inbox list, `AufnahmenPanel`, the jobs panel,
an optional log view for whichever job's row was clicked, and the schedule panel.

- **`AufnahmenPanel`** (`components/AufnahmenPanel.tsx`; landmark
  `<section aria-labelledby="eingang-aufnahmen">` /
  `<h2 id="eingang-aufnahmen">Plaud-Aufnahmen</h2>`) sits between the inbox list and the jobs
  panel: one row per recording (`titel`, `recordingMetaText` for `start`/`dauer`, and a status
  chip - `Neu`, `Wird geholt`, `Im Eingang`, `Im Archiv`, `Notiz vorhanden`) and a `Holen` button,
  enabled only while `status === "neu"`, disabled otherwise with the status label as its `title`,
  `aria-label="Holen: <titel>"` either way. A non-`mcp` source renders one line in place of the
  rows instead: `Beispieldaten` (`sample`), `Plaud ist nicht konfiguriert.` (`off`),
  `Nicht angemeldet - im Terminal /plaud starten.` (`unauthenticated`), `Plaud nicht erreichbar.`
  (`unreachable`); an empty `mcp` list reads `Keine Aufnahmen.`. `Neu laden` always shows;
  `Mehr laden` only while `nextPage` is not `null`.
- **The listing loads with the page, after `Neu laden`, and again right after a `plaud-fetch`
  start** - `runJob` (`App.tsx`) only adds the Plaud refetch to its
  `Promise.all` when `kind === "plaud-fetch"`, so starting any other kind does not pay for a
  request nothing else here reacts to. The listing is otherwise **never polled**: a fetch that
  finishes in the background only shows its recording as `Im Eingang` on the next `Neu laden` or
  page load, the same way the jobs table only reflects a finished job on the next action.
- **`isProcessable`** (`types.ts`) gates the inbox row's `Verarbeiten` button on three conditions
  at once: `kind === "text"`, `status === "unverarbeitet"`, and the file's own directory basename
  is literally `"inbox"`. The third condition is why a matched file sitting in a second watch
  folder, or one already reconciled into the archive world, still gets a disabled button with the
  title `"Erst einsammeln"` even while `unverarbeitet` - `planPlaudProcess`'s fence only ever
  resolves a bare filename against `<plaudHome>/inbox`, so a working button has to mean the file is
  already there.
- **A processable inbox row also gets a `<select aria-label="Projekt: <file>">`**
  (`components/InboxList.tsx`'s `ProjektSelect`), offering `Kein Projekt` plus every slug
  `GET /api/eingang/projekte` returns. `handleProcess` (`App.tsx`) passes the chosen slug, or
  `null` for `Kein Projekt`, as `plaud-process`'s optional `args.projekt` - the same slug
  `planPlaudProcess`'s fence checks against the vault's handoffs (`## The fence` above) before it
  ever reaches the prompt. The button's own log label becomes `Verarbeiten: <file> (<slug>)` with a
  project chosen, `Verarbeiten: <file>` without (`jobKindLabel`, `format.ts`).
- **Audio files show `"Nur Ablage"`** instead of a button - Eingang lists audio, it never offers to
  process it; nothing in `jobs.ts` has a kind that takes an audio file.
- **`JobsPanel`'s five start buttons** cover every kind except `plaud-process`, `aufgaben-import`
  and `plaud-fetch` - `plaud-process` and `plaud-fetch` only start from a specific inbox or
  recording row (`handleProcess`/`handleFetch` in `App.tsx`), and `aufgaben-import` is not wired
  into this UI at all yet; `jobKindLabel`'s `aufgaben-import` entry exists for a job started outside
  this panel to still render correctly.
- **`LogView` polls `GET /jobs/:id` every 2 seconds while the job is `running`**, and stops the
  moment a poll's own response reports a non-running status - a human-watchable tail, not a
  stream. A job already finished when the panel opens polls exactly once. Escape or the
  `Schließen` button closes it.
- **The Jobs table has no periodic poll of its own.** `App.tsx` only refetches `/jobs` right after
  a start or a kill action; between those, a running job's row shows whatever the last refetch
  produced until the person triggers another action or reopens the page. (`LogView`'s own 2s poll
  is a separate, per-job mechanism scoped to whichever log panel is open.)
- **The Cockpit's Eingang panel** (`web/src/home/App.tsx`) is live: it counts files with
  `status === "unverarbeitet"` from the same `GET /api/eingang/inbox` reply (`unverarbeitetCount`
  in `web/src/home/types.ts`), shows `"Nichts Neues."` at zero or `"<n> unverarbeitet"` otherwise,
  and always links to `/eingang/` labelled `"Verarbeiten"`.

## Tests

**Unit** (`server/test/eingang/`) covers `locateEingang`'s sample/configured switch and the
`INBOX_WATCH`-without-`CONTROLLING_DIR` case, `planJob`'s whole fence one check at a time including
the `plaud-fetch` id and the `plaud-process` `projekt` cases (`jobs.test.ts`), the runner's
spawn/internal/broken-stream/kill/timeout paths against the real fake-job fixture
(`runner.test.ts`), the routes against an in-memory db and the sample fixture tree, including
`GET /plaud`'s and `GET /projekte`'s reply for every source (`routes.test.ts`), the inbox
reconciliation order by name and by id (`inbox.test.ts`), and the plist scanner against both the
bundled fixture plists and hand-written ones (`schedule.test.ts`).

`plaud-mcp.test.ts` runs the stdio client against `fixture/fake-plaud-mcp.mjs`: the handshake and a
`tools/call` round trip, an `isError` result classified by kind, a call that times out unanswered,
the session timeout firing ahead of a call's own timer, a pending call failing when the MCP exits
mid-session, a malformed (non-JSON) frame, a missing binary failing without throwing out of the
process, and `command: "off"` never spawning anything. `plaud-fetch.test.ts` covers the parsers
against the probed shapes (an untitled recording, a `start_at` that fails the shape check and gets
blanked), `fetchRecording` following `next_cursor` and logging each call, the naming/slugify/render
helpers including the `Keine.` fallbacks, `writeFetchedFile`'s `wx` refusal and its realpath refusal
on a symlinked `inbox/`, `runPlaudFetch` under sample data (logs the three calls, writes nothing)
and against the fake MCP (writes the file), and `assembleFetch` refusing a recording with no
transcript so nothing is written.

**End to end** (`e2e/eingang/`) runs against the built sample fixture: `inbox.spec.ts` asserts the
four fixture files' reconciled status, with both unprocessed text files' `Verarbeiten` buttons
enabled and the already-noted one disabled; `jobs.spec.ts` covers an internal job
(`vault-reindex`) reaching `Fertig` without a reload and its log showing the real reindex line, and
a spawned job (`plaud-sync`, over the fake runner) cancelled mid-run reaching `Abgebrochen` with its
log intact, followed by the double-start 409; `plaud.spec.ts` covers the sample listing's three
recordings and their three marks, `Holen` on the new one reaching `Fertig` with its log reading
`sample world: nothing written`, and `Verarbeiten` with a project chosen producing a job row whose
label carries the chosen slug.

## Things that will bite

- **A job that daemonizes escapes SIGTERM's reach.** The runner kills the direct child it spawned;
  a script that forks and detaches a grandchild before exiting leaves that grandchild running with
  nothing tracking it - `kill()` reports success because the child it knows about did receive the
  signal.
- **The log tail is a cap, not a stream.** `GET /jobs/:id` reads up to the last 64 KB fresh on
  every poll; a job that logs faster than the 2-second poll interval can lose lines to the cap
  before anyone reads them, and there is no way to fetch an earlier page of a long log once it has
  scrolled past.
- **The schedule reader only understands `StartCalendarInterval`.** A launchd job scheduled by
  `StartInterval` (every N seconds) or by a `WatchPaths`/socket trigger instead reads as a plist
  with `Label` but null day/hour/minute - technically correct (no calendar schedule to show), but
  easy to misread as "this job runs but Bench could not find when."
- **Audio is listed, never processed.** No job kind in the catalog takes an audio file as its
  target; an `.m4a` sitting in the inbox stays `unverarbeitet` forever unless something outside
  Bench moves or converts it.
- **`plaud-process` only reaches files already sitting in `<plaudHome>/inbox`.** A file elsewhere -
  a second watch folder, a file `plaud-sync` has not yet collected - fails `planPlaudProcess`'s
  existence check with 400, which is exactly what the disabled button with `"Erst einsammeln"` is
  warning about before the request is even sent.
- **A server restart mid-job leaves the orphan running until someone clicks Abbrechen.** `jobs`
  carries a nullable `pid` (`db.ts`), written once the child's `spawn()` returns; an internal job
  has no child and stores `null`. At boot, `reconcileRunning` (`index.ts`, replacing the old
  blanket `failStaleRunning`) classifies every `"running"` row rather than flipping all of them:
  `alive.ts`'s `isOurProcess` reads the pid's start time through `ps -o lstart=` and answers true
  only when it is alive **and** started inside a narrow window around the row's own `started_at` -
  bounded below by the one second `ps`'s whole-second rounding can lose and above by a few seconds
  of spawn latency, so a pid recycled to an unrelated process that merely started later is never
  mistaken for the job's own child. A row that survives that check stays `"running"`, untouched;
  everything else becomes `"failed"`, exactly as before. `isRunning(kind)` now also reads
  `runningJobs(db)` rather than only the in-memory map, so a live orphan still fences a second run
  of its kind after a restart. The jobs routes attach a `verwaist` boolean to every row
  (`withVerwaist`, computed as `"running"` and absent from the runner's own in-flight map, so it
  needs no column of its own) and the web Jobs panel marks it "Verwaist"; the kill button is the
  same one every other row has. Clicking it reaches `kill()`'s fallback path: absent from the
  in-flight map, it re-reads the row, re-verifies the pid with the same `isOurProcess` check right
  at the moment of the click - the boot reconciliation's verdict is stale by then - and only then
  sends SIGTERM, with the same `KILL_ESCALATION_MS` SIGKILL escalation the in-process path uses.
  **A boot-time sweep that signals the orphan automatically was proposed and rejected** (Change:
  verwaiste Jobs, SPEC decision 1): Bench OS principle 6 is that a job acts on click and never on
  its own schedule, and a restart is not a click. Do not add one back - an orphan that nobody kills
  keeps running, unmonitored, until the next restart's reconciliation finds it dead or a person
  clicks Abbrechen, and that is the intended behaviour, not a gap.
- **Nothing prunes `data/eingang-jobs/*.log` or the `jobs` table.** Every log file stays on disk
  and every row stays in the database forever; `GET /jobs` only ever _displays_ the last 50. An
  accepted limit on a personal machine, not a target for retention work until the folder's size
  becomes an actual problem.
- **The two listings of the notizen folder disagree on symlinks.** `listInbox`/`noteQuellen`
  (`inbox.ts`) filter on `entry.isFile()`, which is `false` for a symlink regardless of what it
  points to, so a symlinked note is silently excluded from both the inbox reconciliation and the
  `quelle` scan. Aufgaben's own `listPlaudNotes` (`server/src/aufgaben/plaud.ts`) lists the same
  folder with a plain `readdirSync` and no `Dirent` type check, so it **does** list a symlinked
  `.md` file - a symlinked basename `GET /api/aufgaben/plaud` already returned can be handed
  straight to `aufgaben-import`'s `POST /api/eingang/jobs`, and is only refused there by
  `resolvesInsideFolder`, not by anything in Eingang's own listing.
- **A hardlink passes `resolvesInsideFolder` unnoticed.** `realpathSync` only resolves symlinks, not
  hardlinks, so a hardlinked file inside `inbox/` or `notizen/` whose other name sits outside
  `plaudHome` looks like an ordinary file to this fence - out of scope by design, since placing a
  hardlink there already needs write access to the folder, the same access that already permits
  placing an ordinary file.
- **The check-then-act gap: TOCTOU.** `resolvesInsideFolder` checks, then `planJob` returns a plan
  that is acted on afterwards; a path component swapped for a symlink in the gap between the two
  escapes the fence. Dismissed on the same ground as the hardlink above - exploiting it needs the
  same write access to the folder that already permits placing an ordinary file there.
- **`npx -y @plaud-ai/mcp@latest` resolves `@latest` on every single spawn, and needs the network
  for it.** Every listing and every fetch is its own process (`withPlaud` per call), so `npx`
  re-checks the registry for the newest published version each time rather than reusing a resolved
  version across calls - offline or slow to resolve, that resolution step fails or stalls before
  the MCP itself has even started, ahead of `plaud-mcp.ts`'s own 30-second/120-second budgets.
- **The first spawn after a new version is published is slow.** `npx` has to download and extract
  the newer package into its cache the first time; the next listing or fetch after that runs
  measurably slower than every one after it, which can look like a hung call rather than a one-time
  cache fill.
- **`wx` is the last-resort guard, not the primary one.** `fetchedFileName` is what actually avoids
  a collision, by trying `-2`, `-3`, ... against names already in `inbox/` or `archiv/` before
  `writeFetchedFile` ever runs; the `wx` flag on the write itself only matters for a race between
  that name check and the write landing - it throws `EEXIST` rather than silently overwriting, it
  does not pick the numeric suffix.
- **A recording collected the old way carries no `aufnahme:` id.** `plaud-sync`'s hand exports, and
  any note or archived file processed before this change, have no `aufnahme:` frontmatter, so
  `localRecordingIds` never marks their id local - the same recording, later seen again in the MCP
  listing, shows `Neu` even though a note or transcript for it already exists under a different
  filename. Accepted by design, not guessed from a filename.
- **The listing is not polled.** A recording fetched, or a newly appeared one, only shows its
  updated mark on the next `Neu laden` or page load - see `## The web app` above.
- **An unknown id answers `500`, not `404`.** The probe found the MCP itself returns
  `isError: true` with `API error: 500 Internal Server Error` text for a `get_transcript`/`get_note`
  call naming an id no page carries; `classifyFailure` only tells `401` and an explicit `404` apart,
  so this classifies `"unreachable"`. `PlaudError`'s own `"not_found"` kind only ever comes from
  `findRecording`'s client-side search failing to meet the id within `FIND_PAGES` (10) pages of
  `list_files`.
- **`list_files`'s `page_size` has a floor of 10.** The MCP refuses anything below that
  (`"Input should be greater than or equal to 10"`); Bench always asks for the fixed `PAGE_SIZE`
  (20) and never varies it, so the floor is dormant rather than actively avoided - a future change
  lowering it below 10 would start failing every listing call.

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
- [aufgaben/IMPLEMENTATION.md](../aufgaben/IMPLEMENTATION.md) - the Plaud notes Eingang reconciles
  against; the frontmatter scan `quelleOf` uses is reasoned about in
  `server/src/shared/frontmatter.ts`'s docstring, not in this doc
