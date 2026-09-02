import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openAufgabenDb } from "./aufgaben/db.js";
import { realGh as realAufgabenGh } from "./aufgaben/gh.js";
import { locatePlaud } from "./aufgaben/locate.js";
import type { AufgabenSources } from "./aufgaben/routes.js";
import { describeSources, loadConfig } from "./config.js";
import { openDb as openCrmDb } from "./crm/db.js";
import { isSeeded, seed } from "./crm/seed.js";
import { failStaleRunning, openEingangDb } from "./eingang/db.js";
import type { JobPaths } from "./eingang/jobs.js";
import { locateEingang } from "./eingang/locate.js";
import type { EingangContext } from "./eingang/routes.js";
import { createRunner } from "./eingang/runner.js";
import { listProjects, openProjekteDb } from "./projekte/db.js";
import { realGh } from "./projekte/gh.js";
import { locateProjects } from "./projekte/locate.js";
import { scanProjects } from "./projekte/pipeline.js";
import type { ProjekteContext } from "./projekte/routes.js";
import { openDb as openRolodexDb } from "./rolodex/db/index.js";
import { seedIfEmpty as seedRolodex } from "./rolodex/seed.js";
import { openDb as openVaultDb } from "./vault/db.js";
import { indexAll } from "./vault/index/indexer.js";
import { locateVault } from "./vault/locate.js";
import { watchVault } from "./vault/watch.js";
import { createApp } from "./app.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const config = loadConfig(root);
const dataDir = path.resolve(root, process.env.DATA_DIR ?? "data");
const port = Number(process.env.PORT ?? 8100);

mkdirSync(dataDir, { recursive: true });

const crm = openCrmDb(path.join(dataDir, "crm.sqlite"));
if (!isSeeded(crm)) {
  seed(crm);
  console.log("Seeded the CRM database with sample data");
}

const rolodex = openRolodexDb(path.join(dataDir, "rolodex.sqlite"));
seedRolodex(rolodex);

const vault = locateVault(
  config,
  path.join(root, "server", "src", "vault", "fixture"),
);
const vaultDb = openVaultDb(path.join(dataDir, "vault.sqlite"));
const indexed = indexAll(vaultDb, vault.dir);
watchVault(vaultDb, vault.dir);

// No scan at startup - the first GET /list pays it, so boot stays fast.
const projekteLocation = locateProjects(
  config,
  path.join(dataDir, "sample-projekte"),
);
const projekteDb = openProjekteDb(path.join(dataDir, "projekte.sqlite"));
const projekte: ProjekteContext = {
  db: projekteDb,
  roots: projekteLocation.roots,
  source: projekteLocation.source,
  gh: process.env.BENCH_GH === "off" ? "off" : realGh,
};

const plaudLocation = locatePlaud(
  config,
  path.join(root, "server", "src", "aufgaben", "fixture", "notizen"),
);
const aufgabenDb = openAufgabenDb(path.join(dataDir, "aufgaben.sqlite"));
const aufgaben: AufgabenSources = {
  ledger: aufgabenDb,
  plaud: { dir: plaudLocation.dir, source: plaudLocation.source },
  gh: process.env.BENCH_GH === "off" ? "off" : realAufgabenGh,
};

const eingangFixtureDir = path.join(
  root,
  "server",
  "src",
  "eingang",
  "fixture",
);
const eingangLocation = locateEingang(config, eingangFixtureDir);
const eingangDb = openEingangDb(path.join(dataDir, "eingang.sqlite"));
// A server killed mid-job leaves its row stuck "running" forever - see failStaleRunning's own
// comment. Run once at boot so a restart's job list reflects reality.
failStaleRunning(eingangDb);

const eingangPaths: JobPaths = {
  // The sample world is one coherent fixture tree (see locateEingang's docstring): plaudHome
  // falls back to the same fixture root that watchDirs and controllingDir already use, rather
  // than to config.plaudHome, which a "configured" eingang need not have set.
  plaudHome:
    eingangLocation.source === "configured"
      ? (config.plaudHome ?? eingangFixtureDir)
      : eingangFixtureDir,
  vaultDir: vault.dir,
  controllingDir: eingangLocation.controllingDir,
  skillsDir: path.join(os.homedir(), ".claude", "skills"),
  sample: eingangLocation.source === "sample",
};
const eingangRunner = createRunner(
  eingangDb,
  path.join(dataDir, "eingang-jobs"),
  {
    "vault-reindex": (log) => {
      const result = indexAll(vaultDb, vault.dir);
      log(
        `indexed ${result.notes} notes, ${result.links} links, ${result.tasks} tasks`,
      );
      return Promise.resolve();
    },
    "projekte-scan": async (log) => {
      const result = await scanProjects(
        projekteDb,
        vaultDb,
        projekteLocation.roots,
        projekte.gh,
      );
      log(
        `scanned ${result.projects} projects (${result.repos} repos, ${result.folders} folders, ${result.duplicates} duplicates) in ${result.ms}ms`,
      );
    },
  },
);
const eingang: EingangContext = {
  db: eingangDb,
  located: eingangLocation,
  plaud: { dir: plaudLocation.dir, source: plaudLocation.source },
  runner: eingangRunner,
  paths: eingangPaths,
};

createApp({
  crm,
  rolodex,
  vault: { db: vaultDb, dir: vault.dir, name: path.basename(vault.dir) },
  projekte,
  aufgaben,
  eingang,
}).listen(port, () => {
  console.log(`Bench running at http://localhost:${port}`);
  for (const line of describeSources(config)) console.log(`  ${line}`);
  if (vault.missing)
    console.log(
      `  Vault: ${vault.missing} not found - using the bundled sample`,
    );
  if (projekteLocation.missing.length > 0)
    console.log(
      `  Projekte: ${projekteLocation.missing.length} configured root(s) not found`,
    );
  console.log(
    `  Vault index: ${indexed.notes} notes, ${indexed.links} links, ${indexed.tasks} tasks from ${vault.dir}`,
  );
  const projekteRows = listProjects(projekteDb).length;
  console.log(
    `  Projekte: ${projekteLocation.roots.length} roots (${projekteLocation.source}), ${
      projekteRows > 0
        ? `${projekteRows} projects indexed`
        : "index empty until first scan"
    }`,
  );
  if (plaudLocation.missing)
    console.log(
      "  Plaud: configured path not found - using the bundled sample",
    );
  const importCount = (
    aufgabenDb.prepare("SELECT COUNT(*) AS c FROM task_imports").get() as {
      c: number;
    }
  ).c;
  console.log(
    `  Aufgaben: plaud ${plaudLocation.source}, ledger ${importCount} imports`,
  );
  const eingangJobCount = (
    eingangDb.prepare("SELECT COUNT(*) AS c FROM jobs").get() as {
      c: number;
    }
  ).c;
  console.log(
    `  Eingang: ${eingangLocation.watchDirs.length} watch dirs (${eingangLocation.source}), ${eingangJobCount} jobs recorded`,
  );
});
