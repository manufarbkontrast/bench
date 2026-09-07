import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb, type LinkRow, type TaskRow } from "../../src/vault/db.js";
import {
  indexAll,
  indexNote,
  removeNote,
  resolveLinks,
} from "../../src/vault/index/indexer.js";
import { isNotePath, listNotes } from "../../src/vault/index/scan.js";
import { copyFixture } from "./fixture.js";

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = copyFixture();
  db = openDb(":memory:");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

describe("listNotes", () => {
  it("finds the fifteen notes and skips dot-folders", () => {
    const notes = listNotes(dir);
    // 13 plus the two 50_Workflow/Handoffs fixtures (Handoff_leuchtturm.md, Handoff_hafen.md).
    expect(notes).toHaveLength(15);
    expect(notes[0]).toBe("00_Index/Cockpit.md");
    expect(notes).toContain(
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    );
    expect(notes.some((n) => n.startsWith(".obsidian"))).toBe(false);
  });

  it("knows which relative paths belong in the index", () => {
    expect(isNotePath("a/b.md")).toBe(true);
    expect(isNotePath(".obsidian/x.md")).toBe(false);
    expect(isNotePath("a/.trash/x.md")).toBe(false);
    expect(isNotePath("assets/skizze.svg")).toBe(false);
  });
});

