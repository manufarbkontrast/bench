# Plan: verwaiste Jobs

Implements [SPEC.md](./SPEC.md). Seven tasks, each one testable on its own, working from the data
layer outwards as [PROCESS.md](../../PROCESS.md) asks.

## Decisions taken while planning

These refine the SPEC against what the code actually does. Each was verified in the source before
being written here.

1. **The pid is set after insert, not during it.** `runner.ts:268` inserts the row with
   `logPath: ""` because the log file is named after the row's own id, then corrects it through
   `setLogPath` - a two-line closure holding its own `UPDATE`. The pid has the same shape: it does
   not exist until `spawn` returns at `runner.ts:176`. So `insertJob`'s signature does **not**
   change; a `setPid(id, pid)` closure beside `setLogPath` does the work.

2. **"Verwaist" is computed on the server, not guessed on the web.** The SPEC said Eingang marks a
   row "with no live log stream", which is a proxy. The server knows exactly: a row whose status is
   `running` and whose id is absent from the runner's in-flight map is an orphan, because only this
   process's own `start` ever puts an id in that map. The runner exposes that as a predicate and
   the jobs routes attach a `verwaist` boolean to each row.

3. **The kind fence keeps `runner.isRunning` as its name.** Rather than moving the check into
   `routes.ts`, `isRunning(kind)` itself learns to consult the database. Every caller then gets the
   restart-proof answer, and `routes.ts:293` is untouched. This also keeps the runner the one place
   that knows what "running" means.

4. **`reconcileRunning` takes the liveness check as a parameter.** `failStaleRunning(db)` becomes
   `reconcileRunning(db, isOurProcess)`, where the second argument is `(pid, startedAt) => boolean`.
   Tests pass a fake; `index.ts:104` passes the real one. This is the same shape as `toggleTask`'s
   injected `today` - testable without faking the machine.

5. **No behaviour change for internal jobs.** They have no child and store `pid = null`, so they
   reconcile to `failed` exactly as today. Only spawned jobs can be verwaist.

## Task 0 - the `pid` column

**Files:** `server/src/eingang/db.ts`, `server/test/eingang/db.test.ts`

Add a nullable `pid INTEGER` to `jobs`, with the house migration pattern used in
`server/src/crm/db.ts` and `server/src/vault/db.ts`: read `PRAGMA table_info(jobs)`, add the column
when absent, no backfill. `JobRow` and `JobDbRow` gain `pid: number | null`, and `toJobRow` maps it.

Do **not** touch `insertJob`'s signature (decision 1) - a fresh row's pid is null until the runner
sets it.

**Success:** a database created before this change gains the column on open and keeps its rows; a
fresh one has it from `CREATE TABLE`; `insertJob` still takes the same four fields and yields
`pid: null`. RED first: a test asserting `pid` is null on a fresh row fails to compile against the
current `JobRow`.

## Task 1 - is that pid still our process?

**Files:** `server/src/eingang/alive.ts` (new), `server/test/eingang/alive.test.ts` (new)

One exported function: given a pid and the job's `startedAt`, answer whether a live process with
that pid started inside a narrow window around it. Read the start time with
`ps -o lstart= -p <pid>`; a non-zero exit, empty output, an unparsable date, or a start outside the
window all answer `false`.

**The window is bounded on both sides.** Below by one second, because `ps` reports whole seconds
while `startedAt` is milliseconds, so a legitimate child truncates down into a second that reads
earlier than its own job. Above by a few seconds, because the runner records `startedAt` and
spawns in the same tick - and because a recycled pid names a process that started _later_ than the
job, which a lower bound alone accepts. The upper bound is the one that carries SPEC decision 4.

**Force the C locale.** `ps -o lstart=` renders weekday and month through `LC_TIME`, and on a
machine set to `de_DE` it prints `Mo. 7 Sep. 22:15:08 2026`, which `Date.parse` rejects for most
months. Set `LC_ALL=C` on the call.

**Success:** true for the test process's own pid against a `startedAt` derived from its real start;
false for a pid that cannot exist, for a live pid against a `startedAt` far in the past, for a pid
recycled to a process that started after the job, and when the `ps` runner throws. The `ps` call is
injected so every case is a unit test, with one test using the real `ps` against `process.pid` so
the parsing is proven against real output rather than a fixture only.

## Task 2 - reconcile instead of flip

