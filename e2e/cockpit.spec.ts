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

  // Generous: a fresh worker's first read of /api/projekte/list can trigger the same lazy scan
  // of the sample workshop as /projekte/'s own first visit, which shells out to git several
  // times before any row exists - see smoke.spec.ts and projekte/scan.spec.ts for the same 20s
  // wait on that call.
  await expect(
    panel(page, "Projekte in Bewegung").getByText("leuchtfeuer", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20_000 });

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
