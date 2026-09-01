/**
 * The signature scenario: a repo appears on disk after the app has already scanned once, and
 * "Neu scannen" finds it without a page reload. The repo is built with the same git invocations
 * as server/src/projekte/sample.ts's builder, so it is indistinguishable from the workshop the
 * pipeline already knows how to read.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures";

/** Global and system git config stay out so the commit is identical on every machine. */
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.email=bench@example.com",
      "-c",
      "user.name=Bench",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, env: GIT_ENV, stdio: "ignore" },
  );
}

// playwright.config.ts sets retries: 1, and projectsDir is worker-scoped rather than per-test, so
// a retry re-enters this test against the repo the first attempt already built - mirrors the
// same guard in server/src/projekte/sample.ts's buildSampleProjects.
function initNewRepo(dir: string): void {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--initial-branch=main", ".");
  writeFileSync(path.join(dir, "README.md"), "# Neuzugang\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "feat: start the workshop");
}

test("a repo created after the first scan is found by Neu scannen, without a reload", async ({
  page,
  projectsDir,
}) => {
  await page.goto("/projekte/");
  // Generous: a fresh worker's first list fetch also builds and scans the sample workshop, which
  // shells out to git several times, before any row exists - the house pattern from
  // smoke.spec.ts's projekte addition. Waiting for a row here also guarantees projectsDir exists
  // on disk before the new repo is written into it below.
  await expect(
    page.getByRole("button", { name: "treibgut", exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  initNewRepo(path.join(projectsDir, "werkstatt", "neuzugang"));

  await page.getByRole("button", { name: "Neu scannen", exact: true }).click();

  // Generous, same as above: POST /scan rebuilds the whole table, re-shelling out to git for
  // every repo it already knew about plus this new one, not just reading the new row.
  await expect(
    page.getByRole("button", { name: "neuzugang", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
});
