import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findRepos, skippedDir } from "../../src/projekte/scan.js";
import { buildSampleProjects } from "../../src/projekte/sample.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-scan-");
let dir: string;
beforeAll(() => {
  dir = buildSampleProjects(path.join(scratch.dir, "sample"));
});
afterAll(scratch.cleanup);

describe("findRepos", () => {
  it("finds the three git checkouts and nothing else", () => {
    const found = findRepos([dir]);
    const names = found
      .map((p) => path.basename(p))
      .sort((a, b) => Number(a > b) - Number(a < b));
    expect(names).toEqual(["leuchtfeuer", "leuchtfeuer-alt", "treibgut"]);
  });
  it("returns each repo once for overlapping roots", () => {
    const found = findRepos([dir, path.join(dir, "werkstatt")]);
    expect(found.filter((p) => p.endsWith("leuchtfeuer"))).toHaveLength(1);
  });
  it("skips dot names, node_modules and the macOS bulk folders", () => {
    for (const name of [".cache", "node_modules", "Library", "Applications"])
      expect(skippedDir(name)).toBe(true);
    expect(skippedDir("werkstatt")).toBe(false);
  });
  it("copes with an unreadable root", () => {
    expect(findRepos([path.join(dir, "does-not-exist")])).toEqual([]);
  });
});
