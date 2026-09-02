import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  JOB_TIMEOUTS_MS,
  planJob,
  type JobKind,
  type JobPaths,
  type JobPlan,
} from "../../src/eingang/jobs.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-eingang-jobs-");
afterAll(scratch.cleanup);

const FAKE_JOB_PATH = fileURLToPath(
  new URL("../../src/eingang/fixture/fake-job.mjs", import.meta.url),
);

/** Narrows a planJob result to its spawn variant, failing loudly on an error or an internal plan. */
function expectSpawn(
  result: JobPlan | { error: string },
): Extract<JobPlan, { kind: "spawn" }> {
  if (!("kind" in result))
    throw new Error(`expected a plan, got error: ${result.error}`);
  if (result.kind !== "spawn") throw new Error("expected a spawn plan");
  return result;
}

let n = 0;
/** A fresh plaud/vault/controlling/skills world, none of it borrowed between tests. */
function world(overrides: Partial<JobPaths> = {}): JobPaths {
  n += 1;
  const base = path.join(scratch.dir, `world-${n}`);
  const plaudHome = path.join(base, "plaud");
  const vaultDir = path.join(base, "vault");
  const controllingDir = path.join(base, "controlling");
  const skillsDir = path.join(base, "skills");
  mkdirSync(path.join(plaudHome, "inbox"), { recursive: true });
  mkdirSync(path.join(plaudHome, "notizen"), { recursive: true });
  mkdirSync(vaultDir, { recursive: true });
  mkdirSync(controllingDir, { recursive: true });
  return {
    plaudHome,
    vaultDir,
    controllingDir,
    skillsDir,
    sample: false,
    ...overrides,
  };
}

