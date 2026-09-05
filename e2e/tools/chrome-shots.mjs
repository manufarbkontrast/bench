/**
 * Screenshots every screen of all nine documents (Cockpit plus the eight apps) in both themes,
 * for reviewing a visual change in one pass. Covers every URL-addressable route (CRM and Rolodex
 * each have several; Vault redirects "/" to its first note, landing on a "/vault/n/<path>" URL by
 * itself) plus every button-driven view that has no route of its own - Projekte's table/board
 * toggle, Aufgaben's and Kontext's tabs, and every modal/overlay reachable from a screen already
 * on the list (CRM's five form/confirm modals, Rolodex's PersonForm/ImportModal/AddModals family/
 * LogInteractionModal, Vault's QuickFind, Aufgaben's inline create form) - by driving each one open
 * with a short sequence of steps before shooting, then closing it again. Nothing is ever submitted
 * or persisted: a modal screen only opens the dialog, shoots, and closes it (Escape where the
 * component listens for it, a backdrop click where it does not, or naming the dialog's own cancel
 * button).
 *
 * Deliberately not covered: CRM/Rolodex *detail* routes themselves (they need a real record's id,
 * which is only known once the seeded/scanned data is loaded) - the list and pipeline/board views
 * they lead to are covered instead, and one modal per app is reached by clicking into whichever
 * record a detail-only modal needs.
 *
 * Usage: node e2e/tools/chrome-shots.mjs [baseURL] [outDir]
 * outDir defaults to "screenshots"; can also be set via SCREENSHOTS_DIR.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:8100";
const outDir = process.argv[3] ?? process.env.SCREENSHOTS_DIR ?? "screenshots";
mkdirSync(outDir, { recursive: true });

/** A plain route needs only a goto. `steps` drives it into a further state before the shot: a
    string clicks a button by its accessible name (a tab, or a modal's own opener); `{ css }`
    clicks the first element matching a CSS selector, for a table row that has no button role.
    `close` undoes that afterwards, so a modal is never left open across screens: "escape" for a
    component that listens for it, "backdrop" for a click on the overlay outside the dialog, or a
    string to click a named button (Aufgaben's inline form has no overlay to click past). */
