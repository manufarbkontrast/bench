import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocal, localRecordingIds } from "./inbox.js";

export type JobKind =
  | "plaud-sync"
  | "plaud-process"
  | "aufgaben-import"
  | "controlling"
  | "vault-reindex"
  | "projekte-scan"
  | "plaud-fetch";

export type InternalName = "vault-reindex" | "projekte-scan" | "plaud-fetch";

export type JobPlan =
  | { kind: "spawn"; argv: string[]; cwd: string }
  | { kind: "internal"; name: InternalName; args: Record<string, unknown> };

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
  projektSlugs: () => string[]; // the handoff slugs the vault index knows, injected by the root
}

/** Per-kind ceiling the runner (Task 4) kills a job at; the three internal kinds get 10, 10 and
    5 minutes respectively, not one shared budget. */
export const JOB_TIMEOUTS_MS: Record<JobKind, number> = {
  "plaud-sync": 5 * 60 * 1000,
  "plaud-process": 20 * 60 * 1000,
  "aufgaben-import": 15 * 60 * 1000,
  controlling: 45 * 60 * 1000,
  "vault-reindex": 10 * 60 * 1000,
  "projekte-scan": 10 * 60 * 1000,
  "plaud-fetch": 5 * 60 * 1000,
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
  "plaud-fetch",
];

/** A Plaud recording id, as the MCP hands it back - never a path, never free text. */
const RECORDING_ID = /^[A-Za-z0-9_-]{1,64}$/;

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

/**
 * Whether `target`'s realpath resolves inside `folder`'s realpath - decision 4's containment for
 * a job's file argument, the same boundary vault/write.ts's resolvesInsideVault draws for a vault
 * write, kept as a same-module helper here rather than a cross-app import since eingang and vault
 * stay separate per PROJECT.md's per-app boundary. `fileNameOf` only lets through a bare basename
 * with no "/" - which still names something outside `folder` once it is a symlink, and that is
 * exactly what this catches. Unlike the vault guard, `target` here has already been proven to
 * exist by the existsSync/statSync check next to every call site, so there is no dangling-path
 * case to walk around: realpathSync resolves both sides outright.
 */
export function resolvesInsideFolder(folder: string, target: string): boolean {
  const folderReal = realpathSync(folder);
  const targetReal = realpathSync(target);
  return targetReal.startsWith(folderReal + path.sep);
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

/**
 * The optional handoff slug plaud-process's prompt appends to the note it will write: absent
 * means none, a non-string is a caller error, and a string is checked against the vault index's
 * own slugs (injected via `ctx.projektSlugs`) rather than trusted as free text.
 */
function projektArgOf(
  args: Record<string, unknown>,
  ctx: JobPaths,
): string | null | { error: string } {
  const projekt = args.projekt;
  if (projekt === undefined) return null;
  if (typeof projekt !== "string") return { error: "projekt must be a string" };
  if (!ctx.projektSlugs().includes(projekt))
    return { error: `unknown projekt: ${projekt}` };
  return projekt;
}

function planPlaudProcess(
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  const file = fileNameOf(args);
  if (file === null) return { error: "file must be a bare filename" };
  if (ctx.plaudHome === null) return { error: "plaud is not configured" };
  const inbox = path.join(ctx.plaudHome, "inbox");
  const target = path.join(inbox, file);
  if (!existsSync(target) || !statSync(target).isFile())
    return { error: `no such inbox file: ${file}` };
  if (!resolvesInsideFolder(inbox, target))
    return { error: `file escapes the inbox folder: ${file}` };
  const projekt = projektArgOf(args, ctx);
  if (typeof projekt === "object" && projekt !== null) return projekt;
  if (ctx.sample) return fakeSpawn("plaud-process", ctx.plaudHome);
  const projektHint =
    projekt === null
      ? ""
      : ` Trage projekt: ${projekt} in das Frontmatter der Notiz ein.`;
  return {
    kind: "spawn",
    argv: [
      "claude",
      "-p",
      `Verarbeite mit dem plaud-Skill die Transkript-Datei ${ctx.plaudHome}/inbox/${file} zu einer Meeting-Notiz und archiviere das Original. Schreibe nur unter ${ctx.plaudHome}.${projektHint}`,
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
  const notizen = path.join(ctx.plaudHome, "notizen");
  const target = path.join(notizen, file);
  if (!existsSync(target) || !statSync(target).isFile())
    return { error: `no such notizen file: ${file}` };
  if (!resolvesInsideFolder(notizen, target))
    return { error: `file escapes the notizen folder: ${file}` };
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
  return { kind: "internal", name, args: {} };
}

function planPlaudFetch(
  args: Record<string, unknown>,
  ctx: JobPaths,
): JobPlan | { error: string } {
  const id = args.id;
  if (typeof id !== "string" || !RECORDING_ID.test(id))
    return { error: "id must be a recording id" };
  if (Object.keys(args).length !== 1)
    return { error: "plaud-fetch takes only id" };
  if (ctx.plaudHome === null) return { error: "plaud is not configured" };
  const local = localRecordingIds({
    inboxDir: path.join(ctx.plaudHome, "inbox"),
    archivDir: path.join(ctx.plaudHome, "archiv"),
    notizenDir: path.join(ctx.plaudHome, "notizen"),
  });
  if (isLocal(id, local)) return { error: `recording already local: ${id}` };
  return { kind: "internal", name: "plaud-fetch", args: { id } };
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
    case "plaud-fetch":
      return planPlaudFetch(args, ctx);
  }
}
