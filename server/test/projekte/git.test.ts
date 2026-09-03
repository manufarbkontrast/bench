import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readGitState } from "../../src/projekte/git.js";
import { buildSampleProjects } from "../../src/projekte/sample.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-git-");
let dir: string;
beforeAll(() => {
  dir = buildSampleProjects(path.join(scratch.dir, "sample"));
});
afterAll(scratch.cleanup);

describe("readGitState", () => {
  it("reads leuchtfeuer as ahead and dirty on main", async () => {
    const state = await readGitState(
      path.join(dir, "werkstatt", "leuchtfeuer"),
    );
    expect(state.branch).toBe("main");
    expect(state.dirty).toBe(1);
    expect(state.ahead).toBe(1);
    expect(state.behind).toBe(0);
    expect(state.remote).not.toBeNull();
    expect(state.remote?.endsWith("/leuchtfeuer.git")).toBe(true);
    expect(state.lastCommitSubject).toBe("feat: hang the lamp");
    expect(state.lastCommitAt).not.toBeNull();
    expect(Number.isFinite(state.lastCommitAt)).toBe(true);
  });

  it("reads the alt clone as behind and clean", async () => {
    const state = await readGitState(
      path.join(dir, "archiv", "leuchtfeuer-alt"),
    );
    expect(state.dirty).toBe(0);
    expect(state.ahead).toBe(0);
    expect(state.behind).toBe(1);
  });

  it("reads treibgut as remoteless with no upstream", async () => {
    const state = await readGitState(path.join(dir, "werkstatt", "treibgut"));
    expect(state.remote).toBeNull();
    expect(state.ahead).toBeNull();
    expect(state.behind).toBeNull();
  });

  it("falls back to the only remote when it is not named origin", async () => {
    const repo = path.join(scratch.dir, "backup-only");
    mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "--initial-branch=main", "."], {
      cwd: repo,
      stdio: "ignore",
    });
    const backupUrl = path.join(scratch.dir, "backup-origin.git");
    execFileSync("git", ["remote", "add", "backup", backupUrl], {
      cwd: repo,
      stdio: "ignore",
    });
    const state = await readGitState(repo);
    expect(state.remote).toBe(backupUrl);
  });

  it("counts an untracked directory once, matching plain git status - not once per file inside it", async () => {
    const repo = path.join(scratch.dir, "untracked-dir");
    mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "--initial-branch=main", "."], {
      cwd: repo,
      stdio: "ignore",
    });
    writeFileSync(path.join(repo, "tracked.txt"), "a\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd: repo, stdio: "ignore" });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=bench@example.com",
        "-c",
        "user.name=Bench",
        "commit",
        "-m",
        "init",
      ],
      { cwd: repo, stdio: "ignore" },
    );
    appendFileSync(path.join(repo, "tracked.txt"), "b\n");
    mkdirSync(path.join(repo, "untracked"));
    writeFileSync(path.join(repo, "untracked", "one.txt"), "1\n");
    writeFileSync(path.join(repo, "untracked", "two.txt"), "2\n");

    const state = await readGitState(repo);
    expect(state.dirty).toBe(2);
  });

  it("does not throw on an unborn HEAD", async () => {
    const empty = path.join(scratch.dir, "empty");
    mkdirSync(empty, { recursive: true });
    execFileSync("git", ["init", "--initial-branch=main", "."], {
      cwd: empty,
      stdio: "ignore",
    });
    const state = await readGitState(empty);
    expect(state.branch).toBe("main");
    expect(state.lastCommitAt).toBeNull();
    expect(state.lastCommitSubject).toBeNull();
    expect(state.dirty).toBe(0);
    expect(state.ahead).toBeNull();
    expect(state.behind).toBeNull();
  });
});
