# Eingang

One page at `/eingang` over three things: the folders Bench watches for new material, the local
CLIs Bench can run against them, and the launchd entries that already run some of those CLIs on a
schedule. Backed by `data/eingang.sqlite`, which holds only the job log - one row per spawned or
in-process run, never the watched files or the source folders themselves.

- Backend: `server/src/eingang/` - `locate.ts` (finds the watch dirs, or falls back to the bundled
  fixture), `inbox.ts` (lists and reconciles watched files), `jobs.ts` (the fence: what job kinds
  exist, what arguments they take, what command each becomes), `runner.ts` (spawns or runs a job,
  streams its log, kills it), `db.ts` (the jobs table), `schedule.ts` (reads launchd plists),
  `routes.ts` (the six endpoints), `fixture/` (the sample inbox, controlling report and plists,
  plus `fake-job.mjs`, the stand-in child process under sample data and in tests).
- Frontend: `web/src/eingang/` - `App.tsx`, `components/` (`InboxList`, `JobsPanel`, `LogView`,
  `SchedulePanel`), `api.ts`, `format.ts`, `types.ts`, `styles.css`
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
  `server/src/eingang/fixture/`. `planJob`'s three plaud-facing kinds - `plaud-sync`,
  `plaud-process`, `aufgaben-import` - each refuse with 400 ("plaud is not configured") before any
  other check that would build a path from `plaudHome`, so a real watch folder can never end up
  paired with the sample fixture as the target of a real `claude -p` or `plaud-sync.sh` run.

## The fence

Every job Bench can run passes through `planJob` (`jobs.ts`) before anything is spawned, and every
check inside it runs **before any argv or cwd is built** - an unknown kind, a bad argument, or a
missing target file never reaches a command:

- **A closed catalog of six kinds** - `plaud-sync`, `plaud-process`, `aufgaben-import`,
  `controlling`, `vault-reindex`, `projekte-scan`. Anything else answers
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

## Real jobs, fixture jobs, internal jobs

`JobPlan` is one of two shapes. `{ kind: "spawn", argv, cwd }` is a child process; the runner
spawns `argv[0]` with the rest as arguments. `{ kind: "internal", name }` names
`"vault-reindex"` or `"projekte-scan"`, which run **in-process**, always for real, regardless of
sample or configured - there is no fixture stand-in for either, because both already have their
own bundled sample data to run against (the fixture vault, the fixture workshop) and running them
for real is cheap.

