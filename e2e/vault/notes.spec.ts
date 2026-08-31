import { test, expect } from "../fixtures";

test("the tree opens a note, wikilinks navigate, backlinks list the referrers", async ({
  page,
}) => {
  await page.goto("/vault/");
  await expect(
    page.getByRole("heading", { name: "Start", level: 1 }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Projekt Leuchtturm" }).click();
  await expect(page).toHaveURL(
    /\/vault\/n\/30_Projekte\/Leuchtturm\/Leuchtturm\.md$/,
  );
  await expect(
    page.getByRole("heading", { name: "Leuchtturm", level: 1 }),
  ).toBeVisible();
  // The project's folder and its main note are both called "Leuchtturm" - only a note row omits
  // aria-expanded, which a folder row always carries, so that is what tells the two apart.
  const leuchtturmNote = page
    .getByRole("treeitem", { name: "Leuchtturm" })
    .and(page.locator(":not([aria-expanded])"));
  await expect(leuchtturmNote).toHaveAttribute("aria-selected", "true");

  const backlinks = page.getByRole("region", {
    name: "Verweise auf diese Notiz",
  });
  await expect(backlinks.getByRole("link", { name: "Stack" })).toBeVisible();
  await backlinks.getByRole("link", { name: "Stack" }).click();
  await expect(
    page.getByRole("heading", { name: "Stack", level: 1 }),
  ).toBeVisible();
});

test("a dangling link is text, the raw view shows the source, and Obsidian gets a link", async ({
  page,
}) => {
  await page.goto("/vault/n/00_Index/Start.md");
  await expect(
    page.getByRole("heading", { name: "Start", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Nicht vorhanden" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Nicht vorhanden - ein Link ins Leere"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Rohtext" }).click();
  await expect(page.getByText("[[Nicht vorhanden]]")).toBeVisible();
  await page.getByRole("button", { name: "Ansicht" }).click();

  await expect(
    page.getByRole("link", { name: "In Obsidian öffnen" }),
  ).toHaveAttribute(
    "href",
    "obsidian://open?vault=vault&file=00_Index%2FStart",
  );
});

test("a relative image is served from the vault", async ({ page }) => {
  await page.goto("/vault/n/20_Brands/Nordlicht.md");
  const img = page.getByRole("img", { name: "Skizze" });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute(
    "src",
    "/api/vault/file?path=assets%2Fskizze.svg",
  );
});
