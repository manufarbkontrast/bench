/** The Cockpit's seven panels: what each surfaces from the vault's tasks, the session note and
    the projekte scan. */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const HEADINGS = [
  "Überfällig",
  "Diese Woche",
  "Eingang",
  "Projekte in Bewegung",
  "Hier weitermachen",
  "Zahlen",
  "Zuletzt erledigt",
];

/** The one `.home-panel` section carrying this heading - panels carry no accessible name of
    their own, so this is what scopes an assertion to one of the seven. */
function panel(page: Page, heading: string) {
  return page.locator("section.home-panel").filter({
    has: page.getByRole("heading", { name: heading, exact: true }),
  });
}

test("the Cockpit surfaces overdue tasks, the session note and moving projects", async ({
  page,
}) => {
  // The Cockpit reads GET /api/projekte/stand (Task 5 of the projektstand change), which
  // deliberately never scans - unlike /list, which the Cockpit called before and which the table
  // and board views still call on first visit. Scan directly first, so this test does not depend
  // on some other spec having scanned the sample workshop in this worker already.
  await page.request.post("/api/projekte/scan");
  await page.goto("/");

  for (const heading of HEADINGS) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }

  await expect(
    panel(page, "Überfällig").getByText("Prototyp bauen"),
  ).toBeVisible();

  // The sample eingang fixture (server/src/eingang/fixture/inbox) has three files: the
  // werkstattrunde transcript and the m4a recording are unprocessed, the Hafenrunde transcript
  // reconciles to a note - see server/test/eingang/routes.test.ts for the same derivation.
  const eingang = panel(page, "Eingang");
  await expect(eingang.getByText("2 unverarbeitet")).toBeVisible();
  await expect(
    eingang.getByRole("link", { name: "Verarbeiten" }),
  ).toHaveAttribute("href", "/eingang/");

  const session = panel(page, "Hier weitermachen");
  await expect(session.getByText(/Der Leuchtturm-Prototyp/)).toBeVisible();

  // The sample world's controlling dir is the eingang fixture (server/src/eingang/fixture/
  // controlling - see locateEingang), whose letzter-lauf.json names 2026-08-15-zwischenstand as
  // the last run. That folder's zusammenfassung.md carries the KPI table
  // `| Umsatz gesamt | 51.200 € | 54.300 € | +6,1 % |` and one break-even bullet for "Sommeraktion
  // Nord" - so the panel's Umsatz-gesamt line reads its Aktuell cell, and the break-even line
  // counts that one bullet rather than reading "keine".
  const zahlen = panel(page, "Zahlen");
  await expect(zahlen.getByText("Zwischenstand vom 15.08.2026")).toBeVisible();
  await expect(zahlen.getByText("Umsatz gesamt: 54.300 €")).toBeVisible();
  await expect(zahlen.getByText("Kampagnen unter Break-even: 1")).toBeVisible();
  await expect(
    zahlen.getByRole("link", { name: "Zur Zahlen-App" }),
  ).toHaveAttribute("href", "/zahlen/");

  await expect(
    panel(page, "Projekte in Bewegung").getByText("leuchtfeuer", {
      exact: true,
    }),
  ).toBeVisible();

  const link = session.getByRole("link", { name: "Im Vault öffnen" });
  await expect(link).toHaveAttribute(
    "href",
    "/vault/n/00_Index/Session_Context.md",
  );
  await link.click();
  await expect(
    page.getByRole("heading", { name: "Session-Kontext", level: 1 }),
  ).toBeVisible();
});
