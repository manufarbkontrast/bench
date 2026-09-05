import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import {
  readMcpServers,
  readMemory,
  readRepos,
  readRules,
  vaultNoteAt,
  vaultNotesUnder,
} from "../../src/kontext/readers.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { scratchDir } from "./tmp.js";

const FIXTURE_CLAUDE_DIR = fileURLToPath(
  new URL("../../src/kontext/fixture/claude", import.meta.url),
);

const scratch = scratchDir("bench-kontext-readers-");
afterAll(scratch.cleanup);

function buildVault(
  notes: { path: string; title: string; body: string }[],
): Database.Database {
  const db = openVaultDb(":memory:");
  const insert = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const note of notes) {
    insert.run(note.path, note.title, "", "{}", note.body, 0, 0);
  }
  return db;
}

describe("vaultNotesUnder", () => {
  it("keeps only notes whose path starts with the prefix, ordered by path", () => {
    const db = buildVault([
      { path: "10_Profile/zz-spaeter.md", title: "Später", body: "b1" },
      { path: "10_Profile/aa-frueher.md", title: "Früher", body: "b2" },
      { path: "20_Sonstiges/andere.md", title: "Andere", body: "b3" },
    ]);

    expect(vaultNotesUnder(db, "10_Profile/")).toEqual([
      { path: "10_Profile/aa-frueher.md", title: "Früher", body: "b2" },
      { path: "10_Profile/zz-spaeter.md", title: "Später", body: "b1" },
    ]);
  });

  it("does not treat the prefix's underscore as a SQL LIKE wildcard", () => {
    // "10XProfile/..." would match a naive `LIKE '10_Profile/%'`, since "_" matches any single
    // character there - proving the JS-side startsWith filter instead of that trap.
    const db = buildVault([
      { path: "10XProfile/nicht-gemeint.md", title: "X", body: "" },
      { path: "10_Profile/gemeint.md", title: "Gemeint", body: "" },
    ]);

    expect(vaultNotesUnder(db, "10_Profile/").map((n) => n.path)).toEqual([
      "10_Profile/gemeint.md",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    const db = buildVault([{ path: "99_Andere/x.md", title: "X", body: "" }]);
    expect(vaultNotesUnder(db, "10_Profile/")).toEqual([]);
  });
});

describe("vaultNoteAt", () => {
  it("finds the one note at an exact path", () => {
    const db = buildVault([
      {
        path: "00_Index/Session_Context.md",
        title: "Session Context",
        body: "aktueller stand",
      },
    ]);

    expect(vaultNoteAt(db, "00_Index/Session_Context.md")).toEqual({
      path: "00_Index/Session_Context.md",
      title: "Session Context",
      body: "aktueller stand",
    });
  });

  it("returns null when no note sits at that path", () => {
    const db = buildVault([]);
    expect(vaultNoteAt(db, "00_Index/Session_Context.md")).toBeNull();
  });
});

describe("readRules", () => {
  it("reads the fixture rule file", () => {
    const rules = readRules(FIXTURE_CLAUDE_DIR);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("beispiel-regel.md");
    expect(rules[0].body).toContain("Always confirm the target folder");
    expect(typeof rules[0].mtime).toBe("number");
  });

  it("sorts multiple rule files by name", () => {
    const dir = path.join(scratch.dir, "sort-rules");
    mkdirSync(path.join(dir, "rules"), { recursive: true });
    writeFileSync(path.join(dir, "rules", "zz-spaet.md"), "spaet");
    writeFileSync(path.join(dir, "rules", "aa-frueh.md"), "frueh");

    expect(readRules(dir).map((r) => r.name)).toEqual([
      "aa-frueh.md",
      "zz-spaet.md",
    ]);
  });

  it("returns an empty array when the rules dir does not exist", () => {
    const dir = path.join(scratch.dir, "no-rules-dir");
    mkdirSync(dir, { recursive: true });
    expect(readRules(dir)).toEqual([]);
  });
});

describe("readMemory", () => {
  it("reads the fixture memory note with a real mtime", () => {
    const projects = readMemory(FIXTURE_CLAUDE_DIR);
    expect(projects).toHaveLength(1);
    expect(projects[0].dir).toBe("-tmp-beispiel");
    expect(projects[0].notes).toHaveLength(1);
    expect(projects[0].notes[0].name).toBe("notiz.md");
    expect(projects[0].notes[0].body).toContain("Kontext-Fixture-Notiz");
    expect(typeof projects[0].notes[0].mtime).toBe("number");
  });

  it("skips a project directory that has no memory subfolder", () => {
    const dir = path.join(scratch.dir, "memory-skip");
    mkdirSync(path.join(dir, "projects", "-hat-memory", "memory"), {
      recursive: true,
    });
    writeFileSync(
      path.join(dir, "projects", "-hat-memory", "memory", "notiz.md"),
      "eine notiz",
    );
    mkdirSync(path.join(dir, "projects", "-ohne-memory"), {
      recursive: true,
    });

    const projects = readMemory(dir);
    expect(projects.map((p) => p.dir)).toEqual(["-hat-memory"]);
  });

  it("returns an empty array when the projects dir does not exist", () => {
    const dir = path.join(scratch.dir, "no-projects-dir");
    mkdirSync(dir, { recursive: true });
    expect(readMemory(dir)).toEqual([]);
  });
});

describe("readRepos", () => {
  it("reads CLAUDE.md and AGENTS.md when present, skipping a missing one", () => {
    const repoDir = path.join(scratch.dir, "repo-both");
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(path.join(repoDir, "CLAUDE.md"), "claude anweisungen");

    const repos = readRepos(() => [{ name: "mein-repo", path: repoDir }]);

    expect(repos).toEqual([
      {
        name: "mein-repo",
        files: [{ name: "CLAUDE.md", body: "claude anweisungen" }],
      },
    ]);
  });

  it("skips a project whose path does not exist", () => {
    const repos = readRepos(() => [
      { name: "verschwunden", path: path.join(scratch.dir, "nicht-da") },
    ]);
    expect(repos).toEqual([]);
  });
});

describe("readMcpServers", () => {
  it("returns the two fixture server names and never the secret url", () => {
    const servers = readMcpServers(FIXTURE_CLAUDE_DIR);
    expect(servers).toEqual(["beispiel-a", "beispiel-b"]);
  });

  it("reads claude.json next to the claude dir when it is literally named .claude", () => {
    const dir = path.join(scratch.dir, "home");
    const claudeDir = path.join(dir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      path.join(dir, ".claude.json"),
      JSON.stringify({ mcpServers: { neben: {} } }),
    );

    expect(readMcpServers(claudeDir)).toEqual(["neben"]);
  });

  it("returns an empty array when the file is missing", () => {
    const dir = path.join(scratch.dir, "no-mcp-file");
    mkdirSync(dir, { recursive: true });
    expect(readMcpServers(dir)).toEqual([]);
  });

  it("returns an empty array for malformed JSON", () => {
    const dir = path.join(scratch.dir, "bad-mcp-json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "claude.json"), "{ not json");
    expect(readMcpServers(dir)).toEqual([]);
  });
});
