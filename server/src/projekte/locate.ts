import { existsSync } from "node:fs";
import type { Config } from "../config.js";
import { buildSampleProjects } from "./sample.js";

export interface LocatedProjects {
  roots: string[];
  source: "configured" | "sample";
  missing: string[];
}

/**
 * Configured roots that exist win; with none usable the server builds its synthetic workshop so
 * `npm start` without a .env still shows a living app - the same pattern as the sample vault.
 */
export function locateProjects(
  config: Pick<Config, "projectRoots">,
  sampleDir: string,
): LocatedProjects {
  const roots = config.projectRoots.filter((root) => existsSync(root));
  const missing = config.projectRoots.filter((root) => !existsSync(root));
  if (roots.length > 0) return { roots, source: "configured", missing };
  return { roots: [buildSampleProjects(sampleDir)], source: "sample", missing };
}
