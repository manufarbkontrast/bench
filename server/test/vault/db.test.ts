import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../../src/vault/db.js";
import { copyFixture } from "./fixture.js";

interface Name {
  name: string;
}

describe("vault db", () => {
  it("creates the index tables and the full-text table", () => {
    const db = openDb(":memory:");
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name",
      )
      .all() as Name[];
    const tables = names.map((n) => n.name);
    for (const t of ["notes", "links", "tags", "tasks", "notes_fts"])
      expect(tables).toContain(t);
  });

  it("removes a note's links, tags and tasks with the note", () => {
    const db = openDb(":memory:");
    db.prepare(
      "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("a.md", "a", "", "{}", "", 0, 0);
    db.prepare("INSERT INTO links (from_path, target) VALUES (?, ?)").run(
      "a.md",
      "b",
    );
    db.prepare("INSERT INTO tags (path, tag) VALUES (?, ?)").run("a.md", "x");
    db.prepare(
      "INSERT INTO tasks (path, line, raw, text, done) VALUES (?, ?, ?, ?, ?)",
    ).run("a.md", 1, "- [ ] t", "t", 0);
    db.prepare("DELETE FROM notes WHERE path = ?").run("a.md");
    expect(db.prepare("SELECT COUNT(*) AS c FROM links").get()).toEqual({
      c: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS c FROM tags").get()).toEqual({
      c: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS c FROM tasks").get()).toEqual({
      c: 0,
    });
  });
});

describe("fixture vault", () => {
  it("copies the twelve notes and skips nothing", () => {
    const dir = copyFixture();
    expect(existsSync(path.join(dir, "00_Index", "Start.md"))).toBe(true);
    expect(existsSync(path.join(dir, ".obsidian", "Ignored.md"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
