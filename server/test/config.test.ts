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
    ]);
    expect(describeSources(configFrom({}))).toEqual([
      "Vault: not configured",
      "Projekte: not configured",
    ]);
  });

  it("counts configured project roots without naming their paths", () => {
    expect(
      describeSources(configFrom({ PROJECT_ROOTS: "~/a:/srv/b" })),
    ).toEqual(["Vault: not configured", "Projekte: 2 roots"]);
  });
});
