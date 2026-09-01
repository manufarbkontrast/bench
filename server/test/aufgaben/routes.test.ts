import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAufgabenDb } from "../../src/aufgaben/db.js";
import type { GhRunner, Issue } from "../../src/aufgaben/gh.js";
import type { AufgabenSources } from "../../src/aufgaben/routes.js";
import {
  openProjekteDb,
  replaceProjects,
  type ProjectRow,
} from "../../src/projekte/db.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { indexAll } from "../../src/vault/index/indexer.js";
import { TASK_INBOX } from "../../src/vault/write.js";
import { copyFixture } from "../vault/fixture.js";
import { appWithAufgaben } from "./app.js";

const PLAUD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/aufgaben/fixture/notizen",
);
const PLAUD_FILE = "2026-08-20_hafenrunde.md";
const LEUCHTTURM = "30_Projekte/Leuchtturm/Leuchtturm.md";

interface TaskReply {
  path: string;
  brand: string | null;
  noteTitle: string;
}
interface TasksResponse {
  tasks: TaskReply[];
}

interface PlaudItemReply {
  rowHash: string;
  was: string;
  bis: string;
  imported: { targetPath: string; line: number } | null;
  existing: { path: string; line: number; text: string } | null;
}
interface PlaudNoteReplyShape {
  file: string;
  items: PlaudItemReply[];
  suggestedTarget: string;
}
interface PlaudResponse {
  source: string;
  notes: PlaudNoteReplyShape[];
}

interface ImportResponse {
  targetPath: string;
  line: number;
  raw: string;
}

interface IssuesResponse {
  source: string;
  repos: { label: string; issues: Issue[] | null }[];
}

function projectRow(overrides: Partial<ProjectRow>): ProjectRow {
  return {
    path: "/x",
    name: "x",
    kind: "git",
    remote: null,
    remoteLabel: null,
    branch: null,
    lastCommitAt: null,
    lastCommitSubject: null,
    dirty: 0,
    ahead: null,
    behind: null,
    notePath: null,
    brand: null,
    status: null,
    issues: null,
    prs: null,
    groupKey: "x",
    scannedAt: 0,
    ...overrides,
  };
}

let dir: string;
let app: express.Express;
let aufgaben: AufgabenSources;

