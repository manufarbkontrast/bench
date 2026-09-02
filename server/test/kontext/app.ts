/** The whole Express app around one Kontext context; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openEingangDb } from "../../src/eingang/db.js";
import type { EingangContext } from "../../src/eingang/routes.js";
import type { KontextContext } from "../../src/kontext/routes.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import type { ZahlenContext } from "../../src/zahlen/routes.js";
import { emptyAufgaben } from "../aufgaben/app.js";
import { emptyProjekte } from "../projekte/app.js";
import { emptyVault } from "../vault/app.js";

// No emptyKontext() here, unlike the other six harnesses: this suite's whole point is exercising
// the real fixture claude dir and a real vault db, so every test builds its own context (see
// routes.test.ts) rather than reaching for a throwaway one.

// test/eingang/app.js exports no emptyEingang of its own, for the same reason this file exports
// no emptyKontext - so this is the small duplicate every other harness carries.
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
    },
  };
}

// test/zahlen/app.js exports no emptyZahlen of its own, for the same reason emptyEingang above
// is a private duplicate here - so this is the small duplicate every other harness carries.
function emptyZahlen(): ZahlenContext {
  return { dir: null, mycraftonUrl: null };
}

export function appWithKontext(kontext: KontextContext): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault: emptyVault(),
    projekte: emptyProjekte(),
    aufgaben: emptyAufgaben(),
    eingang: emptyEingang(),
    zahlen: emptyZahlen(),
    kontext,
  });
}
