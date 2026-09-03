/**
 * Screenshots every screen of all nine documents (Cockpit plus the eight apps) in both themes,
 * for reviewing a visual change in one pass. Covers every URL-addressable route (CRM and Rolodex
 * each have several; Vault redirects "/" to its first note, landing on a "/vault/n/<path>" URL by
 * itself) plus every button-driven view that has no route of its own - Projekte's table/board
 * toggle, Aufgaben's and Kontext's tabs - by clicking through them after the page loads.
 *
 * Usage: node e2e/tools/chrome-shots.mjs [baseURL] [outDir]
 * outDir defaults to "screenshots"; can also be set via SCREENSHOTS_DIR.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:8100";
const outDir = process.argv[3] ?? process.env.SCREENSHOTS_DIR ?? "screenshots";
mkdirSync(outDir, { recursive: true });

/** A plain route needs only a goto; a "tabs" screen also clicks through a list of buttons found
    by their accessible name, shooting one frame per click on top of the route's own shot. */
const SCREENS = [
  { name: "start", path: "/" },
  { name: "vault", path: "/vault/" },
  { name: "projekte-table", path: "/projekte/" },
  { name: "projekte-board", path: "/projekte/", tabs: ["Board"] },
  { name: "aufgaben-heute", path: "/aufgaben/" },
  { name: "aufgaben-woche", path: "/aufgaben/", tabs: ["Woche"] },
  { name: "aufgaben-projekt", path: "/aufgaben/", tabs: ["Projekt"] },
  { name: "aufgaben-marke", path: "/aufgaben/", tabs: ["Marke"] },
  { name: "aufgaben-unzugeordnet", path: "/aufgaben/", tabs: ["Unzugeordnet"] },
  { name: "aufgaben-erledigt", path: "/aufgaben/", tabs: ["Erledigt"] },
  { name: "aufgaben-issues", path: "/aufgaben/", tabs: ["Issues"] },
  { name: "eingang", path: "/eingang/" },
  { name: "kontext-profil", path: "/kontext/" },
  { name: "kontext-regeln", path: "/kontext/", tabs: ["Regeln"] },
  { name: "kontext-stand", path: "/kontext/", tabs: ["Stand"] },
  { name: "kontext-memory", path: "/kontext/", tabs: ["Memory"] },
  { name: "kontext-repos", path: "/kontext/", tabs: ["Repos"] },
  { name: "kontext-skills", path: "/kontext/", tabs: ["Skills"] },
  { name: "kontext-mcp", path: "/kontext/", tabs: ["MCP"] },
  { name: "zahlen", path: "/zahlen/" },
  { name: "crm-dashboard", path: "/crm/" },
  { name: "crm-organizations", path: "/crm/organizations" },
  { name: "crm-contacts", path: "/crm/contacts" },
  { name: "crm-deals", path: "/crm/deals" },
  { name: "crm-pipeline", path: "/crm/pipeline" },
  { name: "rolodex-today", path: "/rolodex/" },
  { name: "rolodex-people", path: "/rolodex/people" },
  { name: "rolodex-circles", path: "/rolodex/circles" },
  { name: "rolodex-calendar", path: "/rolodex/calendar" },
  { name: "rolodex-timeline", path: "/rolodex/timeline" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const theme of ["dark", "light"]) {
  for (const { name, path, tabs } of SCREENS) {
    await page.goto(base + path);
    await page.evaluate((t) => {
      localStorage.setItem("bench.theme", t);
    }, theme);
    await page.reload();
    await page.waitForTimeout(350);
    for (const label of tabs ?? []) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: `${outDir}/${name}-${theme}.png` });
    console.log("captured", name, theme);
  }
}

await browser.close();
