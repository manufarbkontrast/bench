> The original brief for the Cockpit, kept for intent and scope: the Cockpit row of
> [changes/bench-os/SPEC.md](../changes/bench-os/SPEC.md) plus
> [changes/bench-os/PLAN.md](../changes/bench-os/PLAN.md)'s Phase 3 section. Complete history, not
> outstanding work. For how the Cockpit is actually built, read
> [IMPLEMENTATION.md](./IMPLEMENTATION.md).

# Cockpit — Requirements

## Summary

The Cockpit is the desk: one page at `/`, replacing the old card-grid launcher, surfacing what
needs attention across the vault's tasks, the repositories Projekte tracks, and the vault's own
session note - without any database or write path of its own.

## Sources

Three sibling APIs, read directly, each panel one fetch's worth of rows:

- **`GET /api/aufgaben/tasks`** - overdue, due-this-week and recently-completed tasks.
- **`GET /api/projekte/list`** - repositories with an uncommitted, unpushed or recent change.
- **`GET /api/vault/note?path=00_Index/Session_Context.md`** - the vault's own session note, for
  "continue here."

The Cockpit holds no data of its own and writes nothing; every figure it shows is computed from
what a sibling app already indexed.

## The product

- **The app row** - a plain link to each of the five apps, replacing the launcher's card grid.
- **Seven panels, in a fixed order**: overdue tasks, this week's tasks, an inbox placeholder, repos
  in motion, "continue here" from the session note, a controlling placeholder, and recently
  completed tasks.
- **Two placeholder panels**, honestly labelled rather than omitted, because the page's final shape
  matters before every app behind it exists: `Eingang` (Phase 4) and `Zahlen` (Phase 5).
- **The same exclusion list Aufgaben applies** - a task filed under a housekeeping folder does not
  count as work here either, because both read the same already-filtered API.

## Not in scope

Deliberately left out of this phase:

- **Inbox counts and the last controlling run**, as real data - the two placeholder panels exist
  only to reserve their place; the apps that feed them arrive in Phases 4 and 5.
- **Any write path.** The Cockpit reads three sibling APIs and writes nothing anywhere; toggling a
  task or scanning repositories happens in Aufgaben and Projekte, not here.
- **A dashboard of charts or KPI tiles.** Every panel is a plain list of rows, the same shape the
  apps behind it already use - no decorative visualisation invented for this page alone.

## Success criteria

1. All seven panels render, in the fixed order, on a fresh load.
2. An overdue task, a moving project and the session note's first section all show real content
   against the sample data, each linking into the app that owns it.
3. The two placeholder panels say plainly what they are waiting for.
4. The end-to-end suite covers a real load of all seven panels against the built sample data.
