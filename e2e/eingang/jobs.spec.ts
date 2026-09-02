/** Eingang's Jobs panel over the fake runner: an internal job that settles to Fertig with a log
    to open, a spawned one cancelled mid-run whose log stays open through the cancel, and the
    double-start guard that refuses a second Einsammeln while one is already running. */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures";

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
  // write that "Abgebrochen" above just waited for, so this first click is a clean 201 and the
  // fake's three-second sleep means the very next click deterministically lands inside it.
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