describe("planJob - the fence", () => {
  it("rejects an unknown kind before building anything", () => {
    const result = planJob("nonsense", {}, world());
    expect(result).toEqual({ error: expect.any(String) as string });
  });

  describe("plaud-process", () => {
    const hostileFiles = ["../x", "a/b", "a\\b", ".hidden"];
    for (const file of hostileFiles) {
      it(`rejects file: ${JSON.stringify(file)}`, () => {
        const ctx = world();
        const result = planJob("plaud-process", { file }, ctx);
        expect(result).toEqual({ error: expect.any(String) as string });
      });
    }

    it("rejects a file argument that names nothing in the inbox", () => {
      const ctx = world();
      const result = planJob("plaud-process", { file: "missing.txt" }, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });

    it("rejects a non-string file argument", () => {
      const ctx = world();
      const result = planJob("plaud-process", { file: 123 }, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });

    it("rejects a missing file argument", () => {
      const ctx = world();
      const result = planJob("plaud-process", {}, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });

    it("builds a claude invocation naming the absolute inbox path for a real file", () => {
      const ctx = world();
      writeFileSync(
        path.join(ctx.plaudHome!, "inbox", "real-transcript.txt"),
        "content",
      );

      const plan = expectSpawn(
        planJob("plaud-process", { file: "real-transcript.txt" }, ctx),
      );

      expect(plan.argv).toEqual([
        "claude",
        "-p",
        `Verarbeite mit dem plaud-Skill die Transkript-Datei ${ctx.plaudHome}/inbox/real-transcript.txt zu einer Meeting-Notiz und archiviere das Original. Schreibe nur unter ${ctx.plaudHome}.`,
        "--max-turns",
        "40",
        "--allowedTools",
        "Read,Glob,Grep,Write,Edit,Skill,Bash",
      ]);
      expect(plan.cwd).toBe(ctx.plaudHome);
    });
  });

  describe("aufgaben-import", () => {
    it("rejects a hostile file argument", () => {
      const ctx = world();
      const result = planJob("aufgaben-import", { file: "../x" }, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });

    it("rejects a file argument that names nothing in notizen", () => {
      const ctx = world();
      const result = planJob("aufgaben-import", { file: "missing.md" }, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });

    it("builds a claude invocation naming the absolute notizen path for a real file", () => {
      const ctx = world();
      writeFileSync(path.join(ctx.plaudHome!, "notizen", "note.md"), "content");

      const plan = expectSpawn(
        planJob("aufgaben-import", { file: "note.md" }, ctx),
      );

      expect(plan.argv).toEqual([
        "claude",
        "-p",
        `Führe das aufgaben-import-Skill für die Plaud-Notiz ${ctx.plaudHome}/notizen/note.md aus. Schreibe nur in den Vault unter ${ctx.vaultDir}.`,
        "--max-turns",
        "30",
        "--allowedTools",
        "Read,Glob,Grep,Write,Edit,Skill",
        "--add-dir",
        ctx.vaultDir,
      ]);
      expect(plan.cwd).toBe(ctx.vaultDir);
    });
  });

  describe("controlling", () => {
    it("rejects a modus other than zwischenstand or abschluss", () => {
      const ctx = world();
      const result = planJob("controlling", { modus: "beides" }, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });

    it("builds a bash invocation ending with the modus", () => {
      const ctx = world();

      const plan = expectSpawn(
        planJob("controlling", { modus: "zwischenstand" }, ctx),
      );

      expect(plan.argv).toEqual([
        "/bin/bash",
        path.join(
          ctx.skillsDir,
          "shoesplease-controlling",
          "scripts",
          "geplanter_lauf.sh",
        ),
        "zwischenstand",
      ]);
      expect(plan.cwd).toBe(ctx.controllingDir);
    });

    it("errors when controllingDir is null even with a valid modus", () => {
      const ctx = world({ controllingDir: null });
      const result = planJob("controlling", { modus: "abschluss" }, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });
  });

  describe("no-arg kinds", () => {
    const noArgKinds: JobKind[] = [
      "plaud-sync",
      "vault-reindex",
      "projekte-scan",
    ];
    for (const kind of noArgKinds) {
      it(`rejects ${kind} with any extra argument`, () => {
        const ctx = world();
        const result = planJob(kind, { extra: "nope" }, ctx);
        expect(result).toEqual({ error: expect.any(String) as string });
      });
    }

    it("builds the plaud-sync bash invocation with no args", () => {
      const ctx = world();

      const plan = expectSpawn(planJob("plaud-sync", {}, ctx));

      expect(plan.argv).toEqual([
        "/bin/bash",
        path.join(ctx.skillsDir, "plaud", "scripts", "plaud-sync.sh"),
      ]);
      expect(plan.cwd).toBe(ctx.plaudHome);
    });

    it("resolves vault-reindex to an internal plan", () => {
      const ctx = world();
      expect(planJob("vault-reindex", {}, ctx)).toEqual({
        kind: "internal",
        name: "vault-reindex",
      });
    });

    it("resolves projekte-scan to an internal plan", () => {
      const ctx = world();
      expect(planJob("projekte-scan", {}, ctx)).toEqual({
        kind: "internal",
        name: "projekte-scan",
      });
    });
  });

  describe("an unconfigured plaudHome", () => {
    it("errors plaud-sync before building anything, even with no other problem", () => {
      const ctx = world({ plaudHome: null });
      const result = planJob("plaud-sync", {}, ctx);
      expect(result).toEqual({ error: "plaud is not configured" });
    });

    it("errors plaud-process before the file even gets checked against the inbox", () => {
      const ctx = world({ plaudHome: null });
      const result = planJob(
        "plaud-process",
        { file: "does-not-matter.txt" },
        ctx,
      );
      expect(result).toEqual({ error: "plaud is not configured" });
    });

    it("errors aufgaben-import before the file even gets checked against notizen", () => {
      const ctx = world({ plaudHome: null });
      const result = planJob(
        "aufgaben-import",
        { file: "does-not-matter.md" },
        ctx,
      );
      expect(result).toEqual({ error: "plaud is not configured" });
    });

    it("still rejects a hostile file argument before the plaudHome check on plaud-process", () => {
      const ctx = world({ plaudHome: null });
      const result = planJob("plaud-process", { file: "../x" }, ctx);
      expect(result).toEqual({ error: "file must be a bare filename" });
    });
  });

  describe("sample mode", () => {
    it("replaces every spawn kind's argv with the fake job invocation, leaving internal kinds untouched", () => {
      const ctx = world({ sample: true });
      writeFileSync(
        path.join(ctx.plaudHome!, "inbox", "sample-transcript.txt"),
        "content",
      );
      writeFileSync(path.join(ctx.plaudHome!, "notizen", "sample.md"), "x");

      expect(planJob("plaud-sync", {}, ctx)).toEqual({
        kind: "spawn",
        argv: [process.execPath, FAKE_JOB_PATH, "plaud-sync"],
        cwd: ctx.plaudHome,
      });

      expect(
        planJob("plaud-process", { file: "sample-transcript.txt" }, ctx),
      ).toEqual({
        kind: "spawn",
        argv: [process.execPath, FAKE_JOB_PATH, "plaud-process"],
        cwd: ctx.plaudHome,
      });

      expect(planJob("aufgaben-import", { file: "sample.md" }, ctx)).toEqual({
        kind: "spawn",
        argv: [process.execPath, FAKE_JOB_PATH, "aufgaben-import"],
        cwd: ctx.vaultDir,
      });

      expect(planJob("controlling", { modus: "abschluss" }, ctx)).toEqual({
        kind: "spawn",
        argv: [process.execPath, FAKE_JOB_PATH, "controlling"],
        cwd: ctx.controllingDir,
      });

      expect(planJob("vault-reindex", {}, ctx)).toEqual({
        kind: "internal",
        name: "vault-reindex",
      });
      expect(planJob("projekte-scan", {}, ctx)).toEqual({
        kind: "internal",
        name: "projekte-scan",
      });
    });

    it("still runs the fence in sample mode - a hostile file is still rejected", () => {
      const ctx = world({ sample: true });
      const result = planJob("plaud-process", { file: "../x" }, ctx);
      expect(result).toEqual({ error: expect.any(String) as string });
    });
  });
});

describe("JOB_TIMEOUTS_MS", () => {
  it("gives every job kind a ceiling, in minutes matching the brief", () => {
    const minutes = (ms: number): number => ms / 60_000;
    const byMinutes = Object.fromEntries(
      Object.entries(JOB_TIMEOUTS_MS).map(([kind, ms]) => [kind, minutes(ms)]),
    );
    expect(byMinutes).toEqual({
      "plaud-sync": 5,
      "plaud-process": 20,
      "aufgaben-import": 15,
      controlling: 45,
      "vault-reindex": 10,
      "projekte-scan": 10,
    });
  });
});
