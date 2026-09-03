/**
 * The Zahlen app against the extended eingang controlling fixture
 * (server/src/eingang/fixture/controlling): two run folders, the newest carrying a full report,
 * the older one only a zusammenfassung.md. Every route it reads is read-only - selecting an
 * archived run is a GET against the same static files every time - so every test here is
 * trivially retry-safe: a Playwright retry re-runs the same navigation against the exact same
 * fixture files.
 */
import { test, expect } from "../fixtures";

test("the last run shows its stichtag, the Umsatz-gesamt KPI row and the Bericht iframe", async ({
  page,
}) => {
  await page.goto("/zahlen/");

  for (const heading of [
    "Letzter Lauf",
    "Archiv",
    "Bericht",
    "Zusammenfassung",
    "myCrafton",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }

  // letzter-lauf.json points at 2026-08-15-zwischenstand
  // (server/src/eingang/fixture/controlling/letzter-lauf.json), so that is the run
  // /api/zahlen/last resolves to on first load. Scoped to the run-line paragraph itself: the
  // August archive button below carries the identical text, and an unscoped text lookup would
  // match both.
  await expect(page.locator(".zahlen-run-line")).toHaveText(
    "Zwischenstand vom 15.08.2026",
  );

  const umsatzRow = page.getByRole("row").filter({ hasText: "Umsatz gesamt" });
  await expect(umsatzRow).toContainText("54.300 €");

  await expect(page.getByTitle("Bericht")).toBeVisible();

  // MYCRAFTON_URL is "" for every e2e worker (see e2e/fixtures.ts), so the deep-links panel
  // always reports unconfigured, independent of which run is selected.
  await expect(
    page.getByText("Nicht konfiguriert.", { exact: true }),
  ).toBeVisible();
});

test("the archive lists both runs and clicking the July one swaps the run line and the Zusammenfassung", async ({
  page,
}) => {
  await page.goto("/zahlen/");

  const archiv = page.locator(".zahlen-archive-list");
  await expect(archiv.getByRole("button")).toHaveCount(2);

  const augustBtn = page.getByRole("button", {
    name: "Zwischenstand vom 15.08.2026",
    exact: true,
  });
  const julyBtn = page.getByRole("button", {
    name: "Zwischenstand vom 15.07.2026",
    exact: true,
  });
  await expect(augustBtn).toHaveAttribute("aria-pressed", "true");
  await expect(julyBtn).toHaveAttribute("aria-pressed", "false");

  await julyBtn.click();

  await expect(page.locator(".zahlen-run-line")).toHaveText(
    "Zwischenstand vom 15.07.2026",
  );
  // The July folder carries only a zusammenfassung.md - no bericht.html, no rohdaten.json (see
  // server/src/eingang/fixture/controlling/2026-07-15-zwischenstand) - so its own summary text is
  // the reliable signal that the view actually swapped: the KPI table has no rows for July either
  // way, empty being both "swapped to a table-less run" and "still on the old one" alike.
  await expect(page.locator(".zahlen-md")).toContainText(
    "Der Umsatz lag bei 48.900 Euro",
  );

  await expect(julyBtn).toHaveAttribute("aria-pressed", "true");
  await expect(augustBtn).toHaveAttribute("aria-pressed", "false");

  // The Bericht section is keyed on current.run !== null, not on the file's existence, so the
  // iframe stays present even though July has no bericht.html of its own to show inside it.
  await expect(page.getByTitle("Bericht")).toBeVisible();
});
