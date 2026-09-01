/** The whole Express app around one aufgaben ledger; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openAufgabenDb } from "../../src/aufgaben/db.js";
import type { AufgabenSources } from "../../src/aufgaben/routes.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openProjekteDb } from "../../src/projekte/db.js";
import type { ProjekteContext } from "../../src/projekte/routes.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import type { VaultContext } from "../../src/vault/routes/index.js";

/** An in-memory ledger with no configured Plaud home, for suites that only need the app to boot. */
export function emptyAufgaben(): AufgabenSources {
  return {
    ledger: openAufgabenDb(":memory:"),
    plaud: { dir: "/nonexistent", source: "sample" },
    gh: "off",
  };
}

// Not test/projekte/app.js's emptyProjekte - importing it would make this module and that one
// import each other. The 5-line duplicate is what test/aufgaben/tmp.ts already does for the same
// reason.
function emptyProjekte(): ProjekteContext {
  return {
    db: openProjekteDb(":memory:"),
    roots: [],
    source: "sample",
    gh: "off",
  };
}

export function appWithAufgaben(
  aufgaben: AufgabenSources,
  vault: VaultContext,
  projekte: ProjekteContext = emptyProjekte(),
): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault,
    projekte,
    aufgaben,
  });
}
