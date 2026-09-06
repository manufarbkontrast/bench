/**
 * The scanned sample workshop in table view: a duplicate pair sharing one origin (dirty and ahead
 * on one side, behind on the other), a repo with no remote, and gh switched off. See
 * server/src/projekte/sample.ts for exactly what git state each row reflects.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures";

/** ProjectsTable.tsx's HEADERS order - Issues is the 7th column, index 6. */
const ISSUES_COLUMN = 6;

// leuchtfeuer is a substring of leuchtfeuer-alt, so matching by row-name would be ambiguous;
// the project-name button's own text is exactly the project name, unlike the row's full text.
function rowFor(page: Page, name: string): Locator {
  return page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
}

test("lists the sample workshop with each row's git and duplicate state", async ({
  page,
}) => {
  await page.goto("/projekte/");
  // Projekte is the default view now (Task 4); this spec exercises the table specifically.
  await page.getByRole("button", { name: "Tabelle", exact: true }).click();

  const leuchtfeuer = rowFor(page, "leuchtfeuer");
  // Generous: a fresh worker's first list fetch also builds and scans the sample workshop, which
  // shells out to git several times, before any row exists - the house pattern from
  // smoke.spec.ts's projekte addition.
  await expect(leuchtfeuer).toBeVisible({ timeout: 20_000 });

  const leuchtfeuerAlt = rowFor(page, "leuchtfeuer-alt");
  const treibgut = rowFor(page, "treibgut");
  await expect(leuchtfeuerAlt).toBeVisible();
  await expect(treibgut).toBeVisible();

  await expect(leuchtfeuer).toContainText("1 geändert · 1 voraus");
  await expect(
    leuchtfeuer.getByText("Dublette", { exact: true }),
  ).toBeVisible();

  await expect(
    treibgut.getByText("Kein Remote", { exact: true }),
  ).toBeVisible();

  // gh is off for the whole worker, so every row's Issues cell reads the em dash rather than a
  // count - checked across all three named rows, not just one.
  for (const row of [leuchtfeuer, leuchtfeuerAlt, treibgut]) {
    await expect(row.getByRole("cell").nth(ISSUES_COLUMN)).toHaveText("—");
  }
});
