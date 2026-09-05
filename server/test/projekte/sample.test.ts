import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSampleProjects } from "../../src/projekte/sample.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-sample-");
let dir: string;
beforeAll(() => {
  dir = buildSampleProjects(path.join(scratch.dir, "sample"));
});
afterAll(scratch.cleanup);

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("buildSampleProjects", () => {
  it("creates the workshop once and is idempotent", () => {
    expect(buildSampleProjects(dir)).toBe(dir);
    expect(existsSync(path.join(dir, "werkstatt", "leuchtfeuer", ".git"))).toBe(
      true,
    );
  });
  it("leaves leuchtfeuer one ahead and dirty on main", () => {
    const repo = path.join(dir, "werkstatt", "leuchtfeuer");
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(git(repo, "rev-list", "--count", "origin/main..HEAD")).toBe("1");
    expect(git(repo, "status", "--porcelain")).not.toBe("");
  });
  it("leaves the alt clone one behind and clean", () => {
    const repo = path.join(dir, "archiv", "leuchtfeuer-alt");
    expect(git(repo, "rev-list", "--count", "HEAD..origin/main")).toBe("1");
    expect(git(repo, "status", "--porcelain")).toBe("");
  });
  it("gives treibgut a commit but no remote", () => {
    const repo = path.join(dir, "werkstatt", "treibgut");
    expect(git(repo, "remote")).toBe("");
    expect(git(repo, "rev-list", "--count", "HEAD")).toBe("1");
  });
  it("plants the decoys and the plain folder", () => {
    expect(existsSync(path.join(dir, ".cache", "hidden", ".git"))).toBe(true);
    expect(
      existsSync(path.join(dir, "werkstatt", "node_modules", "dep", ".git")),
    ).toBe(true);
    expect(
      existsSync(path.join(dir, "atelier", "strandgut", "notizen.txt")),
    ).toBe(true);
  });
});
