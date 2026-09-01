import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
