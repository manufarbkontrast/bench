/**
 * Launcher and nav strip in both themes, for reviewing the shared chrome after a visual change.
 * Usage: node e2e/tools/chrome-shots.mjs [baseURL]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:8100";
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const theme of ["dark", "light"]) {
  for (const path of ["/", "/vault/", "/crm/", "/space/", "/rolodex/"]) {
    await page.goto(base + path);
    await page.evaluate((t) => {
      localStorage.setItem("bench.theme", t);
    }, theme);
    await page.reload();
    await page.waitForTimeout(350);
    const name = path === "/" ? "start" : path.replaceAll("/", "");
    await page.screenshot({ path: `screenshots/${name}-${theme}.png` });
    console.log("captured", name, theme);
  }
}

await browser.close();
