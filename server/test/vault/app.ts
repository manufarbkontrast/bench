/** The whole Express app around one vault index; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openEingangDb } from "../../src/eingang/db.js";
import type { EingangContext } from "../../src/eingang/routes.js";
import type { KontextContext } from "../../src/kontext/routes.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { VaultContext } from "../../src/vault/routes/index.js";
import type { ZahlenContext } from "../../src/zahlen/routes.js";
import { emptyAufgaben } from "../aufgaben/app.js";
import { emptyProjekte } from "../projekte/app.js";
import { FIXTURE_DIR } from "./fixture.js";

/** An empty index over the tracked fixture directory, for suites that only need the app to boot. */
export function emptyVault(): VaultContext {
  return { db: openVaultDb(":memory:"), dir: FIXTURE_DIR, name: "fixture" };
}

// Not test/eingang/app.js's emptyEingang - that module imports emptyVault from this file, so
// importing back from it would cycle. Same small duplicate aufgaben/app.js and projekte/app.js
// already carry.
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

// test/kontext/app.js exports no emptyKontext of its own, for the same reason emptyZahlen above
// is a private duplicate here - so this is the small duplicate every other harness carries.
function emptyKontext(): KontextContext {
  return {
    claudeDir: "/nonexistent",
    vaultDb: openVaultDb(":memory:"),
    projectPaths: () => [],
  };
}

export function appWithVault(vault: VaultContext): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault,
    projekte: emptyProjekte(),
    aufgaben: emptyAufgaben(),
    eingang: emptyEingang(),
    kontext: emptyKontext(),
    zahlen: emptyZahlen(),
  });
}