**Files:** `server/src/eingang/db.ts`, `server/src/index.ts`, `server/test/eingang/db.test.ts`

Replace `failStaleRunning(db)` with `reconcileRunning(db, isOurProcess)` (decision 4). For each
`running` row: alive stays `running` and untouched; anything else becomes `failed` with a null exit
code, which is today's behaviour. Update the docstring, and the comment at `server/src/index.ts:102`
that explains the call.

**Success:** the existing `db.test.ts:127` case still passes once it supplies a check that answers
false for everything - proving the old behaviour is the default rather than lost. A second case
with a check answering true for one pid leaves that row `running` and flips the rest.

## Task 3 - record the pid

**Files:** `server/src/eingang/runner.ts`, `server/test/eingang/runner.test.ts`

A `setPid(id, pid)` closure beside `setLogPath`, called in `runSpawn` right where `record.child` is
assigned (`runner.ts:181`). `child.pid` is `undefined` when the spawn itself fails, so write it
only when it is a number.

**Success:** after a spawned job starts, its row carries the child's real pid; an internal job's row
carries null; a spawn that fails immediately does not write a pid and still reaches `failed`.

## Task 4 - kill an orphan

**Files:** `server/src/eingang/runner.ts`, `server/test/eingang/runner.test.ts`

`kill(id)` currently returns `"not_running"` the moment the in-flight map has no record. That is the
orphan case. Before answering, read the row: if it is `running` with a pid that `alive.ts` still
confirms, send SIGTERM, schedule the SIGKILL escalation after `killEscalationMs`, mark the row
`killed`, and return `"killed"`. Verification runs immediately before the signal, not from the boot
reconciliation, so a pid that died in between is never signalled.

**Success:** a `running` row with a live verified pid is signalled and reaches `killed`; a
`running` row whose pid fails verification answers `not_running` and sends no signal; a finished row
still answers `not_running`; the in-memory path is unchanged.

## Task 5 - the fence, and saying "verwaist"

**Files:** `server/src/eingang/runner.ts`, `server/src/eingang/routes.ts`,
`server/test/eingang/routes.test.ts`

`isRunning(kind)` consults the database's `running` rows as well as the map (decision 3), so a live
orphan blocks a second run of its kind - `routes.ts:293` already answers 409 `"already running"`.

For decision 2, the runner exposes whether an id is in its own map, and the jobs routes attach
`verwaist` to each row they return.

**Success:** with a reconciled live orphan of kind `plaud-sync` in the database and an empty map,
`POST /jobs` for `plaud-sync` answers 409; the same request succeeds once that row is finished.
`GET /jobs` marks the orphan `verwaist: true` and a job this process started `false`.

## Task 6 - the web, the docs, the suite

**Files:** `web/src/eingang/types.ts`, the jobs panel and its test, `docs/eingang/IMPLEMENTATION.md`,
`e2e/eingang/jobs.spec.ts`

`JobRow` gains `verwaist: boolean`. The jobs panel marks such a row - German label, the app's own
styles, no new colour. The kill button is the one already there.

Rewrite the IMPLEMENTATION.md bullet at :472 that currently describes the defect and proposes the
boot-time SIGTERM, so it describes what the code now does and records why the automatic signal was
rejected (SPEC decision 1). An e2e case covers a `verwaist` row rendering with its kill button, using
a row seeded directly into the worker's database rather than a real restart.

**Success:** `npm run check` and `npm run e2e` green; the docs no longer propose a change that has
been decided against.

## Overall success criteria

The SPEC's six, verified as a whole at the end:

1. Real measurement on this machine: start a long spawned job, kill the server, restart it, and see
   the row still `running`, marked verwaist, with the process alive in `ps`.
2. In that state a second run of the kind is refused.
3. The kill button terminates the real process and the row reaches `killed`.
4. A job whose process died while the server was down reconciles to `failed`.
5. A pid outside the window is never signalled, in both directions - a process older than the job,
   and a pid recycled to one that started after it.
6. `npm run check` and `npm run e2e` green, with both thresholds held in both workspaces. The
   `branches: 80` half arrived from the `aufraeumen` branch (PR #7), which merged first; `main`
   was then merged into this branch and the gate re-run against the combination, so the figure
   this change is measured against is the one CI will use.

Browser checks run with `BENCH_DOTENV=off DATA_DIR=<scratch>`, per PROCESS.md, except the
measurement in criterion 1, which needs the real server and touches only Eingang's own job rows.
