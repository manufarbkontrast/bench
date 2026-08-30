import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where Bench finds the sources it reads. Every value is a path on this machine, so none of it
 * belongs in the repo: `.env` is gitignored and `.env.example` documents the keys. A key that is
 * missing or blank means "not configured", and the app that needs it falls back to its sample.
 * A key is added here when the app that reads it arrives, not before.
 */
export interface Config {
  vaultDir?: string;
}

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function configFrom(env: NodeJS.ProcessEnv): Config {
  return { vaultDir: optional(env.VAULT_DIR) };
}

/**
 * Read `<root>/.env` into the environment if it exists, then build the config from it. A
 * variable already in the environment wins over the file - process.loadEnvFile never overrides
 * one - which is what lets e2e/fixtures.ts pin VAULT_DIR to an empty string.
 */
export function loadConfig(root: string): Config {
  const file = path.join(root, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
  return configFrom(process.env);
}

/**
 * One line per source for the startup log, so a missing or blank VAULT_DIR is visible rather
 * than silent - whether the .env is absent or just does not set it.
 */
export function describeSources(config: Config): string[] {
  return [`Vault: ${config.vaultDir ?? "not configured"}`];
}