`server/src/eingang/` itself never imports from `server/src/vault/` or `server/src/projekte/` -
`RunnerInternals`' two functions are generic `(log) => Promise<void>` closures, and `index.ts`, the
composition root, is what actually wires them to `indexAll` (vault) and `scanProjects` (projekte)
when it builds the runner. This is different from Aufgaben and Projekte's own documented exception
to "one database per app" (see `PROJECT.md`'s Bench OS decisions): those two import
`server/src/vault/` directly inside their own route and db modules, where Eingang's own module
graph stays as isolated from its siblings as every other pair of apps.

The four remaining kinds spawn a real command only in the configured world - each script lives
under `<skillsDir>`, but runs with its cwd set to the one folder its own work belongs in, never to
`skillsDir` itself:

- `plaud-sync` runs `<skillsDir>/plaud/scripts/plaud-sync.sh` with cwd `<plaudHome>`.
- `plaud-process` runs `claude -p` with cwd `<plaudHome>`, a fixed prompt naming the target file
  under `<plaudHome>/inbox`, a `--max-turns` ceiling and an explicit `--allowedTools` list.
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
  `projekte-scan` 10 minutes each. A timeout on a spawned job escalates the kill; a timeout on an
  internal job cannot cut it short - there is no process to signal - so it can only relabel the
  eventual outcome `"timeout"` once the function itself finishes.
- **`kill(id)` returns one of three outcomes** the route layer maps directly to HTTP: `"killed"` (a
  SIGTERM was sent, 200), `"not_running"` (the id is absent or already finished, 409 "not
  running"), `"internal"` (the record exists but has no child process - internal jobs cannot be
  cancelled, 409 "internal jobs cannot be cancelled"). The switch in `routes.ts` is on this string
  union, deliberately, not truthiness - `"not_running"` and `"internal"` are both non-empty
  strings and would otherwise read as success.
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
- **The `quelle` scan is a deliberate small duplicate of Aufgaben's tolerant frontmatter reader**,
  not an import - `quelleOf` in `inbox.ts` scans each frontmatter line up to its first `": "`
  rather than parsing YAML, because a note's own `titel` can carry a colon a YAML parser would
  reject (see `server/src/aufgaben/plaud.ts`'s `splitFrontmatter` docstring for the shared
  reasoning). Eingang never imports from `server/src/aufgaben/`, the same per-app boundary every
  pair of apps follows.
- **The set of every note's `quelle` is built once per `listInbox` call**, in `noteQuellen`, not
  once per candidate file - this endpoint is polled, and re-reading every note for every inbox
  file would make the scan O(files × notes) instead of O(files + notes).
- **`inFlight` is composed in `routes.ts`, not `inbox.ts`.** `inFlightFiles` reads every running
  job's `args.file` back out of its stored `argsJson`; `listInbox` itself stays pure and takes the
  resulting set as plain data.

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

Mounted at `/api/eingang` (`routes.ts`), six routes:

| Route                 | Returns                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /inbox`          | `{ source, files }` - every watched file, reconciled                                                        |
| `GET /jobs`           | `{ jobs }` - the last 50 job rows, most recently started first                                              |
| `GET /jobs/:id`       | `{ job, log }` - one job and its log tail; 404 for an unknown id                                            |
| `POST /jobs`          | `{ kind, args? }` in, `{ job }` out (201); 400 a fenced kind or argument, 409 the same kind already running |
| `POST /jobs/:id/kill` | `{ job }` (200) killed; 404 unknown id; 409 not running, or internal                                        |
| `GET /schedule`       | `{ runs }` - the allowlisted launchd entries                                                                |

`POST /jobs` builds the child's environment as
`{ ...process.env, PLAUD_HOME: paths.plaudHome ?? undefined }` - the one variable a spawned skill
script or `claude -p` invocation needs beyond what the parent process already carries. The `?? undefined`
only matters for a kind that never reads `plaudHome` in the first place - `planJob` already refused
any of the three plaud-facing kinds with a null `plaudHome` before a plan reaches this line.

## The web app

`App.tsx` (served at `/eingang`, `main.tsx` renders it directly with no router) fetches the inbox,
the jobs list and the schedule on load, and renders, in order: the inbox list, the jobs panel, an
optional log view for whichever job's row was clicked, and the schedule panel.

- **`isProcessable`** (`types.ts`) gates the inbox row's `Verarbeiten` button on three conditions
  at once: `kind === "text"`, `status === "unverarbeitet"`, and the file's own directory basename
  is literally `"inbox"`. The third condition is why a matched file sitting in a second watch
  folder, or one already reconciled into the archive world, still gets a disabled button with the
  title `"Erst einsammeln"` even while `unverarbeitet` - `planPlaudProcess`'s fence only ever
  resolves a bare filename against `<plaudHome>/inbox`, so a working button has to mean the file is
  already there.
- **Audio files show `"Nur Ablage"`** instead of a button - Eingang lists audio, it never offers to
  process it; nothing in `jobs.ts` has a kind that takes an audio file.
- **`JobsPanel`'s five start buttons** cover every kind except `plaud-process` and
  `aufgaben-import`, which only start from a specific inbox row (`handleProcess` in `App.tsx`) or,
  for `aufgaben-import`, are not wired into this UI at all yet - `jobKindLabel`'s
  `aufgaben-import` entry exists for a job started outside this panel to still render correctly.
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
`INBOX_WATCH`-without-`CONTROLLING_DIR` case, `planJob`'s whole fence one check at a time, the
runner's spawn/internal/broken-stream/kill/timeout paths against the real fake-job fixture
(`runner.test.ts`), the routes against an in-memory db and the sample fixture tree
(`routes.test.ts`), the inbox reconciliation order (`inbox.test.ts`), and the plist scanner against
both the bundled fixture plists and hand-written ones (`schedule.test.ts`).

**End to end** (`e2e/eingang/`) runs against the built sample fixture: `inbox.spec.ts` asserts the
three fixture files' reconciled status and that only the unprocessed text file's button is
enabled; `jobs.spec.ts` covers an internal job (`vault-reindex`) reaching `Fertig` without a
reload and its log showing the real reindex line, and a spawned job (`plaud-sync`, over the fake
runner) cancelled mid-run reaching `Abgebrochen` with its log intact, followed by the double-start 409.

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
- **A server restart mid-job orphans the spawned process.** `failStaleRunning` flips the row to
  `"failed"` at boot, but nothing sends the still-running child a signal - it keeps going,
  unmonitored, while `isRunning`'s in-memory map comes back empty on every boot. The same kind,
  even naming the same file, can then be started again beside the orphan. Possible later
  hardening: record the child's pid on the job row so a boot-time sweep can send it a best-effort
  SIGTERM before the new run starts.
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

## Related documents

- [REQUIREMENTS.md](./REQUIREMENTS.md) - the original brief, kept for intent
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
- [aufgaben/IMPLEMENTATION.md](../aufgaben/IMPLEMENTATION.md) - the Plaud notes Eingang reconciles
  against; the frontmatter scan `quelleOf` duplicates is reasoned about in
  `server/src/aufgaben/plaud.ts`'s `splitFrontmatter` docstring, not in this doc
