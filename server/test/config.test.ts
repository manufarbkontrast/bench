import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { configFrom, describeSources, loadConfig } from "../src/config.js";

const tempDirs: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.VAULT_DIR;
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("configFrom", () => {
  it("reads the vault path", () => {
    expect(configFrom({ VAULT_DIR: "/v" }).vaultDir).toBe("/v");
  });

  it("treats a missing or blank value as unset", () => {
    expect(configFrom({}).vaultDir).toBeUndefined();
    expect(configFrom({ VAULT_DIR: "   " }).vaultDir).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("reads .env from the root when it exists", () => {
    const root = tempRoot();
    writeFileSync(path.join(root, ".env"), "VAULT_DIR=/from-file\n");
    delete process.env.VAULT_DIR;
    expect(loadConfig(root).vaultDir).toBe("/from-file");
  });

  it("copes without a .env", () => {
    const root = tempRoot();
    delete process.env.VAULT_DIR;
    expect(loadConfig(root).vaultDir).toBeUndefined();
  });
});

describe("describeSources", () => {
  it("names the vault and says when it is not configured", () => {
    expect(describeSources(configFrom({ VAULT_DIR: "/v" }))).toEqual([
      "Vault: /v",
    ]);
    expect(describeSources(configFrom({}))).toEqual(["Vault: not configured"]);
  });
});
