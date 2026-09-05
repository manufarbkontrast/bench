/** The Unzugeordnet tab's Plaud half: the dedup hint, importing a row into the suggested
    target, the ledger surviving a reload, and the Issues tab's off-mode message. */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures";

const HAFENRUNDE_TITLE = "08-20 Besprechung: Hafenrunde und Leuchtturm-Ausbau";
const ROW4_WAS = "Die Werkstatt für den Winter vorbereiten";

/** The Hafenrunde note's own card, scoped by title rather than the bare `.aufgaben-plaud-note`
    class - the fixture has only one Plaud note today, but this stops a second one from now on
    silently leaking its rows into these assertions. */
function hafenrundeCard(page: Page): Locator {
  return page
    .locator("article.aufgaben-plaud-note")
    .filter({ hasText: "Hafenrunde" });
}

/** Import row 4 unless a previous attempt already landed it: once the ledger has the row, the
    button is replaced by the "Übernommen" link, so a retry finds nothing to click. */
async function importIfNeeded(row: Locator): Promise<void> {
  const button = row.getByRole("button", {
    name: `In Vault übernehmen: ${ROW4_WAS}`,
  });
  if (await button.isVisible()) await button.click();
}

test("importing an unmatched Plaud row files it under the suggested target, and the ledger survives a reload", async ({
  page,
  vaultDir,
}) => {
  await page.goto("/aufgaben/");
  await page.getByRole("button", { name: "Unzugeordnet", exact: true }).click();

  const card = hafenrundeCard(page);
  await expect(
    card.getByRole("heading", { name: HAFENRUNDE_TITLE }),
  ).toBeVisible();

  const rows = card.locator("tbody tr");
  await expect(rows).toHaveCount(4);
  // Row 1's "Was" overlaps the vault's own "Spezifikation schreiben" task - the dedup hint names it.
  await expect(rows.nth(0)).toContainText("Ähnliche Aufgabe vorhanden:");

  const row4 = rows.nth(3);
  await expect(row4).toContainText(ROW4_WAS);
  await importIfNeeded(row4);
  await expect(row4.getByRole("link", { name: "Übernommen" })).toBeVisible();

  const text = readFileSync(
    path.join(vaultDir, "00_Index", "Task_Inbox.md"),
    "utf8",
  );
  // Retry-safe as "exactly one": a second import of the same row is blocked by the ledger (409),
  // caught by the UI as already-imported rather than appended again.
  const matches = text
    .split("\n")
    .filter(
      (l) =>
        l.includes(ROW4_WAS) && l.endsWith("(aus [[2026-08-20_hafenrunde]])"),
    );
  expect(matches).toHaveLength(1);

  await page.reload();
  await page.getByRole("button", { name: "Unzugeordnet", exact: true }).click();
  await expect(
    hafenrundeCard(page)
      .locator("tbody tr")
      .nth(3)
      .getByRole("link", { name: "Übernommen" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Issues", exact: true }).click();
  await expect(
    page.getByText("GitHub-Abfrage ist ausgeschaltet."),
  ).toBeVisible();
});
