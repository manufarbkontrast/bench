import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where Bench finds the sources it reads. Every value is a path on this machine, so none of it
 * belongs in the repo: `.env` is gitignored and `.env.example` documents the keys. A key that is
 * missing or blank means "not configured", and the app that needs it falls back to its sample.
 * A key is added here when the app that reads it arrives, not before.
 */
export interface Config {
  vaultDir?: string;
  projectRoots: string[];
  plaudHome?: string;
  inboxWatch: string[];
  controllingDir?: string;
}

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function expandTilde(p: string): string {
  return p === "~" || p.startsWith("~/")
    ? path.join(os.homedir(), p.slice(1))
    : p;
}

function rootsFrom(value: string | undefined): string[] {
  return (value ?? "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(expandTilde);
}

export function configFrom(env: NodeJS.ProcessEnv): Config {
  const plaudHome = optional(env.PLAUD_HOME);
  const controllingDir = optional(env.CONTROLLING_DIR);
  return {
    vaultDir: optional(env.VAULT_DIR),
    projectRoots: rootsFrom(env.PROJECT_ROOTS),
    plaudHome: plaudHome === undefined ? undefined : expandTilde(plaudHome),
    inboxWatch: rootsFrom(env.INBOX_WATCH),
    controllingDir:
      controllingDir === undefined ? undefined : expandTilde(controllingDir),
  };
}

/**
 * Read `<root>/.env` into the environment if it exists, then build the config from it. A
 * variable already in the environment wins over the file - process.loadEnvFile never overrides
 * one. BENCH_DOTENV=off skips the file altogether, which is how the e2e servers stay clear of a
 * developer's real .env whatever keys it gains later.
 */
export function loadConfig(root: string): Config {
  const file = path.join(root, ".env");
  if (process.env.BENCH_DOTENV !== "off" && existsSync(file))
    process.loadEnvFile(file);
  return configFrom(process.env);
}

/**
 * One line per source for the startup log, so a missing or blank VAULT_DIR is visible rather
 * than silent - whether the .env is absent or just does not set it.
 */
export function describeSources(config: Config): string[] {
  const projekte =
    config.projectRoots.length === 0
      ? "not configured"
      : `${config.projectRoots.length} roots`;
  const eingang =
    config.inboxWatch.length === 0
      ? "not configured"
      : `${config.inboxWatch.length} watch dirs`;
  return [
    `Vault: ${config.vaultDir ?? "not configured"}`,
    `Projekte: ${projekte}`,
    `Plaud: ${config.plaudHome ? "configured" : "not configured"}`,
    `Eingang: ${eingang}`,
    `Controlling: ${config.controllingDir ? "configured" : "not configured"}`,
  ];
}
