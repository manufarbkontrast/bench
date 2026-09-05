> The original brief for Kontext, kept for intent and scope: the Kontext row of
> [changes/bench-os/SPEC.md](../changes/bench-os/SPEC.md) plus
> [changes/bench-os/PLAN-phase-5.md](../changes/bench-os/PLAN-phase-5.md)'s Kontext tasks.
> Complete history, not outstanding work. For how Kontext is actually built, read
> [IMPLEMENTATION.md](./IMPLEMENTATION.md).

# Kontext — Requirements

## Summary

Kontext is what the system knows about the user: the vault's own profile and workflow-rules
notes, Claude Code's rule files and per-project memory, every registered project's
`CLAUDE.md`/`AGENTS.md`, the local skill catalogue, and which MCP servers are configured - seven
read-only views, none of them writing anything, anywhere.

## Sources

- **`~/.claude`** (or `BENCH_CLAUDE_DIR` for tests and e2e) - Claude Code's own directory: rule
  files under `rules/`, per-project memory under `projects/<dir>/memory/`, the skill catalogue
  under `skills/`. Read directly off disk on every request; Kontext never falls back to a bundled
  sample the way the other apps do - the real machine reading the real `~/.claude` is the point of
  the app.
- **`~/.claude.json`** (next to `~/.claude`, or `<claudeDir>/claude.json` when `claudeDir` is not
  literally named `.claude`) - MCP server configuration. Only the server names are ever read out
  of it.
- **`data/vault.sqlite`** - read-only, through the same injected database handle Aufgaben and
  Projekte already use; Kontext never imports `server/src/vault/`.
- **Projekte's registered project paths** - read-only, through an injected getter; Kontext never
  imports `server/src/projekte/`.

## The product

- **Profil** - the vault's notes under `10_Profile/`.
- **Regeln** - Claude Code's own rule files under `~/.claude/rules`, and the vault's notes under
  `50_Workflow/`.
- **Stand** - the vault's `00_Index/Session_Context.md`, whole, or nothing when it does not exist.
- **Memory** - Claude Code's per-project memory notes, one section per project directory that has
  a `memory` subfolder.
- **Repos** - each registered project's own `CLAUDE.md` and `AGENTS.md`, when present.
- **Skills** - the local skill catalogue: a folder count and, for every folder with a readable
  `SKILL.md`, its name and description, filterable by a client-side search.
- **MCP** - the configured MCP server names, and nothing else about them.

## Not in scope

Deliberately left out of this phase:

- **Writing anything.** Every route is a GET; nothing in Kontext calls into
  `server/src/vault/write.ts` or any other write path.
- **Any secret, token or connection detail.** MCP server configuration can carry these; Kontext
  extracts only the server names and discards the rest before a response is built.
- **A client-supplied path.** Every route is parameterless; there is nothing for a request to
  parametrize.

## Success criteria

1. Every tab renders real data against a real `~/.claude` and the real vault, with no fixture
   fallback of its own.
2. A poisoned MCP config's connection details never reach a rendered page or a JSON response -
   proven with a fixture carrying a secret-shaped URL.
3. The skills counter matches the real folder count under `~/.claude/skills`.
4. A `gitleaks` sweep of every tab's rendered text finds nothing.

## Related documents

- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - how Kontext is actually built
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
