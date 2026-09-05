> The original brief for Eingang, kept for intent and scope: the Eingang row of
> [changes/bench-os/SPEC.md](../changes/bench-os/SPEC.md) plus
> [changes/bench-os/PLAN.md](../changes/bench-os/PLAN.md)'s Phase 4 section. Complete history, not
> outstanding work. For how Eingang is actually built, read
> [IMPLEMENTATION.md](./IMPLEMENTATION.md).

# Eingang — Requirements

## Summary

Eingang is what arrived and is not yet processed: watched folders reconciled against the Plaud
archive, and a way to start the existing local skills - Plaud processing, task import, controlling
runs - against them by clicking a button, with a live log and a kill switch. It also shows the
launchd entries already running some of those same skills on a schedule, read-only.

## Sources

- **`INBOX_WATCH`** (`.env`) - colon-separated folders Bench watches for new material. Without a
  usable one, Bench falls back to a bundled sample inbox, controlling report and pair of launchd
  plists, all from one coherent fixture tree.
- **`PLAUD_HOME/notizen` and `PLAUD_HOME/archiv`** - read-only, the same processed-notes folder
  Aufgaben already reads, used here only to decide whether a watched file already has a note.
- **`CONTROLLING_DIR`** (`.env`) - where controlling runs write their reports. Independent of
  `INBOX_WATCH`: a configured watch folder with no configured controlling folder is still real
  data, not sample data: the controlling job kind is simply unavailable (400) rather than run
  against the fixture.
- **`~/Library/LaunchAgents`** - read-only, filtered to an allowlisted label substring.
- **`data/eingang.sqlite`** - Eingang's own database, holding only the job log: one row per
  spawned or in-process run, with its status, timing, exit code and log path. Deliberately not
  part of the rebuildable vault index.

## The write fence

Bench runs a job only when a person clicks a button for it, never on its own schedule (no
scheduling inside Bench - launchd already does that, outside Bench, and Eingang only displays
it). Every job passes through one fence before anything is spawned:

1. **Only a fixed catalog of job kinds exists** - Plaud sync, Plaud process one file, Aufgaben
   import one Plaud note, a controlling run in one of two modes, a vault reindex, a Projekte scan.
2. **A file argument must name a bare file already present** in the one folder that kind is
   allowed to touch - never a path, never a file outside that folder.
3. **A job cannot write outside the three target folders**: the Plaud home, the vault, the
   controlling folder - each spawned command's working directory and prompt are built from
   exactly the path the fence already validated, nothing supplied by the caller.
4. **Every check runs before any command is built** - a rejected request never reaches a shell.

## The product

- **A list of watched files**, reconciled against the Plaud archive and its notes so a file
  already turned into a note does not read as still pending.
- **Starting a job** from a file's row (process this transcript) or from a fixed set of buttons
  (collect new Plaud recordings, run a controlling report in either mode, reindex the vault,
  rescan the repositories).
- **A live log** for a running or finished job, updating while the job runs.
- **Cancelling a running job**, where cancellation is possible - a job that runs in-process rather
  than as a spawned command cannot be cancelled, and is not offered a cancel button.
- **The scheduled runs already configured on this machine**, shown for visibility only; Bench
  never creates, edits or removes one.

## Not in scope

Deliberately left out of this phase:

- **Scheduling a job inside Bench.** Eingang only displays launchd entries a person already set
  up outside Bench; it never installs or edits one.
- **Processing audio directly.** A watched audio file is listed so its presence is visible, but no
  job kind takes an audio file as its target in this phase.
- **Editing or retrying a finished job.** A job's row is a historical record; starting the same
  work again means clicking the button again, which starts a new row.
- **Any job kind beyond the fixed six.** The catalog is closed; adding a new kind is a
  code change, not a runtime configuration.

## Success criteria

1. The unprocessed transcripts on the machine are listed, with a file already carrying a note
   correctly excluded.
2. "Process" produces a note in `PLAUD_HOME/notizen` and archives the original, with the log
   visible while it runs and afterwards.
3. A job can be cancelled and reports its resulting state correctly; a job that cannot be
   cancelled (an in-process run) never offers the option.
4. A job cannot write outside the three target folders - proven with hostile arguments (a file
   argument attempting to leave its folder, an unknown job kind, an extra argument to a kind that
   takes none).
5. The runner is faked in tests and in the bundled sample world, and CI never calls the real
   `claude` or a real skill script.

## Related documents

- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - how Eingang is actually built
- [aufgaben/IMPLEMENTATION.md](../aufgaben/IMPLEMENTATION.md) - the Plaud notes Eingang reconciles
  against; the frontmatter scan `quelleOf` duplicates is reasoned about in
  `server/src/aufgaben/plaud.ts`'s `splitFrontmatter` docstring, not in this doc
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
