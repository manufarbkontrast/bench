import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A per-suite scratch directory, removed in afterAll. */
export function scratchDir(prefix: string): {
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * An unborn checkout, optionally with an `origin` remote - enough for readGitState to read.
 * Never fetches, so a github.com remote here is offline-safe.
 */
export function initGitRepo(dir: string, remoteUrl?: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "--initial-branch=main", "."], {
    cwd: dir,
    stdio: "ignore",
  });
  if (remoteUrl)
    execFileSync("git", ["remote", "add", "origin", remoteUrl], {
      cwd: dir,
      stdio: "ignore",
    });
}

/**
 * A stale worktree pointer: `findRepos` sees the `.git` file and treats the directory as a
 * checkout, but the gitdir it names is gone, so any git command against it throws.
 */
export function initBrokenWorktree(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, ".git"),
    `gitdir: ${path.join(dir, "does-not-exist")}\n`,
  );
}
