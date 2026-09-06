# Change: Plaud über den MCP

Let Bench fetch a Plaud recording itself - transcript, the device's highlights and Plaud's own AI
note - as one Markdown file into `~/Plaud/inbox`, on a click in Eingang, through the Plaud MCP
server the way Bench already runs `gh`. Give every Plaud note a project, chosen by the person who
processes it, so Projekte can show the fourth freshness signal the Projektstand change left
empty: the meetings a handoff does not know about yet. The design was settled with the user on
2026-09-05 (the question round shared with `docs/changes/projektstand/`) and 2026-09-06 (four
follow-up decisions); this file is the condensed spec the plan is built from.

## Goal

- A recording no longer has to be exported by hand from the Plaud app into `~/Downloads` and
  collected by `plaud-sync`. Eingang lists the newest recordings straight from Plaud, marks per
  recording id what already sits in `inbox/`, `archiv/` or `notizen/`, and fetches one on click.
- The fetched file is the transcript the `/plaud` skill already works from, plus the highlights
  and Plaud's AI note as context - never as the source.
- A processed note carries `projekt: <slug>` (the person picks the project in Eingang) and
  `aufnahme: <id>`, and Projekte counts, per project, the Plaud notes dated after its handoff.
- Bench holds no token. The MCP keeps the OAuth login in its own file; Bench spawns it, calls it,
  and drops it, exactly like `gh`.

## Decisions settled at design approval

From the 2026-09-05 round:

1. **Bench talks to `npx -y @plaud-ai/mcp@latest` itself, over stdio,** the way it runs `gh`: a
   local process on this machine, no cloud call of Bench's own, no token in Bench. The MCP's
   login lives in `~/.plaud/tokens-mcp.json` and is shared with the user's Claude Code session;
   Bench never calls the MCP's `login` tool - when it is not logged in, Eingang says so and
   points at `/plaud` in the terminal.
2. **Per recording, three things are fetched:** the transcript (`get_transcript`), the highlights
   (`get_transcript` with `block: "mark_memo"`, present only when the device button was pressed)
   and the AI note (`get_note`), written as one Markdown file with frontmatter into
   `<plaudHome>/inbox`.
3. **Only on click, in Eingang.** No schedule, no fetch on page load. The listing itself is a read
   and loads with the page, like the inbox and the launchd panel; fetching is a job.
4. **The listing marks per recording id what is already local** - in `inbox/`, in `archiv/`, or
   turned into a note - so nothing is fetched twice and nothing is hidden.
5. **`plaud-process` writes `projekt:` into the finished note**, which is what makes the fourth
   signal (`docs/changes/projektstand/SPEC.md`, decision 8) exist.

From the 2026-09-06 round:

6. **The AI note travels along, it is never the source.** The `/plaud` skill's rule stands -
   "always the raw transcript, never Plaud's own summary" - the fetched file carries all three
   sections, the skill reads `## Transkript`, and the other two are context and Belegstelle.
7. **Fetching is a job kind, `plaud-fetch`,** through `planJob`'s fence: the recording id as the
   one argument, refused when the id is already local, refused without `PLAUD_HOME`; runs
   in-process like `vault-reindex`, with a log file, the 409 double-start guard and a timeout.
8. **The person picks the project.** A project select beside `Verarbeiten`, filled with the
   handoff slugs the vault index knows; the slug travels as a fenced argument that has to match
   one of them, into the `claude -p` prompt, and the skill writes it. No guessing (Projektstand
   decision 12); no project chosen, no key.
9. **The fourth signal counts Plaud notes dated after the handoff:** notes under
   `<plaudHome>/notizen` with `projekt: <slug>` whose `datum` is later than the handoff's
   `updated` - meetings the handoff does not reflect. No read of another app's database.

Settled in this spec, open for the user's approval with it:

