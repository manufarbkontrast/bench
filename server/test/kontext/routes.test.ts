import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import type { KontextContext } from "../../src/kontext/routes.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { scratchDir } from "./tmp.js";
import { appWithKontext } from "./app.js";

const FIXTURE_CLAUDE_DIR = fileURLToPath(
  new URL("../../src/kontext/fixture/claude", import.meta.url),
);

const scratch = scratchDir("bench-kontext-routes-");
afterAll(scratch.cleanup);

const REPO_DIR = path.join(scratch.dir, "mein-repo");
mkdirSync(REPO_DIR, { recursive: true });
writeFileSync(path.join(REPO_DIR, "CLAUDE.md"), "claude anweisungen");

function buildVault(): Database.Database {
  const db = openVaultDb(":memory:");
  const insert = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    "10_Profile/ueber-mich.md",
    "Über mich",
    "10_Profile",
    "{}",
    "profil text",
    0,
    0,
  );
  insert.run(
    "50_Workflow/regeln.md",
    "Regeln",
    "50_Workflow",
    "{}",
    "workflow regeln",
    0,
    0,
  );
  insert.run(
    "50_Workflow/Handoffs/Handoff_hafen.md",
    "Handoff_hafen",
    "50_Workflow/Handoffs",
    "{}",
    "ein handoff, keine regel",
    0,
    0,
  );
  insert.run(
    "00_Index/Session_Context.md",
    "Session Context",
    "00_Index",
    "{}",
    "aktueller stand",
    0,
    0,
  );
  insert.run(
    "20_Sonstiges/anderes.md",
    "Anderes",
    "20_Sonstiges",
    "{}",
    "gehört zu keinem tab",
    0,
    0,
  );
  return db;
}

const ctx: KontextContext = {
  claudeDir: FIXTURE_CLAUDE_DIR,
  vaultDb: buildVault(),
  projectPaths: () => [{ name: "mein-repo", path: REPO_DIR }],
};
const app = appWithKontext(ctx);

const noSessionContextCtx: KontextContext = {
  claudeDir: FIXTURE_CLAUDE_DIR,
  vaultDb: openVaultDb(":memory:"),
  projectPaths: () => [],
};
const noSessionContextApp = appWithKontext(noSessionContextCtx);

describe("GET /api/kontext/profil", () => {
  it("returns only the 10_Profile note", async () => {
    const res = await request(app).get("/api/kontext/profil");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      notes: [
        {
          path: "10_Profile/ueber-mich.md",
          title: "Über mich",
          body: "profil text",
        },
      ],
    });
  });
});

describe("GET /api/kontext/regeln", () => {
  it("returns the claude rules and the 50_Workflow notes", async () => {
    const res = await request(app).get("/api/kontext/regeln");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      claude: [
        {
          name: "beispiel-regel.md",
          body: expect.stringContaining(
            "Always confirm the target folder",
          ) as string,
          mtime: expect.any(Number) as number,
        },
      ],
      vault: [
        {
          path: "50_Workflow/regeln.md",
          title: "Regeln",
          body: "workflow regeln",
        },
      ],
    });
  });
});

describe("GET /api/kontext/stand", () => {
  it("returns the Session_Context note", async () => {
    const res = await request(app).get("/api/kontext/stand");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      note: {
        path: "00_Index/Session_Context.md",
        title: "Session Context",
        body: "aktueller stand",
      },
    });
  });

  it("returns note: null when the vault has no Session_Context note", async () => {
    const res = await request(noSessionContextApp).get("/api/kontext/stand");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ note: null });
  });
});

describe("GET /api/kontext/memory", () => {
  it("returns the fixture project's memory notes", async () => {
    const res = await request(app).get("/api/kontext/memory");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      projects: [
        {
          dir: "-tmp-beispiel",
          notes: [
            {
              name: "notiz.md",
              body: expect.stringContaining("Kontext-Fixture-Notiz") as string,
              mtime: expect.any(Number) as number,
            },
          ],
        },
      ],
    });
  });
});

describe("GET /api/kontext/repos", () => {
  it("returns CLAUDE.md for the registered project", async () => {
    const res = await request(app).get("/api/kontext/repos");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      repos: [
        {
          name: "mein-repo",
          files: [{ name: "CLAUDE.md", body: "claude anweisungen" }],
        },
      ],
    });
  });
});

describe("GET /api/kontext/skills", () => {
  it("returns the two fixture skills", async () => {
    const res = await request(app).get("/api/kontext/skills");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      count: 2,
      skills: expect.arrayContaining([
        {
          name: "leuchtturm-skill",
          description:
            "Ordnet eingehende Testdaten ein: eine erfundene Fertigkeit für Fixture-Zwecke",
        },
        {
          name: "hafen-skill",
          description: "Sammelt synthetische Ankunftsdaten für die Fixture",
        },
      ]) as unknown,
    });
  });
});

describe("GET /api/kontext/mcp", () => {
  it("returns exactly the two server names and never the secret url", async () => {
    const res = await request(app).get("/api/kontext/mcp");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ servers: ["beispiel-a", "beispiel-b"] });

    const text = JSON.stringify(res.body);
    expect(text).not.toContain("secret.example.com");
    expect(text).not.toContain("token");
  });
});

describe("no response leaks the claude dir's absolute path", () => {
  const tabs = [
    "profil",
    "regeln",
    "stand",
    "memory",
    "repos",
    "skills",
    "mcp",
  ];

  it.each(tabs)("GET /api/kontext/%s", async (tab) => {
    const res = await request(app).get(`/api/kontext/${tab}`);
    expect(JSON.stringify(res.body)).not.toContain(FIXTURE_CLAUDE_DIR);
  });
});
