> The original brief for Aufgaben, kept for intent and scope: the Aufgaben row of
> [changes/bench-os/SPEC.md](../changes/bench-os/SPEC.md) plus
> [changes/bench-os/PLAN.md](../changes/bench-os/PLAN.md)'s Phase 3 section. Complete history, not
> outstanding work. For how Aufgaben is actually built, read
> [IMPLEMENTATION.md](./IMPLEMENTATION.md).

# Aufgaben — Requirements

## Summary

Aufgaben is one board over three sources: the vault's own tasks, writable through the vault's one
guarded line-edit path; Plaud work items waiting to be imported into the vault; and GitHub issues,
read-only. Views: today, this week, by project note, by brand, unassigned, done, issues.

## Sources

- **The vault index** (`data/vault.sqlite`) - every Tasks-plugin checkbox line the indexer found,
  joined to its note's title and first `brand/` tag. The first documented exception to "one
  database per app" (the second is Projekte, Phase 2): Aufgaben reads it through the handle the
  composition root already holds, and never opens `VAULT_DIR` itself.
- **`PLAUD_HOME/notizen`** (`.env`) - already-processed Plaud meeting notes, one Markdown file per
  meeting, each carrying an `Arbeitsaufträge` table. Read-only; without a configured `PLAUD_HOME`
  Bench falls back to a bundled sample note.
- **`data/aufgaben.sqlite`** - Aufgaben's own database, holding only the import ledger: which
  Plaud table rows have already become vault tasks. Deliberately not part of the rebuildable
  vault index.
- **`gh`** - open issues for every GitHub remote Projekte has scanned, read-only, via the same CLI
  Projekte itself shells out to.

## The two write paths

Aufgaben writes into the vault through exactly the two paths `server/src/vault/write.ts` exposes,
and nothing else:

1. **Toggle a task's checkbox.** Guarded: the line's current text on disk must still match what
   the caller last read, or the write is refused with 409 and the note is reindexed regardless, so
   the next read is current either way.
2. **Append a new task line** under a note's `## Aufgaben` heading - either a task created by hand
   in the Aufgaben app, or a Plaud work item imported into the vault, recorded in the ledger so the
   same row is never imported twice.

Obsidian stays the editor for everything else; Aufgaben never touches a note's prose.

## The product

- **Views over the vault's open tasks** - overdue and due today, high priority, the coming week,
  grouped by project note, grouped by brand, unassigned (no brand tag on the note), and the last 30
  completed.
- **Toggling a task's checkbox** from any view, with a conflict message when the note changed
  underneath it since the page loaded.
- **Creating a task** by hand, into a chosen note or the default inbox, with an optional due date
  and priority.
- **Reading Plaud work items**, organised by the meeting note they came from: who each item is
  for, what it is, its due date and its source timestamp.
- **Importing a Plaud row into the vault** as a task, into a suggested target note or one picked by
  hand, with a hint when an open task already looks like the same work.
- **GitHub issues**, read-only, grouped by repository, for every repository Projekte already
  knows about.

## Not in scope

Deliberately left out of this phase:

- **Editing a task's text, due date or priority once it exists.** Only the checkbox toggles, and a
  brand-new task can be created; changing anything else on an existing line stays Obsidian's job.
- **Closing or commenting on a GitHub issue.** Issues are shown, not managed - that stays on
  GitHub.
- **Recurrence.** A recurring task's checkbox still toggles, but Aufgaben never computes or writes
  the next occurrence; Obsidian's Tasks plugin owns that when the note is next opened there.
- **A Plaud processing job.** Aufgaben reads notes already processed under `PLAUD_HOME/notizen`;
  turning a raw transcript into one is the `/plaud` skill's job, run outside Bench.

## Success criteria

1. Every open Tasks-plugin line in the vault, outside the excluded housekeeping folders, appears
   in the right view.
2. Toggling a checkbox in Aufgaben updates the file on disk exactly as Obsidian's own Tasks plugin
   would, and a conflicting edit is refused rather than silently overwritten.
3. A Plaud work item, once imported, is never offered for import again, even after a reload.
4. A GitHub remote's open issues match `gh issue list` for that repository.
5. The end-to-end suite covers a toggle, a rejected conflict, a task created by hand, and a Plaud
   import, against the built fixture vault and the bundled Plaud sample.
