/**
 * The board view over the same uncoupled sample: no note in the fixture vault points at any of
 * its checkouts, so every project sits in the one Ohne Marke section, Unzugeordnet column - and a
 * card opens the same detail table.spec.ts exercises from the table.
 */
import { test, expect } from "../fixtures";

test("groups the uncoupled sample under one section and column, and a card opens its detail", async ({
  page,
}) => {
  await page.goto("/projekte/");
  // Generous, and asserted before switching view: this spec cannot assume table.spec ran first in
  // this worker, so the first row still has to survive the lazy first-visit scan of a fresh
  // worker's sample workshop.
  await expect(
    page.getByRole("button", { name: "leuchtfeuer", exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Board", exact: true }).click();

  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 2, name: "Ohne Marke", exact: true }),
  ).toBeVisible();

  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Unzugeordnet",
      exact: true,
    }),
  ).toBeVisible();

  // The card's accessible name is its name plus delta plus badges concatenated, so a plain
  // role/name lookup for "leuchtfeuer" would also match "leuchtfeuer-alt" by substring; the card
  // name span's own text is exactly the project name, so exact:true on it is unambiguous.
  await page.getByText("leuchtfeuer", { exact: true }).click();

  const detail = page.getByRole("complementary", {
    name: "Details zu leuchtfeuer",
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".projekte-detail-duplicates")).toContainText(
    "leuchtfeuer-alt",
  );

  await detail.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(detail).toBeHidden();
});
