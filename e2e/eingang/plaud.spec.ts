/** The Plaud-Aufnahmen panel over the sample listing: three recordings with three marks, Holen on
    the new one reaching Fertig through the sample fetch that writes nothing, and Verarbeiten
    carrying the chosen project into the job's label. */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures";

function jobRow(page: Page, protokollName: string): Locator {
  return page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: protokollName, exact: true }),
    })
    .first();
}

test("the panel marks the three sample recordings, fetches the new one and processes with a project", async ({
  page,
}) => {
  await page.goto("/eingang/");
  const panel = page.getByRole("region", { name: "Plaud-Aufnahmen" });
  await expect(panel).toContainText("Beispieldaten");

  const lampe = panel
    .getByRole("listitem")
    .filter({ hasText: "Lampe für den Leuchtturm" });
  await expect(lampe).toContainText("Neu");
  const werft = panel
    .getByRole("listitem")
    .filter({ hasText: "Werftbegehung" });
  await expect(werft).toContainText("Im Eingang");
  await expect(
    werft.getByRole("button", { name: "Holen: Werftbegehung", exact: true }),
  ).toBeDisabled();
  const hafen = panel
    .getByRole("listitem")
    .filter({ hasText: "Hafenrunde und Leuchtturm-Ausbau" });
  await expect(hafen).toContainText("Notiz vorhanden");

  await lampe
    .getByRole("button", {
      name: "Holen: Lampe für den Leuchtturm",
      exact: true,
    })
    .click();
  const fetchRow = jobRow(page, "Protokoll: Holen: fix-lampe-0901");
  await expect(fetchRow).toContainText(/Läuft|Fertig/);
  await fetchRow
    .getByRole("button", {
      name: "Protokoll: Holen: fix-lampe-0901",
      exact: true,
    })
    .click();
  await expect(page.getByRole("region", { name: "Protokoll" })).toContainText(
    "sample world: nothing written",
    { timeout: 15_000 },
  );

  const file = page
    .getByRole("listitem")
    .filter({ hasText: "2026-08-25_werftbegehung-transkript.md" });
  await file
    .getByLabel("Projekt: 2026-08-25_werftbegehung-transkript.md")
    .selectOption("leuchtturm");
  await file
    .getByRole("button", {
      name: "Verarbeiten: 2026-08-25_werftbegehung-transkript.md",
      exact: true,
    })
    .click();
  const processRow = jobRow(
    page,
    "Protokoll: Verarbeiten: 2026-08-25_werftbegehung-transkript.md (leuchtturm)",
  );
  await expect(processRow).toContainText(/Läuft|Fertig/);

  // The fake job runs three seconds; a same-worker retry would otherwise find plaud-process
  // still occupied and get its own start refused - the same wait jobs.spec.ts ends on.
  const vaultPoke = page.getByRole("button", {
    name: "Vault neu indexieren",
    exact: true,
  });
  await expect
    .poll(
      async () => {
        await vaultPoke.click();
        return (await processRow.textContent()) ?? "";
      },
      { timeout: 10_000 },
    )
    .toContain("Fertig");
});
