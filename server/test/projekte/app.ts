/** The whole Express app around one Projekte scan; other suites get a cheap in-memory context. */
import path from "node:path";
import type Database from "better-sqlite3";
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openEingangDb } from "../../src/eingang/db.js";
import type { EingangContext } from "../../src/eingang/routes.js";
import type { KontextContext } from "../../src/kontext/routes.js";
import { openProjekteDb } from "../../src/projekte/db.js";
import type { GhRunner } from "../../src/projekte/gh.js";
import type { ProjekteContext } from "../../src/projekte/routes.js";
import { buildSampleProjects } from "../../src/projekte/sample.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { VaultContext } from "../../src/vault/routes/index.js";
import type { ZahlenContext } from "../../src/zahlen/routes.js";
import { emptyAufgaben } from "../aufgaben/app.js";

// Not test/eingang/app.js's emptyEingang - that module imports emptyAufgaben and emptyProjekte
// from this file and aufgaben/app.js, so importing back from it would cycle. Same small
// duplicate aufgaben/app.js already carries for emptyProjekte.
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

/** An empty in-memory scan for suites that only need the app to boot. */
export function emptyProjekte(): ProjekteContext {
  return {
    db: openProjekteDb(":memory:"),
    roots: [],
    source: "sample",
    gh: "off",
    notizenDir: null,
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

export function appWithProjekte(
  projekte: ProjekteContext,
  vault: VaultContext,
): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault,
    projekte,
    aufgaben: emptyAufgaben(),
    eingang: emptyEingang(),
    kontext: emptyKontext(),
    zahlen: emptyZahlen(),
  });
}

function coupleNotes(vaultDb: Database.Database, sampleDir: string): void {
  const insertNote = vaultDb.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertTag = vaultDb.prepare(
    "INSERT INTO tags (path, tag) VALUES (?, ?)",
  );
  insertNote.run(
    "leuchtfeuer.md",
    "Leuchtfeuer",
    "",
    JSON.stringify({
      path: path.join(sampleDir, "werkstatt", "leuchtfeuer"),
    }),
    "",
    0,
    0,
  );
  insertTag.run("leuchtfeuer.md", "brand/leuchtfeuer");
  insertTag.run("leuchtfeuer.md", "status/aktiv");
  insertNote.run(
    "strandgut.md",
    "Strandgut",
    "",
    JSON.stringify({ path: path.join(sampleDir, "atelier", "strandgut") }),
    "",
    0,
    0,
  );
}

/**
 * The sample workshop plus the two note couplings the brief pins - leuchtfeuer carrying brand and
 * status, strandgut carrying neither - built fresh under `dir` for one suite to scan.
 */
export function buildSampleContext(
  dir: string,
  gh: GhRunner | "off" = "off",
): { projekte: ProjekteContext; vault: VaultContext; sampleDir: string } {
  const sampleDir = buildSampleProjects(path.join(dir, "sample"));
  const vaultDb = openVaultDb(":memory:");
  coupleNotes(vaultDb, sampleDir);
  return {
    projekte: {
      db: openProjekteDb(":memory:"),
      roots: [sampleDir],
      source: "sample",
      gh,
      notizenDir: null,
    },
    vault: { db: vaultDb, dir: sampleDir, name: "sample" },
    sampleDir,
  };
}