const SCREENS = [
  { name: "start", path: "/" },
  { name: "vault", path: "/vault/" },
  {
    name: "vault-quickfind",
    path: "/vault/",
    steps: [{ css: ".sidebar-action" }],
    close: "escape",
  },
  // The Projekte view is the app's default since the handoff work; the table and the board need
  // their view buttons clicked to be seen at all.
  { name: "projekte-stand", path: "/projekte/" },
  { name: "projekte-table", path: "/projekte/", steps: ["Tabelle"] },
  { name: "projekte-board", path: "/projekte/", steps: ["Board"] },
  { name: "aufgaben-heute", path: "/aufgaben/" },
  { name: "aufgaben-woche", path: "/aufgaben/", steps: ["Woche"] },
  { name: "aufgaben-projekt", path: "/aufgaben/", steps: ["Projekt"] },
  { name: "aufgaben-marke", path: "/aufgaben/", steps: ["Marke"] },
  {
    name: "aufgaben-unzugeordnet",
    path: "/aufgaben/",
    steps: ["Unzugeordnet"],
  },
  { name: "aufgaben-erledigt", path: "/aufgaben/", steps: ["Erledigt"] },
  { name: "aufgaben-issues", path: "/aufgaben/", steps: ["Issues"] },
  {
    name: "aufgaben-create-form",
    path: "/aufgaben/",
    steps: ["Neue Aufgabe"],
    close: "Abbrechen",
  },
  { name: "eingang", path: "/eingang/" },
  { name: "kontext-profil", path: "/kontext/" },
  { name: "kontext-regeln", path: "/kontext/", steps: ["Regeln"] },
  { name: "kontext-stand", path: "/kontext/", steps: ["Stand"] },
  { name: "kontext-memory", path: "/kontext/", steps: ["Memory"] },
  { name: "kontext-repos", path: "/kontext/", steps: ["Repos"] },
  { name: "kontext-skills", path: "/kontext/", steps: ["Skills"] },
  { name: "kontext-mcp", path: "/kontext/", steps: ["MCP"] },
  { name: "zahlen", path: "/zahlen/" },
  { name: "crm-dashboard", path: "/crm/" },
  { name: "crm-organizations", path: "/crm/organizations" },
  {
    name: "crm-modal-add-organization",
    path: "/crm/organizations",
    steps: ["Add organization"],
    close: "backdrop",
  },
  {
    name: "crm-modal-confirm-delete",
    path: "/crm/organizations",
    steps: [{ css: "tr.clickable" }, "Delete"],
    close: "backdrop",
  },
  { name: "crm-contacts", path: "/crm/contacts" },
  {
    name: "crm-modal-add-contact",
    path: "/crm/contacts",
    steps: ["Add contact"],
    close: "backdrop",
  },
  {
    name: "crm-modal-log-activity",
    path: "/crm/contacts",
    steps: [{ css: "tr.clickable" }, "Log activity"],
    close: "backdrop",
  },
  { name: "crm-deals", path: "/crm/deals" },
  {
    name: "crm-modal-add-deal",
    path: "/crm/deals",
    steps: ["Add deal"],
    close: "backdrop",
  },
  { name: "crm-pipeline", path: "/crm/pipeline" },
  { name: "rolodex-today", path: "/rolodex/" },
  {
    name: "rolodex-modal-log-contact",
    path: "/rolodex/",
    steps: ["Log contact"],
    close: "escape",
  },
  { name: "rolodex-people", path: "/rolodex/people" },
  {
    name: "rolodex-modal-add-person",
    path: "/rolodex/people",
    steps: ["Add person"],
    close: "escape",
  },
  {
    name: "rolodex-modal-import",
    path: "/rolodex/people",
    steps: ["Import"],
    close: "escape",
  },
  {
    name: "rolodex-modal-add-news",
    path: "/rolodex/people",
    steps: [{ css: "tr.rowlink" }, "Add news"],
    close: "escape",
  },
  {
    name: "rolodex-modal-add-date",
    path: "/rolodex/people",
    steps: [{ css: "tr.rowlink" }, "Add date"],
    close: "escape",
  },
  {
    name: "rolodex-modal-add-connection",
    path: "/rolodex/people",
    steps: [{ css: "tr.rowlink" }, "Add connection"],
    close: "escape",
  },
  { name: "rolodex-circles", path: "/rolodex/circles" },
  { name: "rolodex-calendar", path: "/rolodex/calendar" },
  { name: "rolodex-timeline", path: "/rolodex/timeline" },
];

async function runStep(page, step) {
  // .first() everywhere: Today's "Log contact" is repeated once per row, so a plain accessible-name
  // match would hit Playwright's strict mode rather than open the first one.
  if (typeof step === "string") {
    await page.getByRole("button", { name: step, exact: true }).first().click();
  } else {
    await page.locator(step.css).first().click();
  }
  // Generous rather than tight: a row click also navigates to a detail page that then fetches
  // its own data, on top of whatever animation the click itself triggers.
  await page.waitForTimeout(300);
}

async function closeOpened(page, close) {
  if (close === "escape") await page.keyboard.press("Escape");
  else if (close === "backdrop") await page.mouse.click(10, 10);
  else if (close) await runStep(page, close);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const theme of ["dark", "light"]) {
  for (const { name, path, steps, close } of SCREENS) {
    await page.goto(base + path);
    await page.evaluate((t) => {
      localStorage.setItem("bench.theme", t);
    }, theme);
    await page.reload();
    await page.waitForTimeout(350);
    for (const step of steps ?? []) {
      await runStep(page, step);
    }
    await page.screenshot({ path: `${outDir}/${name}-${theme}.png` });
    console.log("captured", name, theme);
    await closeOpened(page, close);
  }
}

await browser.close();
