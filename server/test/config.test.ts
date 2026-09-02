import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os, { tmpdir } from "node:os";
import path from "node:path";
import {
  configFrom,
  describeSources,
  expandTilde,
  loadConfig,
} from "../src/config.js";

let root: string | undefined;

/** A fresh directory per test; afterEach removes it whatever the assertions did. */
function tempRoot(): string {
  root = mkdtempSync(path.join(tmpdir(), "bench-config-"));
  return root;
}

afterEach(() => {
  delete process.env.VAULT_DIR;
  delete process.env.BENCH_DOTENV;
  delete process.env.PROJECT_ROOTS;
  delete process.env.PLAUD_HOME;
  delete process.env.INBOX_WATCH;
  delete process.env.CONTROLLING_DIR;
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("configFrom", () => {
  it("reads the vault path", () => {
    expect(configFrom({ VAULT_DIR: "/v" }).vaultDir).toBe("/v");
  });

  it("treats a missing or blank value as unset", () => {
    expect(configFrom({}).vaultDir).toBeUndefined();
    expect(configFrom({ VAULT_DIR: "   " }).vaultDir).toBeUndefined();
  });

  it("defaults project roots to an empty list when unset", () => {
    expect(configFrom({}).projectRoots).toEqual([]);
  });

  it("splits, trims, drops empties and expands tilde in project roots", () => {
    expect(configFrom({ PROJECT_ROOTS: "~/a: /srv/b :" }).projectRoots).toEqual(
      [path.join(os.homedir(), "a"), "/srv/b"],
    );
  });

  it("treats a missing PLAUD_HOME as unset", () => {
    expect(configFrom({}).plaudHome).toBeUndefined();
  });

  it("expands tilde in the Plaud home", () => {
    expect(configFrom({ PLAUD_HOME: "~/Plaud" }).plaudHome).toBe(
      path.join(os.homedir(), "Plaud"),
    );
  });

  it("defaults inbox watch dirs to an empty list when unset", () => {
    expect(configFrom({}).inboxWatch).toEqual([]);
  });

  it("splits, trims, drops empties and expands tilde in inbox watch dirs", () => {
    expect(
      configFrom({ INBOX_WATCH: "~/Downloads: /srv/x :" }).inboxWatch,
    ).toEqual([path.join(os.homedir(), "Downloads"), "/srv/x"]);
  });

  it("treats a missing CONTROLLING_DIR as unset", () => {
    expect(configFrom({}).controllingDir).toBeUndefined();
  });

  it("expands tilde in the controlling dir", () => {
    expect(
      configFrom({ CONTROLLING_DIR: "~/Controlling" }).controllingDir,
    ).toBe(path.join(os.homedir(), "Controlling"));
  });
});

describe("expandTilde", () => {
  it("expands a leading ~ to the home directory", () => {
    expect(expandTilde("~/a")).toBe(path.join(os.homedir(), "a"));
    expect(expandTilde("~")).toBe(os.homedir());
  });

  it("leaves other paths untouched", () => {
    expect(expandTilde("/srv/b")).toBe("/srv/b");
  });
});

describe("loadConfig", () => {
  it("reads .env from the root when it exists", () => {
    const dir = tempRoot();
    writeFileSync(path.join(dir, ".env"), "VAULT_DIR=/from-file\n");
    delete process.env.VAULT_DIR;
    expect(loadConfig(dir).vaultDir).toBe("/from-file");
  });

  it("copes without a .env", () => {
    delete process.env.VAULT_DIR;
    expect(loadConfig(tempRoot()).vaultDir).toBeUndefined();
  });

  it("leaves .env unread when BENCH_DOTENV is off", () => {
    const dir = tempRoot();
    writeFileSync(path.join(dir, ".env"), "VAULT_DIR=/from-file\n");
    delete process.env.VAULT_DIR;
    process.env.BENCH_DOTENV = "off";
    expect(loadConfig(dir).vaultDir).toBeUndefined();
  });
});

describe("describeSources", () => {
  it("names the vault and says when it is not configured", () => {
    expect(describeSources(configFrom({ VAULT_DIR: "/v" }))).toEqual([
      "Vault: /v",
      "Projekte: not configured",
      "Plaud: not configured",
      "Eingang: not configured",
      "Controlling: not configured",
    ]);
    expect(describeSources(configFrom({}))).toEqual([
      "Vault: not configured",
      "Projekte: not configured",
      "Plaud: not configured",
      "Eingang: not configured",
      "Controlling: not configured",
    ]);
  });

  it("counts configured project roots without naming their paths", () => {
    expect(
      describeSources(configFrom({ PROJECT_ROOTS: "~/a:/srv/b" })),
    ).toEqual([
      "Vault: not configured",
      "Projekte: 2 roots",
      "Plaud: not configured",
      "Eingang: not configured",
      "Controlling: not configured",
    ]);
  });

  it("says Plaud is configured without ever printing the machine path", () => {
    expect(describeSources(configFrom({ PLAUD_HOME: "~/Plaud" }))).toEqual([
      "Vault: not configured",
      "Projekte: not configured",
      "Plaud: configured",
      "Eingang: not configured",
      "Controlling: not configured",
    ]);
  });

  it("counts configured inbox watch dirs without naming their paths", () => {
    expect(describeSources(configFrom({ INBOX_WATCH: "~/a:/srv/b" }))).toEqual([
      "Vault: not configured",
      "Projekte: not configured",
      "Plaud: not configured",
      "Eingang: 2 watch dirs",
      "Controlling: not configured",
    ]);
  });

  it("says Controlling is configured without ever printing the machine path", () => {
    expect(
      describeSources(configFrom({ CONTROLLING_DIR: "~/Controlling" })),
    ).toEqual([
      "Vault: not configured",
      "Projekte: not configured",
      "Plaud: not configured",
      "Eingang: not configured",
      "Controlling: configured",
    ]);
  });
});
