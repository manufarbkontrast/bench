> The original brief for Vault, kept for intent and scope: the Phase 1 section of
> [changes/bench-os/PLAN.md](../changes/bench-os/PLAN.md) plus the Vault row of
> [changes/bench-os/SPEC.md](../changes/bench-os/SPEC.md). Marked **complete** history once Task 11
> passes - not outstanding work. For how Vault is actually built, read
> [IMPLEMENTATION.md](./IMPLEMENTATION.md).

# Vault — Requirements

## Summary

Vault is a read-only window onto an Obsidian vault, run on your own computer. It indexes the
vault's markdown into a local SQLite database and lets you browse it - folder tree, rendered
notes, wikilinks, backlinks, tags, full-text search - without touching Obsidian itself. The vault
stays the source of truth; nothing here writes to it.

## The product

- **Tree** - a sidebar listing every folder and note, built from the flat index. Folders expand
  and collapse, remembering what was open; the folder containing the open note is always shown.
- **Notes** - a note renders as markdown: headings, lists, tables, callouts, images. The filename's
  own repeated `# Title` line is not shown twice.
- **Wikilinks** - `[[Note]]`, `[[Note#Heading]]`, `[[Note|Alias]]` and their embed form (`![[...]]`)
  render as ordinary links (or images) into Vault's own routes when they resolve to a note in the
  vault, and as plain text when they do not.
- **Backlinks** - every note shows the other notes that link to it, read from the index rather than
  scanned live.
- **Tags** - a note's frontmatter tags are shown on the note.
- **Quick-find** - a keyboard-driven search (⌘K / Ctrl+K) over titles and body text, opening a
  result directly.
- **Open in Obsidian** - a link on every note using Obsidian's own `obsidian://open` URI, so the
  same note opens in the real app for editing.
- **Raw view** - a toggle on every note to see its unrendered markdown source.
- **Live index** - the vault is watched while Bench runs; a note added, edited or removed on disk
  is reflected without restarting the server.

## Not in scope

Deliberately left out of this phase:

- **Editing.** Vault never writes to the vault; Obsidian stays the editor.
- **A tasks UI.** The indexer already parses the Tasks-plugin grammar into its own table, but
  showing or toggling tasks is Phase 3 (the Aufgaben app), not this one.
- **Canvas files** (`.canvas`). Not indexed, not rendered.
- **A graph view.** Backlinks are shown per note; there is no whole-vault link graph.

## Success criteria

1. The real vault indexes in under 2 seconds.
2. Ten sampled notes render with working wikilinks and correct backlinks.
3. Search finds titles and body text.
4. An edit made in Obsidian shows in Bench within 3 seconds, without a restart.
5. The task grammar parser has unit tests for every emoji field and the edge cases.
6. The end-to-end suite covers opening a note, searching, jumping via a link, and the theme.
