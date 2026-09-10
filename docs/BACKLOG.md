# Backlog - what is left, and what deliberately is not

Written 2026-09-10, when the queue emptied: Bench OS, Projektstand, Plaud-MCP, the review
follow-ups, the app-boundary lint rule, the cleanup round and the orphaned-jobs change are all on
`main`, and no change is planned.

Everything below was already recorded somewhere - in an app doc, in [CONTROLS.md](./CONTROLS.md),
in [e2e/EXPLORATORY.md](../e2e/EXPLORATORY.md). This file is the one place that says which of it is
work and which is a decision already taken, so the next session does not re-derive that.

**Read the tiers as advice, not as a queue.** Only tier 1 is a defect. Tier 4 exists so nobody
"fixes" it.

## Tier 1 - the one real defect

**`indexNote`'s `readFileSync` in the vault watcher is unwrapped.** A note deleted or made
unreadable between chokidar's event and the read takes the whole process down. Phase 6 Task 3
closed the _parse_ half of this class - `splitNote` catches malformed frontmatter - and left this
half explicitly for its own reviewed fix rather than folding it in
([EXPLORATORY.md](../e2e/EXPLORATORY.md), Vault section).

Narrow in practice: `awaitWriteFinish` and the dot-file rule already cover the common editor
temp-file case. But it is a crash, and it is the only one left.

Small enough to skip SPEC/PLAN: a branch, the wrap, a test that deletes a note between the event
and the read, the gate. Worth doing.

## Tier 2 - gated on something outside this repo

Do nothing until the condition fires. Both are recorded with their reasoning in
[PROJECT.md](./PROJECT.md) and [CONTROLS.md](./CONTROLS.md); this is only the trigger.

| What                               | Trigger                                                                                                                                                                | Cost of waiting                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| TypeScript pinned to exactly 6.0.3 | typescript-eslint supports the native Go compiler, expected in TS 7.1 ([typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)) | ~3 seconds per typecheck, roughly 7x slower than 7.0.2 |
| better-sqlite3 held at 12          | npm carries `gypfile` through the lockfile, or upstream stops shipping `binding.gyp` in the tarball                                                                    | one deprecation warning on `npm ci`                    |

Checking either takes a minute. Acting on either is a coordinated change - read the reasoning
first, because both pins look arbitrary and are not.

## Tier 3 - quality, no deadline

Pick from this only when there is a reason to, not to tidy.

- **`web/src/zahlen` sits at 62.5% statements**, the one real outlier; `web/src/eingang` 76.3%,
  `web/src/kontext` 77.4%, `web/src/rolodex/pages` 77.7%, `web/src/home` 78.3%,
  `web/src/aufgaben` 79.4%. All above the 80% _workspace_ threshold in aggregate, so none of this
  is failing - it is where a regression would land first. Run `npm run coverage` for current
  figures rather than trusting these.
- **`server/src/crm/seed.ts` is the largest uncovered file left.** The precedent is
  `server/test/rolodex/seed.test.ts`, which asserts on the seeded database rather than excluding
  the file - see CONTROLS.md for why that was worth more than an exclusion.
- **Duplication is 4.46%, 165 clones.** Advisory, deliberately outside `npm run check`. One is a
  real, named duplicate rather than test noise: `web/src/zahlen/format.ts`'s `breakEvenText` has a
  copy that the file's own comment points at.
- **launchd's array form of `StartCalendarInterval` shows only its first entry**
  ([eingang/IMPLEMENTATION.md](./eingang/IMPLEMENTATION.md)). Correct for the common
  one-schedule-per-job plist. Fix it when a real plist in `~/Library/LaunchAgents` uses the array
  form, not before.

## Tier 4 - decided, not pending

These read like open items and are not. Each was weighed and settled; changing one is a
project-level decision, not a cleanup.

- **Nothing prunes `data/eingang-jobs/*.log` or the `jobs` table.** An accepted limit on a personal
  machine. `GET /jobs` only ever displays the last 50.
- **`isOurProcess` answers `false` both when `ps` reports the pid gone and when `ps` cannot run at
  all.** Named at the `catch` in `server/src/eingang/alive.ts` with its cost: a machine briefly out
  of fork slots could open the job fence while a process is alive. One boolean stays the right
  shape - the signalling path is safe either way, and the cost is duplicated work rather than a
  stranger's process.
- **Bench never signals a process on its own**, at boot or otherwise. The boot-time SIGTERM sweep
  that eingang/IMPLEMENTATION.md used to propose was considered and rejected against Bench OS
  principle 6. Do not add it back.
- **Rolodex does not compute recurrence**, and no spec demonstrates that by omission.
- **`docs/changes/internationalization/SPEC.md` is inherited upstream course material**, marked
  out of date at the top rather than deleted, because `README.md` section 3.2 points at it as the
  worked example for planning a change.

## Tier 5 - hygiene, whenever

- **Nine local branches** (`bench-os-phase-0` through `-6`, `plaud-mcp`, `projektstand`) are all
  merged into `main` and purely local. `git branch -d` refuses anything unmerged, so deleting them
  is safe. Left standing on purpose so far.
- **Two handoffs carry no `repos:`** - `shoesplease-owala` and `shoesplease-adventskalender` name
  no working folder of their own, only the shared Shoes_Please_Studio session directory. The
  `/handoff` skill says a project without a repository leaves the key off, so this is correct
  rather than missing.
- **Three `repos:` entries name folders Projekte cannot scan** (`pos-tag-backfill`,
  `machupicyou-sicherung`, `AI Machupicyou`). They are not git checkouts, so they surface as
  `missingRepos` - the same state `aend`'s four worktrees have always had. A plain folder reaches
  Projekte through a note with `path:` frontmatter (`couple.ts`), a different mechanism; use that
  if they should appear.
- **`server/test/vault/watch.test.ts` can still be starved by CPU load from outside its own run.**
  Its own project is sequenced and carries a single scoped `retry: 1` for exactly this. A second
  consecutive failure is a real signal, not another retry - see [PROCESS.md](./PROCESS.md), which
  names the probable outside source (a manually started Bench server holding a second chokidar
  watcher on the same vault).

## Related documents

- [PROJECT.md](./PROJECT.md) - purpose, layout, architectural decisions
- [PROCESS.md](./PROCESS.md) - how to implement a change
- [CONTROLS.md](./CONTROLS.md) - the checks, and the reasoning behind every pin in tier 2
- [e2e/EXPLORATORY.md](../e2e/EXPLORATORY.md) - what the suite deliberately does not cover
