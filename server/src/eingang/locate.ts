import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../config.js";

export interface LocatedEingang {
  watchDirs: string[];
  controllingDir: string | null;
  launchAgentsDir: string;
  source: "configured" | "sample";
  missing: string[];
}

/**
 * One source flag for the whole app rather than one per field: sample whenever no configured
 * watch dir is usable, so watchDirs, controllingDir and launchAgentsDir all fall back together to
 * one coherent fixture world rather than mixing real and fixture data. Later tasks gate the fake
 * job runner on this single field.
 *
 * The configured world is real-only: it never borrows the fixture controlling path. A user can
 * legitimately configure INBOX_WATCH without CONTROLLING_DIR, so controllingDir is null there
 * rather than silently switching to sample data - later, the controlling job kind must refuse
 * (400) on a null controllingDir rather than run against the fixture.
 */
export function locateEingang(
  config: Pick<Config, "inboxWatch" | "controllingDir">,
  fixtureDir: string,
): LocatedEingang {
  const watchDirs = config.inboxWatch.filter((dir) => existsSync(dir));
  const missing = config.inboxWatch.filter((dir) => !existsSync(dir));
  if (watchDirs.length > 0)
    return {
      watchDirs,
      controllingDir: config.controllingDir ?? null,
      launchAgentsDir: path.join(os.homedir(), "Library", "LaunchAgents"),
      source: "configured",
      missing,
    };
  return {
    watchDirs: [path.join(fixtureDir, "inbox")],
    controllingDir: path.join(fixtureDir, "controlling"),
    launchAgentsDir: path.join(fixtureDir, "launchagents"),
    source: "sample",
    missing,
  };
}
