import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures";

/** Writes straight into this worker's vault copy, the way Obsidian would. */
test("a note written to the vault shows up without a restart", async ({
  page,
  vaultDir,
  baseURL,
}) => {
  const count = async () =>
    (
      (await (
        await page.request.get(`${baseURL}/api/vault/tree`)
      ).json()) as unknown[]
    ).length;
  const before = await count();

  mkdirSync(path.join(vaultDir, "60_Knowledge"), { recursive: true });
  writeFileSync(
    path.join(vaultDir, "60_Knowledge", "Live.md"),
    "# Live\n\nEben geschrieben, verweist auf [[Start]].\n",
  );
  // The count only ever grows here, so polling cannot alias it.
  await expect.poll(count, { timeout: 3000 }).toBe(before + 1);

  await page.goto("/vault/n/60_Knowledge/Live.md");
  await expect(
    page.getByRole("heading", { name: "Live", level: 1 }),
  ).toBeVisible();
  // Scoped to the note body: BenchNav carries its own "Start" link to the launcher.
  const wikilink = page
    .getByRole("article")
    .getByRole("link", { name: "Start" });
  await expect(wikilink).toBeVisible();
  await wikilink.click();
  await expect(
    page
      .getByRole("region", { name: "Verweise auf diese Notiz" })
      .getByRole("link", { name: "Live" }),
  ).toBeVisible();
});

test("an edited note is re-read within seconds", async ({
  page,
  vaultDir,
  baseURL,
}) => {
  const file = path.join(vaultDir, "10_Profile", "Persona.md");
  writeFileSync(
    file,
    "---\ntags: [profile]\n---\n\n# Persona\n\nFrisch geändert.\n",
  );
  await expect
    .poll(
      async () =>
        (
          (await (
            await page.request.get(
              `${baseURL}/api/vault/note?path=10_Profile%2FPersona.md`,
            )
          ).json()) as { body: string }
        ).body,
      { timeout: 3000 },
    )
    .toContain("Frisch geändert");
  await page.goto("/vault/n/10_Profile/Persona.md");
  await expect(page.getByText("Frisch geändert.")).toBeVisible();
});
