import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listProjects, openProjekteDb } from "../../src/projekte/db.js";
import type { GhRunner } from "../../src/projekte/gh.js";
import { scanProjects } from "../../src/projekte/pipeline.js";
import { buildSampleProjects } from "../../src/projekte/sample.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-pipeline-");
let sample: string;

beforeAll(() => {
  sample = buildSampleProjects(path.join(scratch.dir, "sample"));
});
afterAll(scratch.cleanup);

function buildVault(sampleDir: string): Database.Database {
  const db = openVaultDb(":memory:");
  const insertNote = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertTag = db.prepare("INSERT INTO tags (path, tag) VALUES (?, ?)");
  insertNote.run(
    "leuchtfeuer.md",
    "Leuchtfeuer",
    "",
    JSON.stringify({ path: path.join(sampleDir, "werkstatt", "leuchtfeuer") }),
    "",
    0,
    0,
  );
  insertTag.run("leuchtfeuer.md", "brand/leuchtfeuer");
  insertTag.run("leuchtfeuer.md", "status/aktiv");
  insertNote.run(
    "strandgut.md",
    "Strandgut",
    "",
    JSON.stringify({ path: path.join(sampleDir, "atelier", "strandgut") }),
    "",
    0,
    0,
  );
  return db;
}

describe("scanProjects", () => {
  it("builds git and folder rows, couples notes, and groups the duplicate pair", async () => {
    const vaultDb = buildVault(sample);
    const db = openProjekteDb(":memory:");

    const summary = await scanProjects(db, vaultDb, [sample], "off");

    expect(summary.projects).toBe(4);
    expect(summary.repos).toBe(3);
    expect(summary.folders).toBe(1);
    expect(summary.duplicates).toBe(2);
    expect(Number.isFinite(summary.ms)).toBe(true);

    const rows = listProjects(db);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.issues === null && r.prs === null)).toBe(true);

    const leuchtfeuer = rows.find(
      (r) => r.path === path.join(sample, "werkstatt", "leuchtfeuer"),
    );
    expect(leuchtfeuer?.kind).toBe("git");
    expect(leuchtfeuer?.brand).toBe("leuchtfeuer");
    expect(leuchtfeuer?.status).toBe("aktiv");
    expect(leuchtfeuer?.notePath).toBe("leuchtfeuer.md");

    const strandgut = rows.find(
      (r) => r.path === path.join(sample, "atelier", "strandgut"),
    );
    expect(strandgut?.kind).toBe("folder");
    expect(strandgut?.notePath).toBe("strandgut.md");
    expect(strandgut?.brand).toBeNull();

    const treibgut = rows.find((r) => r.name === "treibgut");
    expect(treibgut?.groupKey.startsWith("name:")).toBe(true);

    const pair = rows.filter(
      (r) => r.name === "leuchtfeuer" || r.name === "leuchtfeuer-alt",
    );
    expect(pair).toHaveLength(2);
    expect(new Set(pair.map((r) => r.groupKey)).size).toBe(1);
    expect(pair.every((r) => r.groupKey === leuchtfeuer?.groupKey)).toBe(true);

    const before = listProjects(db).length;
    await scanProjects(db, vaultDb, [sample], "off");
    expect(listProjects(db)).toHaveLength(before);
  });

  it("never calls the gh runner for the sample - its origin is a filesystem path", async () => {
    const vaultDb = buildVault(sample);
    const db = openProjekteDb(":memory:");
    const run: GhRunner = vi.fn(() => Promise.resolve("{}"));

    await scanProjects(db, vaultDb, [sample], run);

    expect(run).toHaveBeenCalledTimes(0);
    expect(
      listProjects(db).every((r) => r.issues === null && r.prs === null),
    ).toBe(true);
  });
});
