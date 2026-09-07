import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every document's main.tsx must render through the shared ErrorBoundary with its own key -
// docs/PROJECT.md asks the tenth app to do the same, and this is what notices when it does not.
const SRC = path.resolve(__dirname, "..");

describe("every entry point", () => {
  it("wraps its App in ErrorBoundary with its own key", () => {
    const apps = readdirSync(SRC, { withFileTypes: true })
      .filter(
        (d) => d.isDirectory() && d.name !== "shared" && d.name !== "test",
      )
      .map((d) => d.name);
    expect(apps.length).toBeGreaterThanOrEqual(9);
    for (const app of apps) {
      const main = readFileSync(path.join(SRC, app, "main.tsx"), "utf8");
      expect(main).toContain(`<ErrorBoundary active="${app}">`);
    }
  });
});
