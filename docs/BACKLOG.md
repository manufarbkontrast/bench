# Backlog - what is left, and what deliberately is not

Written 2026-09-10, when the queue emptied: Bench OS, Projektstand, Plaud-MCP, the review
follow-ups, the app-boundary lint rule, the cleanup round and the orphaned-jobs change are all on
`main`, and no change is planned.

Everything below was already recorded somewhere - in an app doc, in [CONTROLS.md](./CONTROLS.md),
in [e2e/EXPLORATORY.md](../e2e/EXPLORATORY.md). This file is the one place that says which of it is
work and which is a decision already taken, so the next session does not re-derive that.

**Read the tiers as advice, not as a queue.** Tier 1 held the only defect and is now empty. Tier 4
exists so nobody "fixes" it.

**Tiers 2 to 5 were worked through on 2026-09-10.** No trigger had fired, tier 3's coverage, seed
and duplicate items are closed, and the user's calls on the hygiene items moved them into tier 4.
What each tier still holds is below.

## Tier 1 - closed, nothing here

**`indexNote`'s unwrapped read is fixed.** `readNote` treats the four errno codes that mean the
filesystem moved under us as "gone" and `indexNote` returns `false`, so the watcher skips the note
and `indexAll` keeps going; `EISDIR` and everything else still throws. Fixing it turned up a second
mouth of the same hole the entry did not name: `indexAll` reads every path its own listing gave it,
inside one transaction, so a note deleted mid-scan aborted the entire initial index - a boot crash,
not just a lost note. Both are closed by the one change. See
[vault/IMPLEMENTATION.md](./vault/IMPLEMENTATION.md)'s indexer section for the contract and
[EXPLORATORY.md](../e2e/EXPLORATORY.md) for what the tests do and do not force.

**One arrived and left on 2026-09-10**: the CRM's five PUT and PATCH routes answered a missing id
with a 200 and an empty body, which the client then failed to parse. Found by the first route
suite the CRM ever had; they answer 404 now.

**A second arrived and left the same day, and it was the worse one**: the server listened on every
network interface. Bench has no login, so with the macOS firewall off any machine on the same
network could read the vault and start jobs. It answers on 127.0.0.1 only now - see
[PROJECT.md](./PROJECT.md).

**No defect is known to be open.** If something arrives here, it belongs above tier 2.

## Tier 2 - gated on something outside this repo

Do nothing until the condition fires. The two pins are recorded with their reasoning in
[PROJECT.md](./PROJECT.md) and [CONTROLS.md](./CONTROLS.md); this is only the trigger.

| What                               | Trigger                                                                                                                                                                | Cost of waiting                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| TypeScript pinned to exactly 6.0.3 | typescript-eslint supports the native Go compiler, expected in TS 7.1 ([typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)) | ~3 seconds per typecheck, roughly 7x slower than 7.0.2 |
| better-sqlite3 held at 12          | `npm ci` stops running `node-gyp rebuild` for v13, or upstream stops shipping `binding.gyp` in the tarball                                                             | one deprecation warning on `npm ci`                    |
| launchd's array form               | a real plist in `~/Library/LaunchAgents` uses the array form of `StartCalendarInterval`, which Eingang shows only the first entry of                                   | none while no plist uses it                            |

Checking any of them takes a minute. Acting on either pin is a coordinated change - read the
reasoning first, because both look arbitrary and are not.

**Checked 2026-09-10, none fired:**

- **TypeScript:** `latest` is 7.0.2 and 7.1 exists only as a nightly on the `next` tag;
  typescript-eslint 8.70.0 still declares `typescript >=4.8.4 <6.1.0`.
- **better-sqlite3:** 13.0.3's full manifest now carries `gypfile: false` and no install script,
  and the registry's abbreviated metadata carries no `hasInstallScript` - which reads like the
  trigger. It is not: in a scratch folder, `npm install` left node-gyp alone, but `npm ci` from the
  lockfile it had just written ran it, with `npm warn install-scripts better-sqlite3@13.0.3
(install: node-gyp rebuild)`. **Check this trigger with a scratch `npm ci`, never with
  `npm install`**, or the answer comes out wrong. On a machine with a toolchain that rebuild
  passes unnoticed; on a stock Windows machine node-gyp cannot even configure.
- **launchd:** 24 plists, 10 of them with a `StartCalendarInterval`, all ten the dict form.

## Tier 3 - quality, no deadline

Pick from this only when there is a reason to, not to tidy.

**Closed 2026-09-10:** every web directory is at 80% statements or above - five of the six were
the same gap, `api.ts` at 0% because each App test mocks it away, and the sixth was
`rolodex/pages`, whose calendar tests never reached a day tile; `server/src/crm/seed.ts` is
asserted on like the rolodex seed; and `breakEvenText`/`runLineText` moved into
`web/src/shared/controlling.ts`. Current figures are in [CONTROLS.md](./CONTROLS.md).

