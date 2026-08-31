/**
 * The consolidation seams: four HTML entry points (the launcher plus the three apps), two
 * router basenames, two API namespaces and deep-link fallback. These are what the merge
 * introduced, so they are what regresses.
 */
import { test, expect } from "./fixtures";
import { json, type Organization, type TreeNode } from "./api";
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
    ready: (p) => p.getByRole("heading", { name: "CRM" }),
  },
  {
    path: "/vault/",
    title: "Vault",
    tab: "Vault",
    ready: (p) => p.getByRole("treeitem").first(),
  },
  {
    path: "/crm/",
    title: "Personal CRM",
    tab: "CRM",
    ready: (p) => p.getByTestId("dash-total"),
  },
  {
    path: "/space/",
    title: "Personal Space",
    tab: "Space",
    ready: (p) => p.getByRole("treeitem").first(),
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
    ["/space/p/does-not-exist", "Personal Space"],
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

  const tree = await page.request.get(`${baseURL}/api/space/tree`);
  expect(tree.ok()).toBeTruthy();
  expect((await json<TreeNode[]>(tree)).length).toBeGreaterThan(0);

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
  expect((await page.request.get(`${baseURL}/api/tree`)).status()).toBe(404);
  expect((await page.request.get(`${baseURL}/api/people`)).status()).toBe(404);
});

test("the launcher links into each app and the back button returns", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of ["Vault", "CRM", "Space", "Rolodex"]) {
    // The card, not the nav tab of the same name: only the card carries a heading.
    await page
      .getByRole("link")
      .filter({ has: page.getByRole("heading", { name }) })
      .click();
    await expect(page).not.toHaveTitle("Bench");
    await page.goBack();
    await expect(page).toHaveTitle("Bench");
  }
});

test("each app boots without console errors", async ({ page }) => {
  for (const app of APPS) {
    const errors = watchErrors(page);
    await page.goto(app.path);
    await expect(app.ready(page)).toBeVisible();
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
      "CRM",
      "Space",
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
    ["Rolodex", "Rolodex"],
    ["Space", "Personal Space"],
    ["Start", "Bench"],
  ]) {
    await primary(page).getByRole("link", { name: tab }).click();
    await expect(page).toHaveTitle(title);
  }
});

test("each app keeps its own stylesheet", async ({ page }) => {
  // One bundle per document; if the apps ever share one, these backgrounds collide. Space paints
  // its body white (#ffffff / #16181c), Rolodex grey (#f5f5f7 / #14171c), in both themes.
  await page.goto("/space/");
  const spaceBody = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.goto("/rolodex/");
  const rolodexBody = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(spaceBody).not.toBe(rolodexBody);
});
