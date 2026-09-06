/** The whole Express app around one Zahlen context; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openEingangDb } from "../../src/eingang/db.js";
import type { EingangContext } from "../../src/eingang/routes.js";
import type { KontextContext } from "../../src/kontext/routes.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { ZahlenContext } from "../../src/zahlen/routes.js";
import { emptyAufgaben } from "../aufgaben/app.js";
import { emptyProjekte } from "../projekte/app.js";
import { emptyVault } from "../vault/app.js";

// No emptyZahlen() here, unlike the other five harnesses: this suite's whole point is exercising
// the fence and the parser against the real controlling fixture, so every test builds its own
// context (see routes.test.ts) rather than reaching for a throwaway one.
//
// Not test/eingang/app.js's own duplicate - that module imports emptyAufgaben, emptyProjekte and
// emptyVault, all reachable from this file, so importing back from it would cycle. Same small
// duplicate the other four harnesses already carry.
function emptyEingang(): EingangContext {
  return {
    db: openEingangDb(":memory:"),
    located: {
      watchDirs: [],
      controllingDir: null,
      launchAgentsDir: "/nonexistent",
      source: "sample",
      missing: [],
    },
    plaud: { dir: "/nonexistent", source: "sample" },
    runner: {
      start: () => {
        throw new Error("emptyEingang's runner is never meant to start a job");
      },
      kill: () => "not_running",
      isRunning: () => false,
    },
    paths: {
      plaudHome: "/nonexistent",
      vaultDir: "/nonexistent",
      controllingDir: null,
      skillsDir: "/nonexistent",
      sample: true,
      projektSlugs: () => [],
    },
  };
}

// test/kontext/app.js exports no emptyKontext of its own, for the same reason this file exports
// no emptyZahlen - so this is the small duplicate every other harness carries.
function emptyKontext(): KontextContext {
  return {
    claudeDir: "/nonexistent",
    vaultDb: openVaultDb(":memory:"),
    projectPaths: () => [],
  };
}

export function appWithZahlen(zahlen: ZahlenContext): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault: emptyVault(),
    projekte: emptyProjekte(),
    aufgaben: emptyAufgaben(),
    eingang: emptyEingang(),
    kontext: emptyKontext(),
    zahlen,
  });
}
