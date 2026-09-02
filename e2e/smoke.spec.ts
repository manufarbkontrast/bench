/**
 * The consolidation seams: four HTML entry points (the launcher plus the three apps), two
 * router basenames, two API namespaces and deep-link fallback. These are what the merge
 * introduced, so they are what regresses.
 */
import { test, expect } from "./fixtures";
import { json, type Organization } from "./api";
import type { Locator, Page } from "@playwright/test";

/**
 * `ready` is something each app only renders once it has actually mounted and fetched, which is
 * what the console-error check needs to wait for. A load state would pass before any of that.
 */
const APPS: {
  path: string;
  title: string;
  tab: string;
  ready: (page: Page) => Locator;
}[] = [
  {
    path: "/",
    title: "Bench",
    tab: "Start",
    // The Cockpit's panel headings render on mount, before any of its three fetches - including
    // the projekte list, which can itself trigger the same lazy scan as /projekte/ below -
    // resolve, so this needs no extra wait despite sharing that slow first call.
    ready: (p) => p.getByRole("heading", { name: "Überfällig" }),
  },
  {
    path: "/vault/",
    title: "Vault",
    tab: "Vault",
    ready: (p) => p.getByRole("treeitem").first(),
  },
  {
    path: "/projekte/",
    title: "Projekte",
    tab: "Projekte",
    // The first visit to a fresh worker database triggers a lazy scan of the sample workshop,
    // which shells out to git several times and can take longer than the default 5s expect
    // timeout - waited for at the call site instead of here.
    ready: (p) => p.locator(".projekte-table tbody tr").first(),
  },
  {
    path: "/aufgaben/",
    title: "Aufgaben",
    tab: "Aufgaben",
    ready: (p) => p.getByRole("button", { name: "Heute" }),
  },
  {
    path: "/eingang/",
    title: "Eingang",
    tab: "Eingang",
    ready: (p) => p.getByRole("heading", { name: "Neu und unverarbeitet" }),
  },
  {
    path: "/crm/",
    title: "Personal CRM",
    tab: "CRM",
    ready: (p) => p.getByTestId("dash-total"),
  },
  {
    path: "/rolodex/",
    title: "Rolodex",
    tab: "Rolodex",
    ready: (p) => p.getByRole("heading", { name: "Today" }),
  },
];

/** The one nav strip. Named, because every app has a second unnamed nav of its own. */
const primary = (page: Page) =>
  page.getByRole("navigation", { name: "Primary" });

/** The Cockpit's slim app row - named too, since it carries a link of the same name as the
    strip's own tab for every app but Start. */
const appRow = (page: Page) => page.getByRole("navigation", { name: "Apps" });

/** Collect console and page errors for the lifetime of a page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("every app serves its own document from its own entry point", async ({
  page,
}) => {
  for (const app of APPS) {
    await page.goto(app.path);
    await expect(page).toHaveTitle(app.title);
  }
});

test("deep links load the owning app, not the launcher", async ({ page }) => {
  // Without per-prefix fallback these serve the launcher and the app never boots.
  for (const [path, title] of [
    ["/crm/contacts", "Personal CRM"],
    ["/crm/pipeline", "Personal CRM"],
    ["/rolodex/people", "Rolodex"],
    ["/rolodex/circles", "Rolodex"],
    ["/vault/n/anything", "Vault"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
  }
});

test("a refreshed deep link keeps the app mounted under its basename", async ({
  page,
}) => {
  await page.goto("/crm/contacts");
  await expect(
    page.getByRole("heading", { name: /Contacts/i }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Contacts/i }).first(),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/crm/contacts");
});

test("both API namespaces answer and stay separate", async ({
  page,
  baseURL,
}) => {
  const orgs = await page.request.get(`${baseURL}/api/crm/organizations`);
  expect(orgs.ok()).toBeTruthy();
  expect((await json<Organization[]>(orgs)).length).toBeGreaterThan(0);

  const people = await page.request.get(`${baseURL}/api/rolodex/people`);
  expect(people.ok()).toBeTruthy();
  expect((await json<{ id: number }[]>(people)).length).toBeGreaterThan(0);

  const vault = await page.request.get(`${baseURL}/api/vault/tree`);
  expect(vault.ok()).toBeTruthy();
  expect((await json<{ path: string }[]>(vault)).length).toBeGreaterThan(0);

  // The pre-merge, un-namespaced paths must not resolve.
  expect(
    (await page.request.get(`${baseURL}/api/organizations`)).status(),
  ).toBe(404);
  expect((await page.request.get(`${baseURL}/api/people`)).status()).toBe(404);
});

test("the start page links into each app and the back button returns", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Vault",
    "Projekte",
    "Aufgaben",
    "Eingang",
    "CRM",
    "Rolodex",
  ]) {
    await appRow(page).getByRole("link", { name }).click();
    await expect(page).not.toHaveTitle("Bench");
    await page.goBack();
    await expect(page).toHaveTitle("Bench");
  }
});

test("each app boots without console errors", async ({ page }) => {
  for (const app of APPS) {
    const errors = watchErrors(page);
    await page.goto(app.path);
    // Generous: /projekte/'s first visit per worker scans the sample workshop before it has rows.
    await expect(app.ready(page)).toBeVisible({ timeout: 20_000 });
    expect(errors, `${app.path} logged errors`).toEqual([]);
  }
});

test("the nav lists every app and marks the one you are in", async ({
  page,
}) => {
  for (const app of APPS) {
    await page.goto(app.path);
    const links = primary(page).getByRole("link");
    await expect(links, `${app.path} nav`).toHaveText([
      "Start",
      "Vault",
      "Projekte",
      "Aufgaben",
      "Eingang",
      "Kontext",
      "Zahlen",
      "CRM",
      "Rolodex",
    ]);
    await expect(primary(page).locator("[aria-current=page]")).toHaveText(
      app.tab,
    );
  }
});

test("the nav reaches every app from every app", async ({ page }) => {
  await page.goto("/crm/");
  for (const [tab, title] of [
    ["Vault", "Vault"],
    ["Projekte", "Projekte"],
    ["Rolodex", "Rolodex"],
    ["Start", "Bench"],
  ]) {
    await primary(page).getByRole("link", { name: tab }).click();
    await expect(page).toHaveTitle(title);
  }
});

test("each app keeps its own stylesheet", async ({ page }) => {
  // One bundle per document; if the apps ever share one, these backgrounds collide. Vault's
  // sidebar is #f2f4f6 / #1c2128, Rolodex's body #f5f5f7 / #14171c - different in both themes.
  for (const theme of ["dark", "light"]) {
    await page.goto("/vault/");
    await page.evaluate((t) => {
      localStorage.setItem("bench.theme", t);
    }, theme);
    await page.reload();
    const vaultSidebar = await page
      .locator("nav.sidebar")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.goto("/rolodex/");
    const rolodexBody = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(vaultSidebar, `${theme} theme`).not.toBe(rolodexBody);
  }
});
