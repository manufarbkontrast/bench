import path from "node:path";
import type Database from "better-sqlite3";
import type express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as scanModule from "../../src/projekte/scan.js";
import { listProjects, openProjekteDb } from "../../src/projekte/db.js";
import type { ProjekteContext } from "../../src/projekte/routes.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { VaultContext } from "../../src/vault/routes/index.js";
import { appWithProjekte, buildSampleContext } from "./app.js";
import { initGitRepo, scratchDir } from "./tmp.js";

vi.mock("../../src/projekte/scan.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/projekte/scan.js")>();
  return { ...actual, findRepos: vi.fn(actual.findRepos) };
});

interface ListedProjectJson {
  path: string;
  name: string;
  groupKey: string;
  kind: string;
  isDuplicate: boolean;
  sameName: boolean;
}
interface ListResponse {
  scannedAt: number | null;
  summary: { projects: number } | null;
  projects: ListedProjectJson[];
}

const scratch = scratchDir("bench-projekte-routes-");
afterAll(scratch.cleanup);

let app: express.Express;
let sampleDir: string;

beforeAll(() => {
  const ctx = buildSampleContext(path.join(scratch.dir, "main"));
  app = appWithProjekte(ctx.projekte, ctx.vault);
  sampleDir = ctx.sampleDir;
});

