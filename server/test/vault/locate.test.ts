import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { locateVault } from "../../src/vault/locate.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("locateVault", () => {
  it("uses the configured directory when it exists", () => {
    dir = mkdtempSync(path.join(tmpdir(), "bench-vault-"));
    expect(locateVault({ vaultDir: dir, projectRoots: [] }, "/sample")).toEqual(
      {
        dir,
        source: "configured",
      },
    );
  });

  it("falls back to the sample when nothing is configured", () => {
    expect(locateVault({ projectRoots: [] }, "/sample")).toEqual({
      dir: "/sample",
      source: "sample",
    });
  });

  it("falls back to the sample and names a configured path that does not exist", () => {
    const gone = path.join(tmpdir(), "bench-vault-does-not-exist");
    expect(
      locateVault({ vaultDir: gone, projectRoots: [] }, "/sample"),
    ).toEqual({
      dir: "/sample",
      source: "sample",
      missing: gone,
    });
  });
});
