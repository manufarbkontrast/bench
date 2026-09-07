# Change: verwaiste Jobs

A server restart while a spawned job is running leaves that child process alive and unmonitored,
and lets the same job be started again beside it. This closes both, without Bench ever signalling
a process on its own.

## Goal

After a restart, Eingang tells the truth about what is still running on the machine, and the job
fence refuses a second run of a kind whose first run is still alive. Killing an orphan stays a
click, as every other job action is.

## The defect

Recorded in [eingang/IMPLEMENTATION.md](../../eingang/IMPLEMENTATION.md) and left out of Phase 6
deliberately. Today:

- `failStaleRunning` (`db.ts`) flips every `running` row to `failed` at boot. The row now says
  `failed` while the process is still running - the database is wrong, not merely stale.
- The runner's `inFlight` map is in-memory, so it comes back empty on every boot. Nothing knows
  the child exists, nothing can signal it, and nothing displays it.
- `routes.ts:293` fences a new job with `runner.isRunning(kind)`, which reads that empty map. The
  same kind, even naming the same file, starts again beside the orphan.
- `routes.ts:312` kills through the same map, so an orphan has no kill path at all.

Two guards in the same file already avoid this: `inFlightFiles` and `inFlightIds` read
`runningJobs(db)`, the database, and therefore survive a restart. This change makes the kind fence
and the kill path consistent with the two guards beside them.

## Decisions settled at design approval

1. **Bench never signals a process on its own.** No boot-time sweep sends SIGTERM. An orphan that
   is still alive is displayed, and the person clicks the kill button Eingang already has. This
   follows SPEC principle 6 of Bench OS: a job acts on click, never on its own schedule. It
   deliberately departs from the "best-effort SIGTERM at boot" wording in
   eingang/IMPLEMENTATION.md, which was written before that principle was weighed against it.

2. **`status` gains no new value.** A verified-alive orphan is genuinely running, so its row stays
   `running`. This is not only simpler - the existing `CHECK (status IN (...))` constraint was
   written into `CREATE TABLE IF NOT EXISTS`, so a database created before this change keeps the
   old constraint and would reject a new value outright.

3. **`failStaleRunning` becomes a reconciliation, not a blanket flip.** At boot, each `running`
   row is classified: the process is still ours and alive, so the row stays `running`; or it is
   gone, so the row becomes `failed` exactly as today. The function is renamed to say so.

4. **A pid alone is not proof.** A pid recorded hours ago may belong to an unrelated process. A
   row counts as alive only when the process exists **and** its start time falls inside a narrow
   window around the job's `started_at`, read through `ps`. Anything else is treated as gone. A
   false "gone" costs an unmonitored process, which is today's behaviour; a false "alive" would
   let a stranger's process be killed by a later click, which is a new harm and must not be
   possible.

   **The window is bounded on both sides, and the upper bound is the one that does the work.** An
   earlier draft of this decision said only "not earlier than `started_at`", which is wrong: a
   recycled pid names a process that started _later_ than the job, so that rule accepts exactly
   the case it was written to reject. The runner records `started_at` and spawns synchronously in
   the same tick, so a real child starts within milliseconds of it - which makes a tight window
   both safe and cheap.

5. **The kind fence reads the database.** `routes.ts:293` consults the reconciled `running` rows
   rather than the in-memory map, so a live orphan blocks a second run of its kind. The refusal is
   the same shape as the existing ones.

6. **The kill path falls back to the pid.** When the in-memory map has no record for a `running`
   row - the orphan case - kill signals the recorded pid, re-running the same verification from
   decision 4 immediately before signalling. SIGTERM, then SIGKILL after the existing
   `KILL_ESCALATION_MS` grace, matching the in-process path.

## Server

### `server/src/eingang/db.ts`

- A nullable `pid` column on `jobs`, added with the house migration pattern (`PRAGMA table_info`,
  `ALTER TABLE`, no backfill - rows written before this change have no pid and reconcile as gone).
- `insertJob` records the pid for spawned jobs; internal jobs have no child and store `null`.
- `failStaleRunning` becomes `reconcileRunning(db, isAlive)`, taking the liveness check as an
  argument so it is testable without real processes.

### `server/src/eingang/` (new module)

The `ps`-based check from decision 4, on its own so it can be faked in tests: given a pid and the
job's `started_at`, answer whether that process is ours and alive.

### `server/src/eingang/runner.ts`

`kill` gains the pid fallback from decision 6.

### `server/src/eingang/routes.ts`

The kind fence at :293 reads the database.

## Web

Eingang marks a `running` row with no live log stream as verwaist, so the person can tell an
orphan from a job this server started. The kill button is the one already there.

## Success criteria

1. A job spawned, the server restarted, and the process still alive: the row still reads
   `running`, Eingang shows it as verwaist, and the process is still there.
2. In that state, starting the same kind is refused, with the refusal naming the running job.
3. Clicking kill on the orphan terminates the real process, and the row reaches `killed`.
4. A job whose process died while the server was down reconciles to `failed`, as today.
5. A pid belonging to a process older than the job is treated as gone and never signalled.
6. `npm run check` and `npm run e2e` green; the new modules covered by unit tests that fake both
   the liveness check and the clock.

## Out of scope

- Pruning `data/eingang-jobs/*.log` or the `jobs` table. Documented as an accepted limit.
- Any automatic signalling, on boot or otherwise (decision 1).
- Windows. The `ps` check is written for this machine; on a platform without it the check answers
  "gone", which degrades to today's behaviour rather than misfiring.