**Also closed 2026-09-10:** `findBy*` and `waitFor` now wait up to 5s (`web/src/test/setup.ts`)
instead of Testing Library's 1000ms, after a worker starved by a second vitest process failed a
`check` at the old default - a 37ms test that took 3.7s there. `web/src/test/setup.test.ts` fails
if the setting goes. And the lowest files the previous round found are covered:
`server/src/crm/routes.ts` 39.7% -> 100% through a route suite, `web/src/projekte/api.ts` and
`web/src/vault/api.ts` 0% -> 100%.

What remains:

- **The lowest files left sit inside directories that pass.** `web/src/rolodex/App.tsx` is at 0% on
  purpose: it is the route table and the sidebar, a unit test would have to mock every page's api
  for four statements, and e2e walks those routes already. `web/src/rolodex/api.ts` is at 39.5%
  despite having a suite - most of its endpoints are untested - and
  `web/src/vault/components/TreeFolder.tsx` at 53.3%. On the server nothing is under 77.8%.
- **Where a regression lands first now:** `web/src/rolodex/components/today` at exactly 80%
  statements, then `rolodex` 81.4%, `rolodex/components` 81.6%, `vault/components` 81.9%. On branches, `vault/components` (71.9%) and `rolodex/pages` (74.8%) sit under 80
  as directories; the threshold is per workspace, so neither fails.
- **Duplication is 4.66%, 173 clones.** Advisory, outside `npm run check`. The one named production
  duplicate is gone. Most of what this day added is deliberate test scaffolding: nine `api.test.ts`
  files each carry their own `mockFetch`, and `server/test/crm/app.ts` carries the same private
  empty contexts every other harness does. Consolidating the `mockFetch` copies would be one test
  helper for nine files.
- **The CRM shows nothing when a save fails.** Its forms call `api.put`/`api.post` inside a
  `void submit(e)` with no catch, so a rejected save leaves the modal open without a word; the
  pipeline sends its stage `PATCH` fire-and-forget and keeps the card where it was dropped even if
  the server refused. Pre-existing - the 404 fix only turned the console message from "Unexpected
  end of JSON input" into `PATCH /api/crm/deals/<id>/stage failed: 404`. Six call sites
  (`DealForm`, `ContactForm`, `OrganizationForm`, `ActivityTimeline`, `Dashboard`, `Pipeline`).
- **Requests from a website open in the same browser are not reviewed.** Binding to loopback
  closes the network; it does not stop a page in the user's own browser from sending requests to
  `localhost:8100` (CSRF), or a rebinding DNS name from reaching it. JSON-only bodies make most
  writes a CORS-preflighted request, which the server never approves - but nothing here checks an
  `Origin` or `Host` header, and bodiless POSTs (a projekte scan, a job kill) need no preflight.
  Worth a review of its own before Bench runs all day alongside ordinary browsing.
- **The first Projekte scan after a pause can take a minute and a half.** Measured 2026-09-10 on the
  real machine: 95s, then 1.3s for the next one. Neither the walk (66ms) nor git (0.6s) nor the
  `gh` counts (1.7s) explained it warm; `~/Documents`, one of the roots, is synced by iCloud, the
  probable cause. Not proven.
- **A lost `unlink` can leave a stale row in the vault index** under a burst of creates and deletes
  inside one `awaitWriteFinish` window. Pre-existing, found while verifying the watcher fix,
  cleared by the next `indexAll`; see [EXPLORATORY.md](../e2e/EXPLORATORY.md).

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
- **Merged branches stay** - ten local, 22 on GitHub. The user's call on 2026-09-10; `git branch -d`
  would refuse any unmerged one if that changes.
- **The three `repos:` entries naming folders without git stay uncoupled** (`pos-tag-backfill`,
  `machupicyou-sicherung`, `AI Machupicyou`). They surface as `missingRepos`, the same state
  `aend`'s four worktrees have always had. The user's call on 2026-09-10; a note with `path:`
  frontmatter (`couple.ts`) would bring them into Projekte.
- **Two handoffs carry no `repos:`** - `shoesplease-owala` and `shoesplease-adventskalender` name
  no working folder of their own, only the shared Shoes_Please_Studio session directory. The
  `/handoff` skill says a project without a repository leaves the key off, so this is correct
  rather than missing.
- **CRM and Rolodex keep their sample data, and re-seed whenever their main table is empty.**
  Both are the original apps, not Bench OS ones, and the user does not use them - the user's call
  on 2026-09-10. Anyone who starts to has to change that first: deleting the samples by hand only
  brings them back at the next start, possibly mixed with real records. `isSeeded` in
  `server/src/crm/seed.ts` and `seedIfEmpty` in `server/src/rolodex/seed.ts` are the two places.
- **Small formatters are copied per app on purpose** - `dateText` lives in five apps, and each api
  client carries its own `get`. A document may not import from a sibling app, and these only
  render. `web/src/shared/controlling.ts` is the exception because it encodes the controlling
  skill's rules rather than formatting; see [PROJECT.md](./PROJECT.md).

## Tier 5 - hygiene, whenever

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
