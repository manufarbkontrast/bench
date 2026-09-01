/** The Heute/Erledigt toggle round trip, a conflicting edit on disk, and creating a task from
    the default target - the three write paths Aufgaben has onto the vault. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures";

/** The local calendar day - mirrors the server's own todayISO in vault/write.ts, which
    web/src/aufgaben/App.tsx duplicates for the same reason. */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const LEUCHTTURM = ["30_Projekte", "Leuchtturm", "Leuchtturm.md"];

/** The first line in `file` containing `needle`, read fresh from disk. */
function findLine(file: string, needle: string): string {
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.includes(needle));
  if (line === undefined) {
    throw new Error(`no line containing "${needle}" in ${file}`);
  }
  return line;
}

test("checking a task off writes the file and lists it under Erledigt; unchecking reverts the file exactly", async ({
  page,
  vaultDir,
}) => {
  const file = path.join(vaultDir, ...LEUCHTTURM);
  const today = todayISO();

  await page.goto("/aufgaben/");
  const heuteCheckbox = page.getByRole("checkbox", {
    name: "Spezifikation schreiben",
  });
  await expect(heuteCheckbox).toBeVisible();
  // A plain click, not .check(): the row is removed from Heute as soon as the toggle lands, so
  // .check()'s own post-click "is it checked" wait would poll for an element that is already gone.
  await heuteCheckbox.click();

  // The row only leaves Heute once the toggle's synchronous file write, reindex and the UI's
  // refetch have all landed, so waiting for it to disappear is what proves the write happened -
  // no separate wait for the write itself is needed before reading the file below.
  await expect(heuteCheckbox).toHaveCount(0);
  expect(findLine(file, "Spezifikation schreiben")).toBe(
    `- [x] Spezifikation schreiben 🔺 📅 2026-08-20 ✅ ${today}`,
  );

  await page.getByRole("button", { name: "Erledigt", exact: true }).click();
  const erledigtCheckbox = page.getByRole("checkbox", {
    name: "Spezifikation schreiben",
  });
  await expect(erledigtCheckbox).toBeVisible();
  await erledigtCheckbox.click();

  await expect(erledigtCheckbox).toHaveCount(0);
  expect(findLine(file, "Spezifikation schreiben")).toBe(
    "- [ ] Spezifikation schreiben 🔺 📅 2026-08-20",
  );
});

test("a toggle against a line edited on disk since page load is rejected as a conflict, without losing the edit", async ({
  page,
  vaultDir,
}) => {
  const file = path.join(vaultDir, ...LEUCHTTURM);

  await page.goto("/aufgaben/");
  const checkbox = page.getByRole("checkbox", { name: "Prototyp bauen" });
  await expect(checkbox).toBeVisible();

  // Edited on disk after the page already fetched its raw text - the "edited in Obsidian" side
  // of the race. Appending fresh rather than asserting a fixed suffix keeps this idempotent
  // under a retry, which re-enters against whatever this test's own previous attempt left here.
  const lines = readFileSync(file, "utf8").split("\n");
  const index = lines.findIndex((l) => l.includes("Prototyp bauen"));
  const edited = `${lines[index]} NEU`;
  lines[index] = edited;
  writeFileSync(file, lines.join("\n"));

  // A plain click, not .check(): the toggle is rejected, so the box never actually ends up
  // checked - which .check()'s own post-click assertion would otherwise wait on until it timed out.
  await checkbox.click();

  await expect(
    page.getByText("Die Notiz hat sich geändert – Liste neu geladen."),
  ).toBeVisible();

  // toggleTask checks the file, not the index, so the conflict is certain by the time the PATCH
  // response comes back - no wait is needed before re-reading it. See server/src/vault/write.ts.
  expect(readFileSync(file, "utf8").split("\n")[index]).toBe(edited);
});

test("creating a task from the default target adds it to the inbox note", async ({
  page,
  vaultDir,
}) => {
  await page.goto("/aufgaben/");
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.getByLabel("Text").fill("Anker streichen");
  await page.getByRole("button", { name: "Anlegen" }).click();

  // No due date and no priority, so the new task is unassigned rather than showing under Heute.
  await page.getByRole("button", { name: "Unzugeordnet", exact: true }).click();
  // .first(): unlike the Plaud import ledger, POST /api/vault/tasks has no dedup guard, so a
  // same-worker retry that re-enters this test appends a second identical line and renders a
  // second checkbox with this name - this only asserts presence, matching the file-side check
  // below, which already tolerates a duplicate the same way (indexOf finds the first match).
  await expect(
    page.getByRole("checkbox", { name: "Anker streichen" }).first(),
  ).toBeVisible();

  const lines = readFileSync(
    path.join(vaultDir, "00_Index", "Task_Inbox.md"),
    "utf8",
  ).split("\n");
  const headingIndex = lines.indexOf("## Aufgaben");
  const taskIndex = lines.indexOf("- [ ] Anker streichen");
  expect(headingIndex).toBeGreaterThanOrEqual(0);
  expect(taskIndex).toBeGreaterThan(headingIndex);
});
