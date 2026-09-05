import { test, expect } from "../fixtures";

test("quick-find opens by shortcut and control, narrows live, and jumps to a note", async ({
  page,
}) => {
  await page.goto("/vault/");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Schnellsuche" });
  await expect(dialog).toBeVisible();

  await page.keyboard.type("hafen");
  await expect(
    page.getByRole("option", { name: "2026-08-01 Call Hafen" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Suche" }).fill("leucht");
  await expect(page.getByRole("option", { name: "Leuchtturm" })).toBeVisible();
  await page.getByRole("option", { name: "Leuchtturm" }).click();
  await expect(
    page.getByRole("heading", { name: "Leuchtturm", level: 1 }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /Suche/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Schnellsuche" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Suche" }).fill("zzzz");
  await expect(page.getByText(/Keine Treffer/)).toBeVisible();
});

test("keyboard-only: arrows plus Enter open the selection", async ({
  page,
}) => {
  await page.goto("/vault/");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("s");
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Schnellsuche" })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/\/vault\/n\//);
});
