import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Global and system git config stay out so the build is identical on every machine. */
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.email=bench@example.com",
      "-c",
      "user.name=Bench",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, env: GIT_ENV, stdio: "ignore" },
  );
}

function commit(
  cwd: string,
  file: string,
  content: string,
  message: string,
): void {
  writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", message);
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--initial-branch=main", ".");
}

/**
 * A deterministic miniature of the real machine: a duplicate pair sharing one origin (ahead and
 * dirty on one side, behind on the other), a repo with no remote, a plain working folder, and
 * two decoys the scanner must skip. Idempotent: an existing directory is trusted as built.
 */
export function buildSampleProjects(dir: string): string {
  if (existsSync(dir)) return dir;
  const origin = path.join(dir, ".origins", "leuchtfeuer.git");
  mkdirSync(origin, { recursive: true });
  git(origin, "init", "--bare", "--initial-branch=main", ".");

  const feuer = path.join(dir, "werkstatt", "leuchtfeuer");
  initRepo(feuer);
  git(feuer, "remote", "add", "origin", origin);
  commit(feuer, "README.md", "# Leuchtfeuer\n", "feat: first light");
  commit(feuer, "tower.txt", "stone\n", "feat: raise the tower");
  git(feuer, "push", "-u", "origin", "main");

  const archiv = path.join(dir, "archiv");
  mkdirSync(archiv, { recursive: true });
  git(archiv, "clone", origin, "leuchtfeuer-alt");
  git(path.join(archiv, "leuchtfeuer-alt"), "reset", "--hard", "HEAD~1");

  commit(feuer, "lamp.txt", "oil\n", "feat: hang the lamp");
  appendFileSync(path.join(feuer, "tower.txt"), "brick\n");

  const treibgut = path.join(dir, "werkstatt", "treibgut");
  initRepo(treibgut);
  commit(treibgut, "notes.md", "flotsam\n", "feat: collect flotsam");

  const strandgut = path.join(dir, "atelier", "strandgut");
  mkdirSync(strandgut, { recursive: true });
  writeFileSync(path.join(strandgut, "notizen.txt"), "sand\n");

  initRepo(path.join(dir, ".cache", "hidden"));
  initRepo(path.join(dir, "werkstatt", "node_modules", "dep"));
  return dir;
}
