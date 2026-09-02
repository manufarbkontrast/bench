/** The whole Express app around one eingang context; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import type { EingangContext } from "../../src/eingang/routes.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { emptyAufgaben } from "../aufgaben/app.js";
import { emptyProjekte } from "../projekte/app.js";
import { emptyVault } from "../vault/app.js";

// No emptyEingang() here, unlike the other four harnesses: this suite's whole point is
// exercising the fence and the fake job against the real fixtures, so every test builds its own
// context (see routes.test.ts) rather than reaching for a throwaway one.
export function appWithEingang(eingang: EingangContext): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault: emptyVault(),
    projekte: emptyProjekte(),
    aufgaben: emptyAufgaben(),
    eingang,
  });
}
