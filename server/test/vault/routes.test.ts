import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { rmSync } from "node:fs";
import type express from "express";
import { openDb } from "../../src/vault/db.js";
import { indexAll } from "../../src/vault/index/indexer.js";
import { appWithVault } from "./app.js";
import { copyFixture } from "./fixture.js";

interface TreeEntry {
  path: string;
  title: string;
  folder: string;
}
interface Note {
  path: string;
  title: string;
  folder: string;
  frontmatter: Record<string, unknown>;
  body: string;
  tags: string[];
  links: {
    target: string;
    toPath: string | null;
    alias: string | null;
    heading: string | null;
  }[];
  backlinks: { path: string; title: string }[];
}
interface SearchHit {
  path: string;
  title: string;
  snippet: string;
}

let dir: string;
let app: express.Express;

beforeEach(() => {
  dir = copyFixture();
  const db = openDb(":memory:");
  indexAll(db, dir);
  app = appWithVault({ db, dir, name: "fixture" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/vault/info and /tree", () => {
  it("names the vault and counts the notes", async () => {
    const res = await request(app).get("/api/vault/info");
    expect(res.body).toEqual({ name: "fixture", notes: 12 });
  });

  it("lists every note sorted by path with its folder", async () => {
    const tree = (await request(app).get("/api/vault/tree"))
      .body as TreeEntry[];
    expect(tree).toHaveLength(12);
    expect(tree[0]).toEqual({
      path: "00_Index/Cockpit.md",
      title: "Cockpit",
      folder: "00_Index",
    });
  });
});

describe("GET /api/vault/note", () => {
  it("returns frontmatter, body, tags, resolved links and backlinks", async () => {
    const res = await request(app)
      .get("/api/vault/note")
      .query({ path: "30_Projekte/Leuchtturm/Leuchtturm.md" });
    expect(res.status).toBe(200);
    const note = res.body as Note;
    expect(note.title).toBe("Leuchtturm");
    expect(note.tags).toEqual(["project", "brand/nordlicht", "status/active"]);
    expect(note.frontmatter.path).toBe("~/Projekte/leuchtturm");
    expect(note.body).toContain("## Aufgaben");
    expect(note.links.find((l) => l.target === "Persona")).toMatchObject({
      toPath: "10_Profile/Persona.md",
      alias: "die Persona",
    });
    expect(note.backlinks.map((b) => b.title)).toEqual([
      "2026-08-01 Call Hafen",
      "Lessons",
      "Stack",
      "Start",
      "_Projekt_Index",
    ]);
  });

  it("answers 404 for a path that is not a note and 400 without a path", async () => {
    expect(
      (await request(app).get("/api/vault/note").query({ path: "nope.md" }))
        .status,
    ).toBe(404);
    expect((await request(app).get("/api/vault/note")).status).toBe(400);
  });
});

describe("GET /api/vault/search", () => {
  it("matches titles and body text, prefix included, with a snippet", async () => {
    const hits = (
      await request(app).get("/api/vault/search").query({ q: "hafenkonzept" })
    ).body as SearchHit[];
    expect(hits.map((h) => h.title)).toEqual(["2026-08-01 Call Hafen"]);
    expect(hits[0].snippet).toContain("Hafenkonzept");
    const prefix = (
      await request(app).get("/api/vault/search").query({ q: "leucht" })
    ).body as SearchHit[];
    expect(prefix.map((h) => h.title)).toContain("Leuchtturm");
  });

  it("ranks a title match above a body match", async () => {
    const hits = (
      await request(app).get("/api/vault/search").query({ q: "persona" })
    ).body as SearchHit[];
    expect(hits[0].title).toBe("Persona");
  });

  it("returns nothing for an empty query and copes with quotes", async () => {
    expect(
      (await request(app).get("/api/vault/search").query({ q: "  " })).body,
    ).toEqual([]);
    expect(
      (await request(app).get("/api/vault/search").query({ q: 'sta"ck' }))
        .status,
    ).toBe(200);
  });
});

describe("GET /api/vault/file", () => {
  it("serves an attachment from inside the vault", async () => {
    const res = await request(app)
      .get("/api/vault/file")
      .query({ path: "assets/skizze.svg" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
  });

  it("refuses paths that leave the vault and misses cleanly", async () => {
    expect(
      (
        await request(app)
          .get("/api/vault/file")
          .query({ path: "../../etc/hosts" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/vault/file")
          .query({ path: "assets/none.svg" })
      ).status,
    ).toBe(404);
  });
});
