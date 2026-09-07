/** Eingang's Jobs panel over the fake runner: an internal job that settles to Fertig with a log
    to open, a spawned one cancelled mid-run whose log stays open through the cancel, the
    double-start guard that refuses a second Einsammeln while one is already running, and two
    restart-orphaned rows seeded straight into the database - one whose process is genuinely alive
    and killed by the click, one whose process is gone and settled by it. */
import type { Locator, Page } from "@playwright/test";
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures";

// e2e/eingang/jobs.spec.ts -> repo root, the same two levels up ../fixtures.ts's own `root` uses
// from e2e/fixtures.ts - kept local rather than exported from fixtures.ts, since only this one
// orphan case needs to reach past the API and write the worker's database directly.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The Jobs table's own row for a given "Protokoll: <label>" button, newest first (started_at
    desc, matching server/src/eingang/db.ts's listJobs) - `.first()` is the row a start just
    produced, safe under a same-worker retry where earlier runs left rows of the same kind
    behind, since a fresh start is always the newest of its kind by construction. */
function jobRow(page: Page, protokollName: string): Locator {
  return page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: protokollName, exact: true }),
    })
    .first();
}

test("starting Vault neu indexieren reaches Fertig without a reload, and its log shows the reindex line", async ({
  page,
}) => {
  await page.goto("/eingang/");
  await page
    .getByRole("button", { name: "Vault neu indexieren", exact: true })
    .click();

  const row = jobRow(page, "Protokoll: Vault-Reindex");
  // The app only refetches the Jobs table right after a start or a kill - there is no periodic
  // re-poll of it - so whichever of the two states that one post-start refetch lands on is what
  // the row shows from here. vault-reindex runs in-process and settles fast enough that either
  // is a legitimate catch; the row appearing at all, without a page reload, is what this proves.
  await expect(row).toContainText(/Läuft|Fertig/);

  await row
    .getByRole("button", { name: "Protokoll: Vault-Reindex", exact: true })
    .click();
  // LogView fetches once on mount and, since vault-reindex has usually already finished by the
  // time that snapshot is taken, never looks again (see its effect: no "running" status means no
  // 2s poll is set up) - so this is a single in-flight request settling, not a job still working.
  // A closed-then-reopened panel would only make this worse: unmounting cancels that one fetch's
  // effect before it can call setLog, so the very thing meant to retry would just discard the
  // answer every time. Generous timeout: under a loaded machine the one response can take a while.
  await expect(page.getByRole("region", { name: "Protokoll" })).toContainText(
    "indexed",
    { timeout: 15_000 },
  );
});

test("cancelling Einsammeln while it runs reaches Abgebrochen with its log still open, then a second start while one is running is refused", async ({
  page,
}) => {
  await page.goto("/eingang/");
  const startEinsammeln = page.getByRole("button", {
    name: "Einsammeln",
    exact: true,
  });

  await startEinsammeln.click();
  const row = jobRow(page, "Protokoll: Einsammeln");
  // The fake job logs one line a second for three ticks before it exits, so it is still running
  // for several seconds from here - no wait is needed to observe it mid-run.
  await expect(row).toContainText("Läuft");

  await row
    .getByRole("button", { name: "Protokoll: Einsammeln", exact: true })
    .click();
  const logPanel = page.getByRole("region", { name: "Protokoll" });
  await expect(logPanel).toContainText("fake-job start plaud-sync");

  await row.getByRole("button", { name: "Abbrechen", exact: true }).click();

  // kill() only sends SIGTERM and answers before the child's own close event settles the row, and
  // the Jobs table has no timer of its own to catch that later - clicking Abbrechen again while it
  // is still shown as running re-triggers the same refetch handleKill always does after a kill
  // attempt (success, or the 409 once the job has already ended), which is what eventually shows
  // the terminal status. The click carries its own short timeout and swallows a failure: once the
  // row does flip, the button is gone for good, and an unbounded click would then hang for the
  // rest of the test waiting on an element that will never come back, instead of letting the poll
  // read the row's now-terminal text on its next turn.
  await expect
    .poll(
      async () => {
        await row
          .getByRole("button", { name: "Abbrechen", exact: true })
          .click({ timeout: 1000 })
          .catch(() => undefined);
        return (await row.textContent()) ?? "";
      },
      { timeout: 10_000 },
    )
    .toContain("Abgebrochen");
  await expect(logPanel).toBeVisible();

  // The cancelled job is fully terminal now - runner.finish() clears isRunning() before the DB
  // write that "Abgebrochen" above just waited for, so this first click is a clean 201. The
  // second click landing inside the guard is not a race against the fake job's three-second
  // runtime: POST /jobs is a synchronous Express handler, and Node's run-to-completion guarantee
  // means the second request's isRunning() check cannot interleave with the first request
  // registering the job as running, however close together the two clicks land.
  await startEinsammeln.click();
  await startEinsammeln.click();
  await expect(page.getByText("Läuft bereits.")).toBeVisible();

  // This second Einsammeln is still running and the test ends here otherwise - on a same-worker
  // retry, the very next test to touch this same kind would find plaud-sync still occupied and
  // get its own start refused, rather than the clean run it expects. Waiting it out to Fertig is
  // what actually guarantees that, not the accident of another test's runtime filling the gap.
  // Vault neu indexieren is a different kind entirely - it only serves here as a harmless, fast
  // poke to force the refetch the Jobs table has no timer of its own to do.
  const job2Row = jobRow(page, "Protokoll: Einsammeln");
  const vaultPoke = page.getByRole("button", {
    name: "Vault neu indexieren",
    exact: true,
  });
  await expect
    .poll(
      async () => {
        await vaultPoke.click();
        return (await job2Row.textContent()) ?? "";
      },
      { timeout: 10_000 },
    )
    .toContain("Fertig");
});

