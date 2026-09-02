import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type JobKind =
  | "plaud-sync"
  | "plaud-process"
  | "aufgaben-import"
  | "controlling"
  | "vault-reindex"
  | "projekte-scan";

export type JobPlan =
  | { kind: "spawn"; argv: string[]; cwd: string }
  | { kind: "internal"; name: "vault-reindex" | "projekte-scan" };

/**
 * `plaudHome` and `controllingDir` are both `string | null` for the same reason: a configured
 * Eingang can legitimately have INBOX_WATCH set without PLAUD_HOME, or without CONTROLLING_DIR
 * (see locate.ts and index.ts's wiring) - planJob refuses the kinds that need one on null rather
 * than silently borrowing the sample fixture, which stays tracked in the repo and must never be
 * the target of a real command.
 */
export interface JobPaths {
  plaudHome: string | null;
  vaultDir: string;
  controllingDir: string | null;
  skillsDir: string;
  sample: boolean;
}

/** Per-kind ceiling the runner (Task 4) kills a job at; both internal kinds share one budget. */
export const JOB_TIMEOUTS_MS: Record<JobKind, number> = {
  "plaud-sync": 5 * 60 * 1000,
  "plaud-process": 20 * 60 * 1000,
  "aufgaben-import": 15 * 60 * 1000,
  controlling: 45 * 60 * 1000,
  "vault-reindex": 10 * 60 * 1000,
  "projekte-scan": 10 * 60 * 1000,
};

/** The Task 4 fixture that stands in for a real job under sample data - never read here, only named. */
const FAKE_JOB_PATH = fileURLToPath(
  new URL("./fixture/fake-job.mjs", import.meta.url),
);

const JOB_KINDS: readonly JobKind[] = [
  "plaud-sync",
  "plaud-process",
  "aufgaben-import",
  "controlling",
  "vault-reindex",
  "projekte-scan",
];

function isJobKind(kind: string): kind is JobKind {
  return (JOB_KINDS as readonly string[]).includes(kind);
}

function fakeSpawn(kind: JobKind, cwd: string): JobPlan {
  return { kind: "spawn", argv: [process.execPath, FAKE_JOB_PATH, kind], cwd };
}

/**
 * A real file name comes from readdirSync as a bare basename - "/" or "\" here can only be an
 * attempt to read outside the expected directory, and a leading "." rules out both dotfiles and
 * ".." traversal, so this one check is the whole fence for a file argument's shape. Returns null
 * for anything that fails it, string otherwise, so callers narrow with one comparison.
 */
function fileNameOf(args: Record<string, unknown>): string | null {
  const file = args.file;
  if (
    typeof file !== "string" ||
    file.includes("/") ||
    file.includes("\\") ||
    file.startsWith(".")
  )
    return null;
  return file;
}

function rejectExtraArgs(
  args: Record<string, unknown>,
  kind: string,
): { error: string } | null {
  return Object.keys(args).length > 0
    ? { error: `${kind} takes no arguments` }
    : null;
}

function planPlaudSync(
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  const extra = rejectExtraArgs(args, "plaud-sync");
  if (extra) return extra;
  if (ctx.plaudHome === null) return { error: "plaud is not configured" };
  if (ctx.sample) return fakeSpawn("plaud-sync", ctx.plaudHome);
  return {
    kind: "spawn",
    argv: [
      "/bin/bash",
      path.join(ctx.skillsDir, "plaud", "scripts", "plaud-sync.sh"),
    ],
    cwd: ctx.plaudHome,
  };
}

function planPlaudProcess(
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  const file = fileNameOf(args);
  if (file === null) return { error: "file must be a bare filename" };
  if (ctx.plaudHome === null) return { error: "plaud is not configured" };
  const target = path.join(ctx.plaudHome, "inbox", file);
  if (!existsSync(target) || !statSync(target).isFile())
    return { error: `no such inbox file: ${file}` };
  if (ctx.sample) return fakeSpawn("plaud-process", ctx.plaudHome);
  return {
    kind: "spawn",
    argv: [
      "claude",
      "-p",
      `Verarbeite mit dem plaud-Skill die Transkript-Datei ${ctx.plaudHome}/inbox/${file} zu einer Meeting-Notiz und archiviere das Original. Schreibe nur unter ${ctx.plaudHome}.`,
      "--max-turns",
      "40",
      "--allowedTools",
      "Read,Glob,Grep,Write,Edit,Skill,Bash",
    ],
    cwd: ctx.plaudHome,
  };
}

function planAufgabenImport(
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  const file = fileNameOf(args);
  if (file === null) return { error: "file must be a bare filename" };
  if (ctx.plaudHome === null) return { error: "plaud is not configured" };
  const target = path.join(ctx.plaudHome, "notizen", file);
  if (!existsSync(target) || !statSync(target).isFile())
    return { error: `no such notizen file: ${file}` };
  if (ctx.sample) return fakeSpawn("aufgaben-import", ctx.vaultDir);
  return {
    kind: "spawn",
    argv: [
      "claude",
      "-p",
      `Führe das aufgaben-import-Skill für die Plaud-Notiz ${ctx.plaudHome}/notizen/${file} aus. Schreibe nur in den Vault unter ${ctx.vaultDir}.`,
      "--max-turns",
      "30",
      "--allowedTools",
      "Read,Glob,Grep,Write,Edit,Skill",
      "--add-dir",
      ctx.vaultDir,
    ],
    cwd: ctx.vaultDir,
  };
}

function planControlling(
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  const modus = args.modus;
  if (modus !== "zwischenstand" && modus !== "abschluss")
    return { error: 'modus must be "zwischenstand" or "abschluss"' };
  if (ctx.controllingDir === null)
    return { error: "controlling is not configured" };
  if (ctx.sample) return fakeSpawn("controlling", ctx.controllingDir);
  return {
    kind: "spawn",
    argv: [
      "/bin/bash",
      path.join(
        ctx.skillsDir,
        "shoesplease-controlling",
        "scripts",
        "geplanter_lauf.sh",
      ),
      modus,
    ],
    cwd: ctx.controllingDir,
  };
}

function planInternal(
  name: "vault-reindex" | "projekte-scan",
  args: Record<string, unknown>,
): JobPlan | { error: string } {
  const extra = rejectExtraArgs(args, name);
  if (extra) return extra;
  return { kind: "internal", name };
}

/**
 * The write fence: every job Bench can run passes through here, and every check below runs
 * before any argv or cwd is built - an unknown kind or a bad argument never reaches a command.
 */
export function planJob(
  kind: string,
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  if (!isJobKind(kind)) return { error: `unknown job kind: ${kind}` };
  switch (kind) {
    case "plaud-sync":
      return planPlaudSync(args, ctx);
    case "plaud-process":
      return planPlaudProcess(args, ctx);
    case "aufgaben-import":
      return planAufgabenImport(args, ctx);
    case "controlling":
      return planControlling(args, ctx);
    case "vault-reindex":
      return planInternal("vault-reindex", args);
    case "projekte-scan":
      return planInternal("projekte-scan", args);
  }
}
