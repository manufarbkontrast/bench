/** The whole Express app around one vault index; the other apps get throwaway in-memory ones. */
import type express from "express";
import { createApp } from "../../src/app.js";
import { openDb as openCrmDb } from "../../src/crm/db.js";
import { openDb as openRolodexDb } from "../../src/rolodex/db/index.js";
import { openDb as openSpaceDb } from "../../src/space/db.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { VaultContext } from "../../src/vault/routes/index.js";
import { FIXTURE_DIR } from "./fixture.js";

/** An empty index over the tracked fixture directory, for suites that only need the app to boot. */
export function emptyVault(): VaultContext {
  return { db: openVaultDb(":memory:"), dir: FIXTURE_DIR, name: "fixture" };
}

export function appWithVault(vault: VaultContext): express.Express {
  return createApp({
    crm: openCrmDb(":memory:"),
    space: openSpaceDb(":memory:"),
    rolodex: openRolodexDb(":memory:"),
    vault,
  });
}
