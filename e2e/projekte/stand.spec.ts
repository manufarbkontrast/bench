/**
 * The Projekte view (the default view since Task 4): the fixture vault's two handoff notes
 * against the scanned sample workshop. e2e/fixtures.ts rewrites Handoff_leuchtturm.md's repos
 * entry to this worker's own leuchtfeuer checkout after copying the fixture, so leuchtturm's
 * card couples to a real, scanned repo; Handoff_hafen.md names no repos at all.
 */
import { test, expect } from "../fixtures";

test("the Projekte view opens by default, shows the coupled handoff and leaves the rest in Ohne Projekt", async ({
  page,
}) => {
  await page.goto("/projekte/");

  await expect(
    page.getByRole("button", { name: "Projekte", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Generous: a fresh worker's first list fetch also builds and scans the sample workshop, which
  // shells out to git several times, before any handoff can couple to a repo - the house pattern
  // from smoke.spec.ts's projekte addition.
  //
  // A project is named by its slug (server/src/projekte/handoffs.ts) - the card's heading is
  // "leuchtturm", not the handoff note's own H1, which renders as the subtitle beneath it.
  const leuchtturmHeading = page.getByRole("heading", {
    name: "leuchtturm",
    exact: true,
  });
  await expect(leuchtturmHeading).toBeVisible({ timeout: 20_000 });

  const leuchtturmCard = page
    .locator("article.projekte-stand-card")
    .filter({ has: leuchtturmHeading });
  await expect(leuchtturmCard.locator(".projekte-stand-subtitle")).toHaveText(
    "Handoff: Leuchtturm",
  );
  await expect(leuchtturmCard).toContainText("Stand veraltet");
  await expect(leuchtturmCard.locator("pre.projekte-stand-text")).toHaveText(
    "Der Leuchtturm steht; die Lampe ist bestellt.",
  );
  // The fixture Leuchtturm.md holds six checkboxes, five open (lines 8, 9, 10, 11, 13 in the
  // committed frontmatter+body) and one done (Kickoff halten, line 12) - re-count here if the
  // note changes.
  await expect(
    leuchtturmCard.locator("li.projekte-badge", {
      hasText: "5 offene Aufgaben",
    }),
  ).toBeVisible();
  await expect(
    leuchtturmCard.getByRole("link", { name: "Handoff im Vault", exact: true }),
  ).toHaveAttribute(
    "href",
    "/vault/n/50_Workflow/Handoffs/Handoff_leuchtturm.md",
  );

  const repoButton = leuchtturmCard.getByRole("button", {
    name: "leuchtfeuer",
    exact: true,
  });
  await expect(repoButton).toBeVisible();
  await repoButton.click();
  await expect(
    page.getByRole("complementary", { name: "Details zu leuchtfeuer" }),
  ).toBeVisible();

  const hafenHeading = page.getByRole("heading", {
    name: "hafen",
    exact: true,
  });
  const hafenCard = page
    .locator("article.projekte-stand-card")
    .filter({ has: hafenHeading });
  await expect(hafenCard.locator(".projekte-stand-subtitle")).toHaveText(
    "Handoff: Hafen",
  );
  await expect(hafenCard).not.toContainText("Stand veraltet");
  await expect(hafenCard.getByRole("button")).toHaveCount(0);

  const rest = page.locator("section.projekte-stand-rest");
  await expect(
    rest.getByRole("heading", { name: "Ohne Projekt", exact: true }),
  ).toBeVisible();
  await expect(
    rest.getByRole("button", { name: "treibgut", exact: true }),
  ).toBeVisible();
  await expect(
    rest.getByRole("button", { name: "leuchtfeuer", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Tabelle", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tabelle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table")).toBeVisible();
});
