> The original brief for Projekte, kept for intent and scope: the Projekte row of
> [changes/bench-os/SPEC.md](../changes/bench-os/SPEC.md) plus
> [changes/bench-os/PLAN.md](../changes/bench-os/PLAN.md)'s Phase 2 section. Complete history, not
> outstanding work. For how Projekte is actually built, read
> [IMPLEMENTATION.md](./IMPLEMENTATION.md).

# Projekte — Requirements

## Summary

Projekte is a read-only inventory of every git checkout and coupled working folder under the
configured roots, run on your own computer. It scans the filesystem and `git`, groups checkouts
that share a remote as duplicates, couples each project to its Obsidian vault note through the
note's `path:` frontmatter, and shows issue and PR counts through the `gh` CLI. Nothing here
writes to a repository, a working folder or the vault - `git` and `gh` are called for reads only.

## Sources

- **The configured roots** (`PROJECT_ROOTS` in `.env`) - directories scanned for git checkouts and
  plain working folders.
- **`git`**, via `simple-git` - branch, remote, last commit, dirty/ahead/behind for every checkout
  found.
- **`gh`** - open issue and PR counts for checkouts whose remote is on GitHub.
- **The vault index** (`data/vault.sqlite`) - the second documented exception to "one database per
  app" (the first is Aufgaben, Phase 3): Projekte reads it to couple a project to the vault note
  that names its path, and to pick up that note's `brand/` and `status/` tags. It never opens the
  vault database itself and never reads `VAULT_DIR` directly.

## The read-only rule

Projekte never writes into a repository, a working folder or the vault. `git` is only ever invoked
for reads (`status`, `log`, `remote`); `gh` only for `api` queries. `data/projekte.sqlite` is a
cache, rebuilt whole on every scan and safe to delete at any time. The one place the code runs
writing git commands is the sample builder, and it writes only under Bench's own data directory.

## The product

- **A scan** over the configured roots, finding every git checkout and reading its state: branch,
  remote, last commit, dirty entry count - an untracked directory counts once, matching plain
  `git status` - ahead/behind its upstream.
- **Duplicate detection** - checkouts that normalise to the same remote are grouped; checkouts with
  no remote fall back to a name-based group, which the UI marks separately as a possible rather
  than a confirmed duplicate.
- **Vault coupling** - a project whose path is named in a vault note's `path:` frontmatter shows
  that note's `brand/` and `status/` tags, and links back to the note.
- **Issue and PR counts** for GitHub remotes, fetched once per unique repository and shared across
  every duplicate that carries it; a count that cannot be fetched shows as absent rather than
  failing the scan.
- **A table** - one row per project, sortable by last commit, with badges for duplicates and
  warnings.
- **A board** - grouped by brand, then by status, for a view organised by what the projects are for
  rather than where they live on disk.
- **A detail panel** - every field for one project, its GitHub link, its vault note link, and the
  list of its duplicates.
- **A sample workshop** when no roots are configured, so the app shows a living scan without a
  `.env`.

## Not in scope

Deliberately left out of this phase:

- **Any write path.** Projekte reads git, `gh` and the vault; it changes none of them.
- **Task or issue management.** Issue and PR counts are shown, not editable - that is Aufgaben's
  domain (Phase 3), which reads GitHub issues read-only alongside the vault's own tasks.
- **A rescan schedule.** A scan runs lazily on first load and on demand; nothing runs it on a
  timer.
- **Coupling by anything other than the note's `path:` frontmatter.** No fuzzy matching, no
  directory-name heuristics.

## Success criteria

1. Every repository under the configured roots appears after one scan.
2. Checkouts sharing a remote group as a confirmed duplicate; checkouts sharing only a name group
   as a possible one.
3. `dirty`/`ahead`/`behind` match `git status` for a sampled checkout.
4. A GitHub remote's issue and PR counts match `gh issue list` / `gh pr list` for that repository.
5. A project note's `path:` frontmatter couples its checkout to the note, surfacing that note's
   `brand/` and `status/` tags.
6. A scan over a realistic root set finishes in single-digit seconds.
7. The end-to-end suite covers the table, the board and a rescan that picks up a checkout created
   after the first scan, against a built sample workshop.
