/**
 * The Kontext app against the committed claude-home fixture (server/src/kontext/fixture/claude)
 * and the shared fixture vault. Every route it reads is read-only - switching tabs and typing
 * into the skills search are both client-side state changes over data the server never
 * mutates - so every test here is trivially retry-safe: a Playwright retry re-runs the same
 * navigation against the exact same fixture files.
 */
import { test, expect } from "../fixtures";

test("Profil, Regeln and Stand render the fixture vault notes and the Claude-side rule", async ({
  page,
}) => {
  await page.goto("/kontext/");

  // Profil is the default view, so no tab click is needed to see 10_Profile/Persona.md render.
  await expect(
    page.getByRole("link", { name: "Persona", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Kurz und direkt.")).toBeVisible();

  await page.getByRole("button", { name: "Regeln", exact: true }).click();
  // Claude-Regeln: server/src/kontext/fixture/claude/rules/beispiel-regel.md, read verbatim.
  await expect(
    page.getByRole("heading", { name: "beispiel-regel.md", level: 3 }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Always confirm the target folder before writing anything new.",
    ),
  ).toBeVisible();
  // Workflow (Vault): the fixture vault note at 50_Workflow/Testing.md.
  await expect(
    page.getByRole("link", { name: "Testing", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Stand", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Session_Context", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Rollierender Stand des Beispiel-Vaults."),
  ).toBeVisible();
});

test("Skills counts the fixture folders and a search narrows the list without changing the counter", async ({
  page,
}) => {
  await page.goto("/kontext/");
  await page.getByRole("button", { name: "Skills", exact: true }).click();

  // server/src/kontext/fixture/claude/skills holds exactly two folders - hafen-skill and
  // leuchtturm-skill, each with its own SKILL.md - and no third, bare folder. Verified against
  // the committed tree (`find server/src/kontext/fixture/claude/skills -type d`) rather than
  // assumed: server/src/kontext/skills.ts's listSkills counts folders, not readable SKILL.md
  // files, but here the two counts coincide at 2. The plan's Task 7 sketch guessed 3; the fixture
  // as committed says 2.
  const counter = page.getByText("2 Skills", { exact: true });
  await expect(counter).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("searchbox", { name: "Suchen" }).fill("leuchtturm");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toContainText("leuchtturm-skill");
  // The counter reads listSkills' own folder count, never filtered.length - server/src/kontext
  // /skills.ts's criterion - so narrowing the list to one row must not move it off 2 Skills.
  await expect(counter).toBeVisible();
});

test("MCP lists the fixture server names and never leaks the poisoned URL onto the page", async ({
  page,
}) => {
  await page.goto("/kontext/");
  await page.getByRole("button", { name: "MCP", exact: true }).click();

  await expect(
    page.getByRole("listitem").filter({ hasText: "beispiel-a" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "beispiel-b" }),
  ).toBeVisible();

  // server/src/kontext/fixture/claude/claude.json hides "https://secret.example.com/token?x=1"
  // inside beispiel-a's own config precisely so this can prove the boundary:
  // server/src/kontext/readers.ts's readMcpServers keeps only Object.keys(mcpServers), so the URL
  // must never reach the rendered page - the e2e half of the no-secret criterion, the unit tests
  // being the other half.
  await expect(page.locator("body")).not.toContainText("secret.example.com");
});
