> The original brief for Zahlen, kept for intent and scope: the Zahlen row of
> [changes/bench-os/SPEC.md](../changes/bench-os/SPEC.md) plus
> [changes/bench-os/PLAN-phase-5.md](../changes/bench-os/PLAN-phase-5.md)'s Zahlen tasks, plus the
> Cockpit's own Zahlen panel from the same phase. Complete history, not outstanding work. For how
> Zahlen is actually built, read [IMPLEMENTATION.md](./IMPLEMENTATION.md).

# Zahlen — Requirements

## Summary

Zahlen is the last controlling run and its archive: the parsed KPI table and break-even bullets
from the run's own generated summary, the rendered report in an iframe, the two raw files to
download, and a fixed set of deep links into myCrafton. Read-only, sharing Eingang's own
`CONTROLLING_DIR` rather than adding a source of its own.

## Sources

- **`CONTROLLING_DIR`** (`.env`, read through Eingang's own `locateEingang`) - where the local
  controlling skill writes one folder per run, `YYYY-MM-DD-(zwischenstand|abschluss)`, each
  holding `zusammenfassung.md` and, once a report has actually rendered, `bericht.html` and
  `rohdaten.json`. A configured `INBOX_WATCH` with no `CONTROLLING_DIR` leaves Zahlen with a null
  `dir`, the same real-not-sample ruling Eingang's own `controlling` job kind already follows; an
  unconfigured world falls back to the bundled Eingang fixture tree, extended with a second run
  folder for Zahlen's own archive view.
- **`letzter-lauf.json`** - the controlling skill's own pointer to its last run, read only for its
  `bestellungen` figure and, as a fallback resolution hint, its `ordner` field's basename.
- **`MYCRAFTON_URL`** (`.env`) - the base URL of the user's myCrafton cockpit; unset renders the
  deep-links panel as unconfigured rather than broken links.

## The product

- **The last run's figures** - the run's own headline (Zwischenstand or Abschluss, and its date),
  the KPI table parsed straight out of `zusammenfassung.md`, and the break-even bullet count.
- **The archive** - every run folder found under `CONTROLLING_DIR`, newest first, selectable to
  view any earlier run's own figures in place of the last one.
- **The rendered report** - `bericht.html`, shown in an iframe, when the selected run has one.
- **The raw files** - `rohdaten.json` and `zusammenfassung.md`, offered as downloads for the
  selected run.
- **myCrafton deep links** - four fixed paths appended to the configured base, opening in a new
  tab; unconfigured renders a plain message instead of broken links.
- **The Cockpit's own Zahlen panel** - the last run's headline, two of its KPI rows picked by
  name, and the break-even count, plus a link into the full app.

## Not in scope

Deliberately left out of this phase:

- **Writing anything.** Every route is a GET; Zahlen has no job kind, no button that starts a
  process, and no write path of its own.
- **A database of its own.** Zahlen resolves everything by folder basename against
  `CONTROLLING_DIR` at request time; nothing about a run is indexed or cached across requests.
- **Any file beyond the three-name allowlist.** `GET /file` only ever serves `bericht.html`,
  `rohdaten.json` or `zusammenfassung.md` - never an arbitrary file from a run's own folder.

## Success criteria

1. The last run's KPI rows match `zusammenfassung.md`'s own generated table, by construction: the
   same parser produces both.
2. The archive lists every run folder found on disk, and selecting an older one swaps every panel
   to that run's own figures.
3. A file request outside the three-name allowlist, or a folder argument that does not match the
   exact run-folder shape, is refused before any path is built or any file is read.
4. With a real `MYCRAFTON_URL` configured, all four deep-link paths resolve against the real host.
5. The Cockpit's Zahlen panel reads the same reply this app's own "last run" view does, so the two
   never show different figures for the same run.

## Related documents

- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - how Zahlen is actually built
- [eingang/IMPLEMENTATION.md](../eingang/IMPLEMENTATION.md) - `locateEingang`'s sample/configured
  switch, which Zahlen's own `dir` is resolved through
- [cockpit/IMPLEMENTATION.md](../cockpit/IMPLEMENTATION.md) - the Zahlen panel on the Cockpit
- [PROJECT.md](../PROJECT.md) - how the apps fit together
- [PROCESS.md](../PROCESS.md) - how to make a change here
