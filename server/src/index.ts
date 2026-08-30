import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeSources, loadConfig } from "./config.js";
import { openDb as openCrmDb } from "./crm/db.js";
import { isSeeded, seed } from "./crm/seed.js";
import { openDb as openRolodexDb } from "./rolodex/db/index.js";
import { seedIfEmpty as seedRolodex } from "./rolodex/seed.js";
import { openDb as openSpaceDb } from "./space/db.js";
import { seedIfEmpty } from "./space/seed.js";
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

const space = openSpaceDb(path.join(dataDir, "personal-space.db"));
seedIfEmpty(space);

const rolodex = openRolodexDb(path.join(dataDir, "rolodex.sqlite"));
seedRolodex(rolodex);

const vault = locateVault(
  config,
  path.join(root, "server", "src", "vault", "fixture"),
);
const vaultDb = openVaultDb(path.join(dataDir, "vault.sqlite"));
const indexed = indexAll(vaultDb, vault.dir);
watchVault(vaultDb, vault.dir);

createApp({
  crm,
  space,
  rolodex,
  vault: { db: vaultDb, dir: vault.dir, name: path.basename(vault.dir) },
}).listen(port, () => {
  console.log(`Bench running at http://localhost:${port}`);
  for (const line of describeSources(config)) console.log(`  ${line}`);
  if (vault.missing)
    console.log(
      `  Vault: ${vault.missing} not found - using the bundled sample`,
    );
  console.log(
    `  Vault index: ${indexed.notes} notes, ${indexed.links} links, ${indexed.tasks} tasks from ${vault.dir}`,
  );
});