beforeEach(() => {
  dir = copyFixture();
  const vaultDb = openVaultDb(":memory:");
  indexAll(vaultDb, dir);
  aufgaben = {
    ledger: openAufgabenDb(":memory:"),
    plaud: { dir: PLAUD_DIR, source: "sample" },
    gh: "off",
  };
  app = appWithAufgaben(aufgaben, { db: vaultDb, dir, name: "fixture" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/aufgaben/tasks", () => {
  it("excludes the 50_Workflow fixture task and includes the Leuchtturm ones", async () => {
    const res = await request(app).get("/api/aufgaben/tasks");
    expect(res.status).toBe(200);
    const body = res.body as TasksResponse;

    expect(body.tasks.some((t) => t.path === "50_Workflow/Testing.md")).toBe(
      false,
    );
    const leuchtturm = body.tasks.filter((t) => t.path === LEUCHTTURM);
    expect(leuchtturm.length).toBeGreaterThan(0);
    expect(leuchtturm.every((t) => t.brand === "nordlicht")).toBe(true);
    expect(leuchtturm.every((t) => t.noteTitle === "Leuchtturm")).toBe(true);
  });
});

describe("GET /api/aufgaben/plaud", () => {
  it("lists the fixture note with 4 items, none imported, the first deduped against Leuchtturm", async () => {
    const res = await request(app).get("/api/aufgaben/plaud");
    expect(res.status).toBe(200);
    const body = res.body as PlaudResponse;

    expect(body.source).toBe("sample");
    expect(body.notes).toHaveLength(1);
    const note = body.notes[0];
    expect(note.file).toBe(PLAUD_FILE);
    expect(note.items).toHaveLength(4);
    expect(note.items.every((item) => item.imported === null)).toBe(true);
    expect(note.items[0].existing).toMatchObject({ path: LEUCHTTURM });
    expect(note.suggestedTarget).toBe(TASK_INBOX);
  });
});

describe("POST /api/aufgaben/import", () => {
  it("creates the inbox file with the provenance and due date, then rejects a repeat", async () => {
    const plaudRes = await request(app).get("/api/aufgaben/plaud");
    const rowHash = (plaudRes.body as PlaudResponse).notes[0].items[0].rowHash;

    const res = await request(app).post("/api/aufgaben/import").send({
      file: PLAUD_FILE,
      rowHash,
      targetPath: TASK_INBOX,
    });

    expect(res.status).toBe(201);
    const body = res.body as ImportResponse;
    expect(body.targetPath).toBe(TASK_INBOX);
    expect(body.raw).toContain(" (aus [[2026-08-20_hafenrunde]])");
    expect(body.raw).toContain(" 📅 2026-09-05");

    const text = readFileSync(path.join(dir, TASK_INBOX), "utf8");
    expect(text.split("\n").filter((line) => line === body.raw)).toHaveLength(
      1,
    );

    const repeat = await request(app).post("/api/aufgaben/import").send({
      file: PLAUD_FILE,
      rowHash,
      targetPath: TASK_INBOX,
    });
    expect(repeat.status).toBe(409);
    expect(repeat.body).toEqual({ error: "already imported" });

    const textAfter = readFileSync(path.join(dir, TASK_INBOX), "utf8");
    expect(
      textAfter.split("\n").filter((line) => line === body.raw),
    ).toHaveLength(1);

    const plaudAfter = await request(app).get("/api/aufgaben/plaud");
    const itemAfter = (plaudAfter.body as PlaudResponse).notes[0].items[0];
    expect(itemAfter.imported).toEqual({
      targetPath: TASK_INBOX,
      line: body.line,
    });
  });

  it("answers 404 when the file is unknown", async () => {
    const res = await request(app).post("/api/aufgaben/import").send({
      file: "does-not-exist.md",
      rowHash: "whatever",
      targetPath: TASK_INBOX,
    });
    expect(res.status).toBe(404);
  });

  it("answers 404 when the row hash is unknown", async () => {
    const res = await request(app).post("/api/aufgaben/import").send({
      file: PLAUD_FILE,
      rowHash: "not-a-real-hash",
      targetPath: TASK_INBOX,
    });
    expect(res.status).toBe(404);
  });

  it("answers 400 when targetPath is neither an indexed note nor the inbox", async () => {
    const plaudRes = await request(app).get("/api/aufgaben/plaud");
    const rowHash = (plaudRes.body as PlaudResponse).notes[0].items[1].rowHash;

    const res = await request(app).post("/api/aufgaben/import").send({
      file: PLAUD_FILE,
      rowHash,
      targetPath: "not-a-note.md",
    });
    expect(res.status).toBe(400);
  });

  it("appends into an existing note when targetPath names one, with no due date field when bis is not a date", async () => {
    const plaudRes = await request(app).get("/api/aufgaben/plaud");
    const rowHash = (plaudRes.body as PlaudResponse).notes[0].items[3].rowHash;

    const res = await request(app).post("/api/aufgaben/import").send({
      file: PLAUD_FILE,
      rowHash,
      targetPath: LEUCHTTURM,
    });

    expect(res.status).toBe(201);
    const body = res.body as ImportResponse;
    expect(body.targetPath).toBe(LEUCHTTURM);
    expect(body.raw).toContain(" (aus [[2026-08-20_hafenrunde]])");
    expect(body.raw).not.toContain("📅");
    const text = readFileSync(path.join(dir, LEUCHTTURM), "utf8");
    expect(text).toContain(body.raw);
  });
});

describe("GET /api/aufgaben/issues", () => {
  it("fetches every distinct label from the projekte index in parallel", async () => {
    const projekteDb = openProjekteDb(":memory:");
    replaceProjects(projekteDb, [
      projectRow({
        path: "/a",
        name: "a",
        remoteLabel: "example/a",
        groupKey: "a",
      }),
      projectRow({
        path: "/b",
        name: "b",
        remoteLabel: "example/b",
        groupKey: "b",
      }),
      projectRow({
        path: "/c",
        name: "c",
        remoteLabel: "example/a",
        groupKey: "c",
      }),
      projectRow({ path: "/d", name: "d", remoteLabel: null, groupKey: "d" }),
    ]);
    const seen: string[] = [];
    const run: GhRunner = vi.fn((args: string[]) => {
      seen.push(args[3]);
      return Promise.resolve("[]");
    });
    const ghApp = appWithAufgaben(
      { ...aufgaben, gh: run },
      { db: openVaultDb(":memory:"), dir, name: "fixture" },
      { db: projekteDb, roots: [], source: "sample", gh: "off" },
    );

    const res = await request(ghApp).get("/api/aufgaben/issues");

    expect(res.status).toBe(200);
    const body = res.body as IssuesResponse;
    expect(body.source).toBe("gh");
    expect(
      body.repos.map((r) => r.label).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["example/a", "example/b"]);
    expect(body.repos.every((r) => r.issues !== null)).toBe(true);
    expect(seen.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "example/a",
      "example/b",
    ]);
  });

  it("short-circuits to repos: [] when gh is off", async () => {
    const res = await request(app).get("/api/aufgaben/issues");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ source: "off", repos: [] });
  });
});