describe("GET /api/projekte/list", () => {
  it("scans the empty table once and marks exactly the leuchtfeuer pair as duplicates", async () => {
    const res = await request(app).get("/api/projekte/list");
    expect(res.status).toBe(200);
    const body = res.body as ListResponse;
    expect(body.projects).toHaveLength(4);
    expect(body.projects.filter((p) => p.isDuplicate)).toHaveLength(2);
    expect(
      body.projects
        .filter((p) => p.isDuplicate)
        .map((p) => p.name)
        .sort((a, b) => Number(a > b) - Number(a < b)),
    ).toEqual(["leuchtfeuer", "leuchtfeuer-alt"]);
    expect(body.scannedAt).not.toBeNull();
    expect(body.projects.every((p) => !p.sameName)).toBe(true);
  });

  it("reads from cache on the next call rather than scanning again", async () => {
    const res = await request(app).get("/api/projekte/list");
    const body = res.body as ListResponse;
    expect(body.summary).toBeNull();
    expect(body.projects).toHaveLength(4);
  });

  it("does not double-scan when two requests race on an empty table", async () => {
    const ctx = buildSampleContext(path.join(scratch.dir, "race"));
    const raceApp = appWithProjekte(ctx.projekte, ctx.vault);
    const findRepos = vi.mocked(scanModule.findRepos);
    findRepos.mockClear();

    const [a, b] = await Promise.all([
      request(raceApp).get("/api/projekte/list"),
      request(raceApp).get("/api/projekte/list"),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(findRepos).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/projekte/scan", () => {
  it("always rebuilds and returns a summary", async () => {
    const res = await request(app).post("/api/projekte/scan");
    expect(res.status).toBe(200);
    const body = res.body as {
      summary: {
        projects: number;
        repos: number;
        folders: number;
        duplicates: number;
        ms: number;
      };
    };
    expect(body.summary).toEqual({
      projects: 4,
      repos: 3,
      folders: 1,
      duplicates: 2,
      ms: expect.any(Number) as number,
    });
  });
});

describe("GET /api/projekte/project", () => {
  it("answers 404 for an unknown path, without naming a machine path", async () => {
    const missing = path.join(sampleDir, "does-not-exist");
    const res = await request(app)
      .get("/api/projekte/project")
      .query({ path: missing });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(missing);
  });

  it("answers 400 for a relative path, without naming a machine path", async () => {
    const res = await request(app)
      .get("/api/projekte/project")
      .query({ path: "relative/path" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(sampleDir);
  });

  it("returns the row plus its one duplicate for a known path", async () => {
    const list = (await request(app).get("/api/projekte/list"))
      .body as ListResponse;
    const target = list.projects.find((p) => p.name === "leuchtfeuer");
    expect(target).toBeDefined();

    const res = await request(app)
      .get("/api/projekte/project")
      .query({ path: target?.path ?? "" });
    expect(res.status).toBe(200);
    const body = res.body as {
      project: ListedProjectJson;
      duplicates: ListedProjectJson[];
    };
    expect(body.project.path).toBe(target?.path);
    expect(body.duplicates).toHaveLength(1);
    expect(body.duplicates[0].name).toBe("leuchtfeuer-alt");
  });

  it("misses cleanly for a folder-kind project with no duplicate", async () => {
    const list = (await request(app).get("/api/projekte/list"))
      .body as ListResponse;
    const strandgut = list.projects.find((p) => p.kind === "folder");
    expect(strandgut).toBeDefined();

    const res = await request(app)
      .get("/api/projekte/project")
      .query({ path: strandgut?.path ?? "" });
    expect(res.status).toBe(200);
    const body = res.body as { duplicates: ListedProjectJson[] };
    expect(body.duplicates).toEqual([]);
  });
});

describe("scan logging", () => {
  it("logs a path-free summary line exactly once when a scan actually runs", async () => {
    const ctx = buildSampleContext(path.join(scratch.dir, "log"));
    const logApp = appWithProjekte(ctx.projekte, ctx.vault);
    const logSpy = vi.spyOn(console, "log");

    await request(logApp).get("/api/projekte/list");
    const scanLines = logSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith("Projekte scan:"));
    logSpy.mockRestore();

    expect(scanLines).toHaveLength(1);
    expect(scanLines[0]).toMatch(
      /^Projekte scan: 4 projects \(3 repos, 1 folders, 2 duplicates\) in \d+ ms$/,
    );
    expect(scanLines[0]).not.toContain(ctx.sampleDir);
  });

  it("does not log again on a cache hit", async () => {
    const ctx = buildSampleContext(path.join(scratch.dir, "log-cached"));
    const cachedApp = appWithProjekte(ctx.projekte, ctx.vault);
    await request(cachedApp).get("/api/projekte/list");

    const logSpy = vi.spyOn(console, "log");
    await request(cachedApp).get("/api/projekte/list");
    const scanLines = logSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith("Projekte scan:"),
    );
    logSpy.mockRestore();

    expect(scanLines).toHaveLength(0);
  });
});

describe("async error handling", () => {
  it("answers a route that throws with a JSON 500, no stack trace and no machine paths", async () => {
    const ctx = buildSampleContext(path.join(scratch.dir, "error-mw"));
    const errorApp = appWithProjekte(ctx.projekte, ctx.vault);
    const findRepos = vi.mocked(scanModule.findRepos);
    findRepos.mockImplementationOnce(() => {
      throw new Error("boom: " + ctx.sampleDir);
    });

    const res = await request(errorApp).get("/api/projekte/list");

    expect(res.status).toBe(500);
    expect(res.type).toBe("application/json");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("boom");
    expect(body).not.toContain(ctx.sampleDir);
    expect(body).not.toContain("at Object");
    expect(body).not.toContain(".ts:");
  });
});

describe("sameName", () => {
  it("marks two projects with the same name under different groups, without marking them duplicates", async () => {
    const dir = path.join(scratch.dir, "same-name");
    initGitRepo(
      path.join(dir, "group-a", "demo"),
      "https://github.com/example/demo.git",
    );
    initGitRepo(path.join(dir, "group-b", "demo"));

    const projekte: ProjekteContext = {
      db: openProjekteDb(":memory:"),
      roots: [dir],
      source: "sample",
      gh: "off",
    };
    const vault: VaultContext = {
      db: openVaultDb(":memory:"),
      dir,
      name: "same-name",
    };
    const sameNameApp = appWithProjekte(projekte, vault);

    const res = await request(sameNameApp).get("/api/projekte/list");
    const body = res.body as ListResponse;
    const demoRows = body.projects.filter((p) => p.name === "demo");

    expect(demoRows).toHaveLength(2);
    expect(new Set(demoRows.map((p) => p.groupKey)).size).toBe(2);
    expect(demoRows.every((p) => p.sameName)).toBe(true);
    expect(demoRows.every((p) => !p.isDuplicate)).toBe(true);
  });
});

interface StandResponse {
  projekte: {
    slug: string;
    repos: { path: string }[];
    signals: { veraltet: boolean; dirtyRepos: number; offeneTasks: number };
  }[];
  ohneProjekt: { path: string }[];
  warnings: string[];
}

// Mirrors coupleNotes in app.ts, but for a handoff note rather than a brand/status coupling -
// this suite is the only one that needs a handoff in the vault, so it stays local.
function insertHandoff(
  vaultDb: Database.Database,
  frontmatter: Record<string, unknown>,
): void {
  vaultDb
    .prepare(
      "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "50_Workflow/Handoffs/Handoff_bench.md",
      "Bench",
      "50_Workflow/Handoffs",
      JSON.stringify(frontmatter),
      "",
      0,
      0,
    );
}

describe("GET /api/projekte/stand", () => {
  it("assembles the handoff's project state from the current table, leaving the rest in ohneProjekt", async () => {
    const ctx = buildSampleContext(path.join(scratch.dir, "stand"));
    const standApp = appWithProjekte(ctx.projekte, ctx.vault);
    await request(standApp).post("/api/projekte/scan");
    const rows = listProjects(ctx.projekte.db);
    const target = rows[0];

    insertHandoff(ctx.vault.db, {
      projekt: "bench",
      updated: "2020-01-01",
      repos: [target.path],
    });

    const res = await request(standApp).get("/api/projekte/stand");
    expect(res.status).toBe(200);
    const body = res.body as StandResponse;

    expect(body.projekte).toHaveLength(1);
    expect(body.projekte[0].slug).toBe("bench");
    expect(body.projekte[0].repos[0].path).toBe(target.path);
    // The sample checkouts' commits are all made just now; a 2020 handoff is stale against them.
    expect(body.projekte[0].signals.veraltet).toBe(true);
    expect(
      body.ohneProjekt
        .map((r) => r.path)
        .sort((a, b) => Number(a > b) - Number(a < b)),
    ).toEqual(
      rows
        .filter((r) => r.path !== target.path)
        .map((r) => r.path)
        .sort((a, b) => Number(a > b) - Number(a < b)),
    );
    expect(body.warnings).toEqual([]);
  });

  it("puts every row in ohneProjekt when the vault has no handoff notes", async () => {
    const ctx = buildSampleContext(path.join(scratch.dir, "stand-no-handoffs"));
    const standApp = appWithProjekte(ctx.projekte, ctx.vault);
    await request(standApp).post("/api/projekte/scan");
    const rows = listProjects(ctx.projekte.db);

    const res = await request(standApp).get("/api/projekte/stand");
    expect(res.status).toBe(200);
    const body = res.body as StandResponse;

    expect(body.projekte).toEqual([]);
    expect(
      body.ohneProjekt
        .map((r) => r.path)
        .sort((a, b) => Number(a > b) - Number(a < b)),
    ).toEqual(
      rows.map((r) => r.path).sort((a, b) => Number(a > b) - Number(a < b)),
    );
    expect(body.warnings).toEqual([]);
  });

  it("answers from an empty table without triggering a scan", async () => {
    const ctx = buildSampleContext(path.join(scratch.dir, "stand-empty"));
    const standApp = appWithProjekte(ctx.projekte, ctx.vault);

    const res = await request(standApp).get("/api/projekte/stand");
    expect(res.status).toBe(200);
    const body = res.body as StandResponse;

    expect(body.ohneProjekt).toEqual([]);
    expect(listProjects(ctx.projekte.db)).toHaveLength(0);
  });
});
