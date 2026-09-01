import { mkdirSync } from "node:fs";
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

  it("finds a repo nested under a parent-first configured root pair, in either order", () => {
    const parent = path.join(scratch.dir, "nested-root", "downloads");
    const nested = path.join(parent, "Projekte");
    const repo = path.join(nested, "a", "b", "repo-with-git");
    mkdirSync(path.join(repo, ".git"), { recursive: true });

    // The user's real order: the parent root before the root nested inside it. The parent's own
    // depth budget cannot reach a repo four levels down, but the nested root's budget can - and
    // must not be short-circuited just because the parent's walk already visited that directory.
    const parentFirst = findRepos([parent, nested]);
    expect(parentFirst.filter((p) => p === repo)).toHaveLength(1);

    const nestedFirst = findRepos([nested, parent]);
    expect(nestedFirst.filter((p) => p === repo)).toHaveLength(1);
  });
});
