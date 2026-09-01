import { existsSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config.js";

export interface PlaudLocation {
  dir: string;
  source: "configured" | "sample";
  /** The configured Plaud home, when it was set but has no notizen folder - so the log can say so. */
  missing?: string;
}

/**
 * The Plaud notes to read: `<plaudHome>/notizen` if it exists, otherwise the bundled fixture -
 * read-only, so unlike the vault it needs no per-worker copy.
 */
export function locatePlaud(
  config: Pick<Config, "plaudHome">,
  fixtureDir: string,
): PlaudLocation {
  const configured = config.plaudHome;
  if (configured === undefined) return { dir: fixtureDir, source: "sample" };
  const notizen = path.join(configured, "notizen");
  if (existsSync(notizen)) return { dir: notizen, source: "configured" };
  return { dir: fixtureDir, source: "sample", missing: configured };
}