10. **The MCP client is Bench's own, about a hundred lines, no new dependency.** The protocol is
    JSON-RPC over stdio, newline-delimited: `initialize`, `notifications/initialized`,
    `tools/call`. Three message shapes are not worth `@modelcontextprotocol/sdk` and its
    transitive dependencies; the client is tested against a fixture MCP script the way the runner
    is tested against `fake-job.mjs`.
11. **A third write path, outside the vault.** Bench OS principle 2 ("two write paths, nothing
    else") is amended: (c) a fetched recording becomes a new file under `<plaudHome>/inbox`,
    created with `wx` so it can never overwrite, only from a clicked `plaud-fetch` job, only
    after the realpath check that `inbox/` resolves inside `plaudHome`. Nothing else in Bench
    writes under `~/Plaud`.
12. **The id key is `aufnahme:`**, in the fetched file, carried by the skill into the note. The
    old exports (PDFs in `archiv/`, notes with only `quelle:`) have no id and show as `Neu` -
    by design, not guessed from filenames.
13. **The sample world lists a fixture and fetches nothing**, the `fakeSpawn` precedent: under
    sample data the listing comes from a bundled JSON, and `plaud-fetch` logs its three calls and
    writes no file. The stdio client and the file writer are covered by unit tests; the real MCP
    walk-through is a success criterion, recorded in `e2e/EXPLORATORY.md`.
14. **Frontmatter scanning stays per app.** Eingang's `quelleOf` twin grows into a small
    `frontmatterValue(text, key)` in `inbox.ts`; Projekte gets its own eight-line reader for
    `projekt` and `datum`. The per-app boundary is worth more than the shared lines, as Eingang's
    doc already argues for `quelleOf`.
15. **`plaud-sync` stays as it is.** It collects hand exports from `~/Downloads`; the MCP fetch is
    a second way in, not a replacement. The `_HIER-...` marker keeps its instructions.

## Model

A **recording** is what `list_files` returns, reduced to what Bench needs:

| Field    | Source                                                                  |
| -------- | ----------------------------------------------------------------------- |
| `id`     | the MCP's file id, an opaque string; the fence accepts `[A-Za-z0-9_-]+` |
| `titel`  | the recording's title, `Ohne Titel` when empty                          |
| `start`  | the recording's start time as ISO, local zone                           |
| `dauer`  | duration in milliseconds (the MCP's unit), rendered `1h05m`             |
| `status` | `neu`, `wird_geholt`, `im_eingang`, `im_archiv`, `notiz_vorhanden`      |

`status` is reconciled in one fixed order, the `listInbox` rule applied to ids: a note under
`notizen/` carrying `aufnahme: <id>` wins, then a file under `archiv/` carrying it, then one under
`inbox/`, then a running `plaud-fetch` job whose `args.id` names it, else `neu`. The set of local
ids is built once per listing call - the three folders' `.md` frontmatters read once - not once
per recording.

The exact result shapes of `list_files`, `get_transcript` (including its `next_cursor` paging and
the `mark_memo` block), and `get_note` are **probed once against the real MCP before any parser is
written** (Task 0 of the plan), and the fixture MCP script is shaped from that probe. What the
`plaud-*` skills document today: durations are milliseconds; transcript segments carry start,
end, speaker and text; a note is Markdown; an entry with empty `data_content` and a `data_link` is
link-backed, not missing.

The **fetched file** is `<plaudHome>/inbox/<YYYY-MM-DD>_<slug>-transkript.md`: the date from
`start`, the slug from `titel` (ASCII letters, digits and hyphens, at most 60 characters), the
suffix so `listInbox`'s `NAME_PATTERN` lists it and the `/plaud` skill accepts it. A name already
present in `inbox/` or `archiv/` gets `-2`, `-3`, ... The file:

```markdown
---
aufnahme: <id>
titel: <titel>
datum: YYYY-MM-DD
start: <ISO local>
dauer: 1h05m
geholt: YYYY-MM-DD
---

# <titel>

## Transkript

[MM:SS - MM:SS] Sprecher 1: ...

## Markierungen

- [MM:SS] ... (or the line `Keine.`)

## KI-Notiz (Plaud)

<the note's Markdown> (or the line `Keine.`)
```

A **processed note** (written by the `/plaud` skill, not by Bench) gains two frontmatter keys
beside the five it has: `aufnahme: <id>` copied from the source file, and `projekt: <slug>` when
the job carried one.

**The fourth signal**, computed in `stand.ts` at read time: `plaudNotizen` is the count of `.md`
files under `<notizenDir>` whose frontmatter `projekt` (trimmed, lowercased) equals the slug and
whose `datum` parses to a day later than the handoff's `updated`. No `updated`, or no notizen
directory, gives `0`.

## Server

Module `server/src/eingang/`, the existing jobs database, one new write surface (decision 11).

- `plaud-mcp.ts` (new): the stdio client. `withPlaud(command, fn)` spawns `npx` by name with
  `-y @plaud-ai/mcp@latest`, performs the handshake, hands `fn` a `call(tool, args)` and kills
  the child when `fn` settles or after 120 seconds; each call times out after 30 seconds.
  Failures are typed, never thrown into a route: `off` (`BENCH_PLAUD=off` or the sample world),
  `unauthenticated` (the MCP's 401 / "Not authenticated" answer), `unreachable` (spawn error,
  timeout, malformed frame), `not_found` (404). `listRecordings(page)` and `fetchRecording(id)`
  are the two operations; nothing else is exposed.
- `plaud-fetch.ts` (new): pure assembly and the write. `renderFetchedFile` takes the recording,
  the transcript, the marks and the note and produces the Markdown above; `fetchedFileName`
  picks the name with its collision suffix against `inbox/` and `archiv/`; `writeFetchedFile`
  opens with `wx` after `resolvesInsideFolder(plaudHome, inboxDir)`.
- `jobs.ts`: the catalog gains `plaud-fetch` (internal, timeout 5 minutes) and `JobPlan`'s
  internal shape carries `args`. `planPlaudFetch` checks, in this order and before anything else
  is built: `plaudHome` present (else 400 `plaud is not configured`), `args.id` a string matching
  `^[A-Za-z0-9_-]{1,64}$`, no other key, the id not in the local id set (else 400
  `recording already local: <id>`). `planPlaudProcess` accepts an optional `args.projekt`: a
  string equal to one of the slugs the injected `projektSlugs()` returns (else 400
  `unknown projekt: <slug>`),
  and the prompt then ends with `Trage projekt: <slug> in das Frontmatter der Notiz ein.` The
  tool allowlist does not change.
- `inbox.ts`: `frontmatterValue(text, key)` generalises `quelleOf`; `localRecordingIds` reads
  every `.md` in the three folders once; `plaudStatus(id, local, inFlight)` applies the order
  above.
- `routes.ts`: `GET /api/eingang/plaud?page=1` answers

  ```
  { source: "mcp" | "sample" | "off" | "unauthenticated" | "unreachable",
    recordings: Recording[], nextPage: number | null }
  ```

  where every non-`mcp` source answers with an empty list and 200 - a Plaud Bench cannot reach
  never breaks the page, the `fetchCounts` rule. `GET /api/eingang/projekte` -> `{ slugs }` from the
  injected getter, for the select. `POST /jobs` unchanged in shape; a `plaud-fetch` job's
  environment carries nothing new.

- `runner.ts`: `RunnerInternals` gains `"plaud-fetch": (log, args) => Promise<void>`; an internal
  job now receives its plan's `args`.
- `index.ts`, the composition root: wires `plaud-fetch` to `fetchRecording` over `withPlaud`
  (or the sample stand-in), passes `projektSlugs` from Projekte's `vaultHandoffs(vaultDb)` into
  the Eingang context - the Kontext pattern, an injected getter, no import between the two
  modules - and hands Projekte the located notizen directory for the signal. `describeSources`
  prints `Plaud MCP: on | off`.

Module `server/src/projekte/`: `stand.ts` takes `notizenDir: string | null` and adds
`plaudNotizen` to `signals`; the eight-line frontmatter reader lives beside it. Sort order does
not change.

## Web - Eingang

A panel `Plaud-Aufnahmen` between the inbox list and the jobs panel:

- one row per recording: `start` as `dd.MM.yyyy HH:mm`, `titel`, `dauer`, the status label
  (`Neu`, `Wird geholt`, `Im Eingang`, `Im Archiv`, `Notiz vorhanden`), and `Holen` - enabled for
  `neu` only, otherwise disabled with the status as its title; `aria-label="Holen: <titel>"`;
- a source line for every non-`mcp` source: `Plaud ist nicht konfiguriert.` (`off`),
  `Nicht angemeldet - im Terminal /plaud starten.` (`unauthenticated`),
  `Plaud nicht erreichbar.` (`unreachable`), and `Beispieldaten` for `sample`;
- `Neu laden` and, while `nextPage` is set, `Mehr laden`; empty state `Keine Aufnahmen.`.

`Holen` starts `plaud-fetch` with `{ id }`, then refetches the listing, the inbox and the jobs
list the way `runJob` does today; a 409 shows `Läuft bereits.`. The inbox row of a processable
file gains a `<select>` labelled `Projekt` (`Kein Projekt` plus the slugs, from
`GET /api/eingang/projekte`) and `handleProcess(name, projekt)` passes the chosen slug. Audio and
non-processable rows are unchanged.

The Cockpit's Eingang panel does not touch the MCP: it keeps counting `unverarbeitet` from
`/api/eingang/inbox` alone.

## Web - Projekte and Cockpit

`ProjektCard` and the Cockpit's handoff rows gain one badge, `<n> Plaud-Notizen seit Handoff`,
shown when `plaudNotizen > 0`; the Cockpit's local reply type gains the field. Nothing else moves.

## Error handling

Expected cases answer, they do not throw: the MCP off, not logged in or unreachable is a `source`
and an empty list; a fetch of an unknown id fails the job with the MCP's answer in the log; a
target name that exists at write time fails the job (`wx`), never overwrites; a `projekt` that is
not a known slug is 400 before any prompt is built; `PLAUD_HOME` unset refuses `plaud-fetch` the
way it refuses the three plaud kinds today. A malformed frame from the MCP is `unreachable`, with
the first 200 bytes in the server log, not in the reply. No vault handle (the sample world)
yields the fixture vault's handoff slugs, since the fixture vault carries two handoffs.

## Testing

- Unit (`server/test/eingang/`): `plaud-mcp.test.ts` against `fixture/fake-plaud-mcp.mjs` - the
  handshake, a `tools/call` round trip, a paged transcript, the `mark_memo` block, a 401 answer
  mapped to `unauthenticated`, a hung child hitting the call timeout, a missing binary mapped to
  `unreachable`, `BENCH_PLAUD=off` never spawning; `plaud-fetch.test.ts` - file name, slug,
  collision suffix, the three sections with and without highlights and note, `wx` refusing an
  existing name, the realpath refusal on a symlinked `inbox/`; `jobs.test.ts` - the new fence
  check by check, including the `projekt` slug validation; `inbox.test.ts` - `plaudStatus`'s
  order and `localRecordingIds`; `routes.test.ts` - the two new routes' shapes for every
  `source`. `server/test/projekte/stand.test.ts` - `plaudNotizen` positive, negative, same-day
  and no-directory cases.
- Web: `PlaudPanel.test.tsx` (rows, labels, the enabled/disabled rule, every source line, the
  `Mehr laden` button), `InboxList.test.tsx` (the select and the argument it produces),
  `ProjektCard` and Cockpit `App.test.tsx` (the badge, present and absent).
- e2e (`e2e/eingang/plaud.spec.ts`, sample world): the fixture listing shows three recordings
  with three different marks - one `Neu`, one `Im Eingang` (a fixture inbox `.md` carrying its
  `aufnahme:`), one `Notiz vorhanden` (the fixture note gains `aufnahme:`); `Holen` on the new
  one reaches `Fertig` with the three call lines in its log; `Verarbeiten` with a project chosen
  starts a job whose row shows the slug. `inbox.spec.ts` is updated for the second enabled
  button. Retry-safe: the sample fetch writes nothing, proven with `--workers=1 --repeat-each=2`.
- Coverage stays at or above 80 % statements per workspace; `npm run check` and `npm run e2e`
  green before every commit.

## Companion changes outside the repository

- The `/plaud` skill (`~/.claude/skills/plaud/`): `references/transkript-formate.md` gains the
  Bench export as a third format (frontmatter, `## Transkript` as the source, the two context
  sections); `references/notiz-format.md` gains `aufnahme:` (copied when present) and `projekt:`
  (written when the prompt names one); `SKILL.md` keeps its "never the summary" rule and says the
  fetched file's `## KI-Notiz` section is that summary. The skill is the user's; the plan names
  the exact wording and the user applies or approves it.
- The user's own MCP registration in Claude Code stays as it is; Bench spawns the package by
  name and shares the MCP's token file by construction.

## Documentation

`docs/eingang/IMPLEMENTATION.md` (the client, the fence's new kind and the `projekt` argument,
the id reconciliation, the traps: npx resolves `@latest` on every spawn and needs the network,
`wx` and the collision suffix, old exports have no id), `docs/eingang/REQUIREMENTS.md` (this
brief), `docs/projekte/IMPLEMENTATION.md` (the fourth signal), `docs/cockpit/IMPLEMENTATION.md`
(the badge), `docs/PROJECT.md` (the Eingang row, the amended write-path decision, the MCP under
"local CLIs are fair game"), `e2e/EXPLORATORY.md` (the real MCP walk-through, the real skill run
with a project).

## Out of scope

Downloading audio (`presigned_url`); pushing, editing or deleting anything on Plaud; calling
`login` from Bench; scheduling; the AI note as a processing source; teaching Aufgaben's import the
`projekt` key; retention of fetched files; replacing `plaud-sync`; a Cockpit panel over the MCP.

## Global constraints

Those of `docs/changes/bench-os/SPEC.md` "Global constraints" apply unchanged: TypeScript
`6.0.3`, ESLint limits, no `any`, immutable data, German UI and English code, Conventional
Commits, fixtures synthetic, machine paths only in `.env`, no new dependency without a reason -
and decision 10 declines the one candidate. `server/src/eingang/` keeps importing nothing from
`server/src/vault/`, `server/src/projekte/` or `server/src/aufgaben/`; the slugs and the notizen
directory arrive through the composition root.

## Success criteria

1. With the real `.env` and a logged-in MCP, the `Plaud-Aufnahmen` panel lists the newest
   recordings; every recording whose id is already in a local file carries the matching mark, the
   rest read `Neu`; `Mehr laden` reaches the next page.
2. `Holen` on one recording writes exactly one `.md` under `~/Plaud/inbox` with `aufnahme:`, the
   three sections and a name the inbox list shows as `Unverarbeitet` with `Verarbeiten` enabled;
   a second `Holen` on the same recording is refused.
3. `Verarbeiten` with a project chosen produces a note under `notizen/` carrying the chosen
   `projekt:` slug and the source's `aufnahme:` id, and the recording's mark becomes
   `Notiz vorhanden` on the next listing.
4. `GET /api/projekte/stand` shows that project's `plaudNotizen` equal to a hand count of its
   notes dated after its handoff, and the badge renders in Projekte and on the Cockpit.
5. With the MCP off, logged out or offline, the panel says which, everything else in Eingang and
   the Cockpit is unaffected, and `npm run check` and `npm run e2e` are green.
