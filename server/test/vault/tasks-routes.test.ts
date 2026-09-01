import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import type express from "express";
import { openDb } from "../../src/vault/db.js";
import { indexAll } from "../../src/vault/index/indexer.js";
import { TASK_INBOX } from "../../src/vault/write.js";
import { appWithVault } from "./app.js";
import { copyFixture } from "./fixture.js";

const LEUCHTTURM = "30_Projekte/Leuchtturm/Leuchtturm.md";

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

describe("PATCH /api/vault/tasks", () => {
  it("toggles the task and returns the new line text", async () => {
    const res = await request(app).patch("/api/vault/tasks").send({
      path: LEUCHTTURM,
      line: 8,
      raw: "- [ ] Spezifikation schreiben 🔺 📅 2026-08-20",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      line: 8,
      raw: expect.stringMatching(/^- \[x\] Spezifikation schreiben/) as string,
    });
  });

  it("answers 409 with a stale raw and leaves the response body honest about the conflict", async () => {
    const res = await request(app).patch("/api/vault/tasks").send({
      path: LEUCHTTURM,
      line: 8,
      raw: "- [ ] this is not what is on disk",
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "conflict" });
  });

  it("answers 404 for a path that is not an indexed note", async () => {
    const res = await request(app)
      .patch("/api/vault/tasks")
      .send({ path: "nope.md", line: 1, raw: "- [ ] x" });

    expect(res.status).toBe(404);
  });

  it("answers 400 when the body is incomplete", async () => {
    const res = await request(app)
      .patch("/api/vault/tasks")
      .send({ path: LEUCHTTURM });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/vault/tasks", () => {
  it("creates the Task_Inbox on demand and files the task under it", async () => {
    const res = await request(app)
      .post("/api/vault/tasks")
      .send({ text: "Neue Aufgabe aus dem Test" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      path: TASK_INBOX,
      line: expect.any(Number) as number,
      raw: "- [ ] Neue Aufgabe aus dem Test",
    });
    const text = readFileSync(path.join(dir, TASK_INBOX), "utf8");
    expect(text.split("\n")[(res.body as { line: number }).line - 1]).toBe(
      "- [ ] Neue Aufgabe aus dem Test",
    );
  });

  it("builds the task line with priority and due date, into an existing note", async () => {
    const res = await request(app).post("/api/vault/tasks").send({
      path: LEUCHTTURM,
      text: "Mit Priorität und Datum",
      priority: "high",
      due: "2026-09-10",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      path: LEUCHTTURM,
      raw: "- [ ] Mit Priorität und Datum ⏫ 📅 2026-09-10",
    });
  });

  it("rejects an empty text", async () => {
    const res = await request(app)
      .post("/api/vault/tasks")
      .send({ text: "   " });

    expect(res.status).toBe(400);
  });

  it("rejects a bad due date", async () => {
    const res = await request(app)
      .post("/api/vault/tasks")
      .send({ text: "x", due: "20-08-2026" });

    expect(res.status).toBe(400);
  });

  it("rejects a bad priority", async () => {
    const res = await request(app)
      .post("/api/vault/tasks")
      .send({ text: "x", priority: "urgent" });

    expect(res.status).toBe(400);
  });

  it("rejects a path with .. segments", async () => {
    const res = await request(app)
      .post("/api/vault/tasks")
      .send({ text: "x", path: "../outside.md" });

    expect(res.status).toBe(400);
  });

  it("answers 404 for a non-inbox path that is not an indexed note", async () => {
    const res = await request(app)
      .post("/api/vault/tasks")
      .send({ text: "x", path: "not-a-note.md" });

    expect(res.status).toBe(404);
  });
});
