/** The whole Express app around one aufgaben ledger; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openAufgabenDb } from "../../src/aufgaben/db.js";
import type { AufgabenSources } from "../../src/aufgaben/routes.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openEingangDb } from "../../src/eingang/db.js";
import type { EingangContext } from "../../src/eingang/routes.js";
import type { KontextContext } from "../../src/kontext/routes.js";
import { openProjekteDb } from "../../src/projekte/db.js";
import type { ProjekteContext } from "../../src/projekte/routes.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { VaultContext } from "../../src/vault/routes/index.js";
import type { ZahlenContext } from "../../src/zahlen/routes.js";

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
    notizenDir: null,
  };
}

// Same reasoning as emptyProjekte above: test/eingang/app.js's own emptyEingang imports
// emptyAufgaben from this module, so this module cannot import back from it.
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
    mcp: "off",
    runner: {
      start: () => {
        throw new Error("emptyEingang's runner is never meant to start a job");
      },
      kill: () => "not_running",
      isRunning: () => false,
      isInFlight: () => false,
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

// test/zahlen/app.js exports no emptyZahlen of its own - that suite's whole point is exercising
// the fence and the parser against the real controlling fixture - so this is the small duplicate
// every other harness carries instead.
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
    eingang: emptyEingang(),
    kontext: emptyKontext(),
    zahlen: emptyZahlen(),
  });
}
