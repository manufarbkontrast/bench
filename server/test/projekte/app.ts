/** The whole Express app around one Projekte scan; other suites get a cheap in-memory context. */
import path from "node:path";
import type Database from "better-sqlite3";
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openProjekteDb } from "../../src/projekte/db.js";
import type { GhRunner } from "../../src/projekte/gh.js";
import type { ProjekteContext } from "../../src/projekte/routes.js";
import { buildSampleProjects } from "../../src/projekte/sample.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { VaultContext } from "../../src/vault/routes/index.js";

/** An empty in-memory scan for suites that only need the app to boot. */
export function emptyProjekte(): ProjekteContext {
  return {
    db: openProjekteDb(":memory:"),
    roots: [],
    source: "sample",
    gh: "off",
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
    },
    vault: { db: vaultDb, dir: sampleDir, name: "sample" },
    sampleDir,
  };
}
