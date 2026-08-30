import { existsSync } from "node:fs";
import type { Config } from "../config.js";

export interface VaultLocation {
  dir: string;
  source: "configured" | "sample";
  /** The configured path, when it was set but is not there - so the log can say so. */
  missing?: string;
}

/** The vault to index: the configured directory if it exists, otherwise the bundled sample. */
export function locateVault(config: Config, sampleDir: string): VaultLocation {
  const configured = config.vaultDir;
  if (configured === undefined) return { dir: sampleDir, source: "sample" };
  if (existsSync(configured)) return { dir: configured, source: "configured" };
  return { dir: sampleDir, source: "sample", missing: configured };
}
