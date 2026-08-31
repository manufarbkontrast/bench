import path from "node:path";
import type express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as scanModule from "../../src/projekte/scan.js";
import { appWithProjekte, buildSampleContext } from "./app.js";
import { scratchDir } from "./tmp.js";

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