describe("indexAll", () => {
  it("indexes every note with its folder, tags, links and tasks", () => {
    const summary = indexAll(db, dir);
    // 13 plus the two 50_Workflow/Handoffs fixtures (Handoff_leuchtturm.md, Handoff_hafen.md).
    expect(summary.notes).toBe(15);
    expect(count("notes")).toBe(15);
    expect(count("notes_fts")).toBe(15);
    const start = db
      .prepare("SELECT folder, title FROM notes WHERE path = ?")
      .get("00_Index/Start.md");
    expect(start).toEqual({ folder: "00_Index", title: "Start" });
    const tags = db
      .prepare("SELECT tag FROM tags WHERE path = ? ORDER BY tag")
      .all("20_Brands/Nordlicht.md") as { tag: string }[];
    expect(tags.map((t) => t.tag)).toEqual([
      "brand/nordlicht",
      "status/active",
    ]);
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE path = ? ORDER BY line")
      .all("30_Projekte/Leuchtturm/Leuchtturm.md") as TaskRow[];
    expect(tasks).toHaveLength(6);
    expect(tasks[1]).toMatchObject({
      text: "Prototyp bauen",
      priority: "high",
      due: "2026-08-25",
      scheduled: "2026-08-18",
      start: "2026-08-10",
    });
    expect(tasks[4]).toMatchObject({ done: 1, done_at: "2026-08-02" });
  });

  it("resolves links by path, by basename and by heading, and leaves dangling ones null", () => {
    indexAll(db, dir);
    const links = db
      .prepare("SELECT * FROM links WHERE from_path = ? ORDER BY rowid")
      .all("00_Index/Start.md") as LinkRow[];
    expect(links.map((l) => [l.target, l.heading, l.alias, l.to_path])).toEqual(
      [
        ["Cockpit", null, null, "00_Index/Cockpit.md"],
        ["Persona", null, null, "10_Profile/Persona.md"],
        [
          "30_Projekte/Leuchtturm/Leuchtturm",
          null,
          "Projekt Leuchtturm",
          "30_Projekte/Leuchtturm/Leuchtturm.md",
        ],
        ["Stack", "Datenbank", "Datenbank-Stack", "40_Tech_Stack/Stack.md"],
        ["Nicht vorhanden", null, null, null],
      ],
    );
  });

  it("finds backlinks through to_path", () => {
    indexAll(db, dir);
    const back = db
      .prepare(
        "SELECT DISTINCT from_path FROM links WHERE to_path = ? ORDER BY from_path",
      )
      .all("30_Projekte/Leuchtturm/Leuchtturm.md") as { from_path: string }[];
    expect(back.map((b) => b.from_path)).toEqual([
      "00_Index/Start.md",
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
      "30_Projekte/_Projekt_Index.md",
      "40_Tech_Stack/Stack.md",
      "60_Knowledge/Lessons.md",
    ]);
  });

  it("drops notes whose files are gone and re-indexes changed ones", () => {
    indexAll(db, dir);
    unlinkSync(path.join(dir, "90_Archive", "Alt.md"));
    writeFileSync(
      path.join(dir, "10_Profile", "Persona.md"),
      "# Persona\n\nNeu geschrieben, ohne Link.\n",
    );
    const summary = indexAll(db, dir);
    // 15 fixture notes (13 plus the two 50_Workflow/Handoffs fixtures) minus the one just removed.
    expect(summary.notes).toBe(14);
    expect(
      db
        .prepare("SELECT COUNT(*) AS c FROM notes WHERE path = ?")
        .get("90_Archive/Alt.md"),
    ).toEqual({ c: 0 });
    expect(
      db
        .prepare("SELECT body FROM notes WHERE path = ?")
        .get("10_Profile/Persona.md"),
    ).toEqual({ body: "# Persona\n\nNeu geschrieben, ohne Link.\n" });
    expect(
      db
        .prepare("SELECT COUNT(*) AS c FROM links WHERE from_path = ?")
        .get("10_Profile/Persona.md"),
    ).toEqual({ c: 0 });
  });

  it("makes the full text searchable, diacritics included", () => {
    indexAll(db, dir);
    const hits = db
      .prepare("SELECT path FROM notes_fts WHERE notes_fts MATCH ?")
      .all('"hafenkonzept"') as { path: string }[];
    expect(hits.map((h) => h.path)).toEqual([
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    ]);
  });

  it("prefers the linking note's own folder when a basename is ambiguous", () => {
    writeFileSync(
      path.join(dir, "40_Tech_Stack", "Notizen.md"),
      "# Notizen A\n",
    );
    writeFileSync(
      path.join(dir, "60_Knowledge", "Notizen.md"),
      "# Notizen B\n",
    );
    writeFileSync(
      path.join(dir, "60_Knowledge", "Quelle.md"),
      "Siehe [[Notizen]].\n",
    );
    indexAll(db, dir);
    const link = db
      .prepare("SELECT to_path FROM links WHERE from_path = ? AND target = ?")
      .get("60_Knowledge/Quelle.md", "Notizen");
    expect(link).toEqual({ to_path: "60_Knowledge/Notizen.md" });
  });

  it("derives projekt from a checked, normalised slug and leaves it null otherwise", () => {
    const handoffs = path.join(dir, "50_Workflow", "Handoffs");
    writeFileSync(
      path.join(handoffs, "Handoff_gross.md"),
      "---\nprojekt:  Gross-Schreibung \n---\n# x\n",
    );
    writeFileSync(
      path.join(handoffs, "Handoff_kaputt.md"),
      "---\nprojekt: Nicht Gültig!\n---\n# x\n",
    );
    indexAll(db, dir);
    const projektAt = (p: string) =>
      (
        db.prepare("SELECT projekt FROM notes WHERE path = ?").get(p) as {
          projekt: string | null;
        }
      ).projekt;
    expect(projektAt("50_Workflow/Handoffs/Handoff_hafen.md")).toBe("hafen");
    expect(projektAt("50_Workflow/Handoffs/Handoff_gross.md")).toBe(
      "gross-schreibung",
    );
    expect(projektAt("50_Workflow/Handoffs/Handoff_kaputt.md")).toBeNull();
    expect(projektAt("00_Index/Start.md")).toBeNull();
  });
});

describe("indexNote and removeNote", () => {
  it("index one file, then remove it, and links re-resolve each time", () => {
    indexAll(db, dir);
    writeFileSync(path.join(dir, "Nicht vorhanden.md"), "# Jetzt vorhanden\n");
    indexNote(db, dir, "Nicht vorhanden.md");
    resolveLinks(db);
    expect(
      db
        .prepare("SELECT to_path FROM links WHERE target = ?")
        .get("Nicht vorhanden"),
    ).toEqual({ to_path: "Nicht vorhanden.md" });
    removeNote(db, "Nicht vorhanden.md");
    resolveLinks(db);
    expect(
      db
        .prepare("SELECT to_path FROM links WHERE target = ?")
        .get("Nicht vorhanden"),
    ).toEqual({ to_path: null });
    // 13 plus the two 50_Workflow/Handoffs fixtures (Handoff_leuchtturm.md, Handoff_hafen.md).
    expect(count("notes_fts")).toBe(15);
  });
});
