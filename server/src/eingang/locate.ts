import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../config.js";

export interface LocatedEingang {
  watchDirs: string[];
  controllingDir: string;
  launchAgentsDir: string;
  source: "configured" | "sample";
  missing: string[];
}

/**
 * One source flag for the whole app rather than one per field: sample whenever no configured
 * watch dir is usable, so the controlling dir and LaunchAgents fall back together instead of
 * mixing real and fixture data. Later tasks gate the fake job runner on this single field.
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
      controllingDir:
        config.controllingDir ?? path.join(fixtureDir, "controlling"),
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