/** Writes a `running` job row straight into this worker's own database. This worker's server never
    called runner.start() for it, so it is absent from the in-flight map on the very first
    GET /jobs - exactly the restart-orphan shape decision 2 defines, without an actual restart.
    `modus` names the row in the table, as `Controlling (<modus>)`. */
function seedOrphanRow(
  workerIndex: number,
  modus: string,
  startedAt: number,
  pid: number,
): void {
  const workerDir = path.join(
    repoRoot,
    "e2e",
    ".tmp",
    `w${String(workerIndex)}`,
  );
  const db = new Database(path.join(workerDir, "eingang.sqlite"));
  try {
    db.prepare(
      `INSERT INTO jobs (kind, args_json, status, started_at, log_path, pid)
       VALUES (?, ?, 'running', ?, ?, ?)`,
    ).run(
      "controlling",
      JSON.stringify({ modus }),
      startedAt,
      path.join(workerDir, "eingang-jobs", `${modus}.log`),
      pid,
    );
  } finally {
    db.close();
  }
}

test("a restart-orphaned row renders as verwaist with its kill button", async ({
  page,
}, testInfo) => {
  // Stands in for a real spawned child that survived a server restart - genuinely alive, so
  // alive.ts's isOurProcess (read through ps) confirms it rather than a fabricated pid a real
  // reconciliation would already have reconciled to "failed". started_at is taken BEFORE the
  // spawn, the runner's own ordering (start() records startedAt and then spawns): ps truncates
  // the fork to a whole second, so the reported start can read up to the one second alive.ts
  // tolerates below started_at and never above it. Taken after the spawn instead, the reading can
  // land past that tolerance and the row stops being verwaist.
  const startedAt = Date.now();
  const child = spawn("sleep", ["60"], { stdio: "ignore" });
  // pid is undefined only when the spawn itself failed synchronously - not a case a local
  // `sleep` hits, and the INSERT below would throw on binding undefined rather than silently
  // writing a bad pid, so this stays a plain assertion rather than a guard clause.
  const pid = child.pid!;

  try {
    seedOrphanRow(testInfo.workerIndex, "e2e-verwaist", startedAt, pid);

    await page.goto("/eingang/");
    const row = jobRow(page, "Protokoll: Controlling (e2e-verwaist)");
    await expect(row).toContainText("Verwaist");
    const kill = row.getByRole("button", { name: "Abbrechen", exact: true });
    await expect(kill).toBeVisible();

    // The kill fallback for an orphan (runner.ts's kill()) verifies the pid and finishes the row
    // synchronously in the same request, unlike the in-process path's async close event - so one
    // click and the refetch App.tsx always runs after is enough, no poll needed.
    await kill.click();
    await expect(row).toContainText("Abgebrochen");
  } finally {
    // Whatever the assertions above did to the row, the real OS process still needs to go -
    // SIGKILL rather than relying on the click above having reached it, since a failed assertion
    // means that line may never have run.
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone - the click above already reached it, or it exited on its own.
    }
  }
});

test("an orphan whose process is gone is settled by the same kill button", async ({
  page,
}, testInfo) => {
  // A pid past any pid_max - macOS caps at 99999, Linux defaults to 4194304 - so `ps` can never
  // find it and isOurProcess answers false without a signal ever being sent. That is the shape an
  // orphan takes once its process has exited on its own, which is what a job does: boot
  // reconciliation confirmed it alive, and nothing reclassifies it afterwards.
  seedOrphanRow(testInfo.workerIndex, "e2e-tot", Date.now(), 999_999_999);

  await page.goto("/eingang/");
  const row = jobRow(page, "Protokoll: Controlling (e2e-tot)");
  await expect(row).toContainText("Verwaist");

  // The escape hatch. reconcileRunning runs at boot and nowhere else, so a row left "running" here
  // would refuse every later Controlling start for the life of the server. kill() reaches
  // reconcileRunning's own verdict from the same evidence and writes it in the same request; the
  // response is a 409, and App.tsx refetches after a kill either way, so the row shows what that
  // request just wrote.
  await row.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(row).toContainText("Fehlgeschlagen");
});
