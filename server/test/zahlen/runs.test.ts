import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { lastRun, listRuns } from "../../src/zahlen/runs.js";
import { scratchDir } from "./tmp.js";

const CONTROLLING_FIXTURE = fileURLToPath(
  new URL("../../src/eingang/fixture/controlling", import.meta.url),
);

const scratch = scratchDir("bench-zahlen-runs-");
afterAll(scratch.cleanup);

describe("listRuns", () => {
  it("lists the two fixture folders newest first", () => {
    expect(listRuns(CONTROLLING_FIXTURE)).toEqual([
      {
        folder: "2026-08-15-zwischenstand",
        stichtag: "2026-08-15",
        modus: "zwischenstand",
      },
      {
        folder: "2026-07-15-zwischenstand",
        stichtag: "2026-07-15",
        modus: "zwischenstand",
      },
    ]);
  });

  it("ignores a subfolder that does not match the run-folder shape", () => {
    const dir = path.join(scratch.dir, "mixed");
    mkdirSync(path.join(dir, "2026-08-15-zwischenstand"), {
      recursive: true,
    });
    mkdirSync(path.join(dir, "not-a-run"), { recursive: true });

    expect(listRuns(dir).map((run) => run.folder)).toEqual([
      "2026-08-15-zwischenstand",
    ]);
  });

  it("returns an empty array for an unreadable directory", () => {
    expect(listRuns(path.join(scratch.dir, "does-not-exist"))).toEqual([]);
  });
});

describe("lastRun", () => {
  it("uses letzter-lauf.json's ordner basename, ignoring the invented absolute path", () => {
    expect(lastRun(CONTROLLING_FIXTURE)).toEqual({
      folder: "2026-08-15-zwischenstand",
      stichtag: "2026-08-15",
      modus: "zwischenstand",
    });
  });

  it("falls back to the newest listed folder when letzter-lauf.json is missing", () => {
    const dir = path.join(scratch.dir, "no-letzter-lauf");
    cpSync(CONTROLLING_FIXTURE, dir, { recursive: true });
    rmSync(path.join(dir, "letzter-lauf.json"));

    expect(lastRun(dir)?.folder).toBe("2026-08-15-zwischenstand");
  });

  it("returns null for an empty directory", () => {
    const dir = path.join(scratch.dir, "empty");
    mkdirSync(dir, { recursive: true });

    expect(lastRun(dir)).toBeNull();
  });
});
