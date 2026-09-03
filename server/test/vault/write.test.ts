import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb, type TaskRow } from "../../src/vault/db.js";
import { indexAll } from "../../src/vault/index/indexer.js";
import {
  TASK_INBOX,
  appendTask,
  toggleTask,
  toggledLine,
  todayISO,
} from "../../src/vault/write.js";
import { copyFixture } from "./fixture.js";

const LEUCHTTURM = "30_Projekte/Leuchtturm/Leuchtturm.md";

let dir: string;
let db: Database.Database;
let outside: string;

beforeEach(() => {
  dir = copyFixture();
  db = openDb(":memory:");
  indexAll(db, dir);
  outside = mkdtempSync(path.join(tmpdir(), "bench-outside-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("todayISO", () => {
  it("formats a date in local time as YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 8, 1))).toBe("2026-09-01");
  });
});

describe("toggledLine", () => {
  it("marks an open task done, keeping every field and appending the completion date", () => {
    const raw =
      "- [ ] Prototyp bauen ⏫ ⏳ 2026-08-18 🛫 2026-08-10 📅 2026-08-25";
    expect(toggledLine(raw, "2026-09-01")).toBe(
      "- [x] Prototyp bauen ⏫ ⏳ 2026-08-18 🛫 2026-08-10 📅 2026-08-25 ✅ 2026-09-01",
    );
  });

  it("reopens a done task, removing exactly the completion-date field", () => {
    expect(
      toggledLine("- [x] Kickoff halten ✅ 2026-08-02", "2026-09-01"),
    ).toBe("- [ ] Kickoff halten");
  });

  it("treats an uppercase X as done", () => {
    expect(toggledLine("- [X] Uppercase done", "2026-09-01")).toBe(
      "- [ ] Uppercase done",
    );
  });

  it("returns null for a line that is not a task", () => {
    expect(toggledLine("Just prose, not a task.", "2026-09-01")).toBeNull();
  });
});

describe("toggleTask", () => {
  it("edits the file line the frontmatter offset points at, and updates the db row", () => {
    const before = db
      .prepare("SELECT * FROM tasks WHERE path = ? AND line = ?")
      .get(LEUCHTTURM, 8) as TaskRow;
    expect(before).toMatchObject({ done: 0, done_at: null });

    const result = toggleTask(dir, db, LEUCHTTURM, 8, before.raw, "2026-09-01");

    expect(result).toEqual({
      ok: true,
      line: 8,
      raw: "- [x] Spezifikation schreiben 🔺 📅 2026-08-20 ✅ 2026-09-01",
    });
    const fileLines = readFileSync(path.join(dir, LEUCHTTURM), "utf8").split(
      "\n",
    );
    expect(fileLines[12]).toBe(
      "- [x] Spezifikation schreiben 🔺 📅 2026-08-20 ✅ 2026-09-01",
    );
    const after = db
      .prepare("SELECT * FROM tasks WHERE path = ? AND line = ?")
      .get(LEUCHTTURM, 8) as TaskRow;
    expect(after).toMatchObject({ done: 1, done_at: "2026-09-01" });
  });

  it("refuses a stale raw, leaves the file untouched, and reindexes before replying", () => {
    const before = db
      .prepare("SELECT * FROM tasks WHERE path = ? AND line = ?")
      .get(LEUCHTTURM, 8) as TaskRow;
    const file = path.join(dir, LEUCHTTURM);
    const edited = readFileSync(file, "utf8").replace(
      "2026-08-20",
      "2026-08-21",
    );
    writeFileSync(file, edited);

    const result = toggleTask(dir, db, LEUCHTTURM, 8, before.raw, "2026-09-01");

    expect(result).toEqual({
      ok: false,
      current: "- [ ] Spezifikation schreiben 🔺 📅 2026-08-21",
    });
    expect(readFileSync(file, "utf8")).toBe(edited);
    const after = db
      .prepare("SELECT due FROM tasks WHERE path = ? AND line = ?")
      .get(LEUCHTTURM, 8);
    expect(after).toEqual({ due: "2026-08-21" });
  });
});

describe("appendTask", () => {
  it("lands the task after the Aufgaben section's last non-empty line", () => {
    const result = appendTask(dir, db, LEUCHTTURM, "- [ ] Neue Aufgabe");

    expect(result).toEqual({ ok: true, line: 19, raw: "- [ ] Neue Aufgabe" });
    const lines = readFileSync(path.join(dir, LEUCHTTURM), "utf8").split("\n");
    expect(lines[18]).toBe("- [ ] Neue Aufgabe");
    expect(lines[19]).toBe("");
    expect(lines[20]).toBe("## Notizen");
  });

  it("appends the heading itself when the note does not have one", () => {
    const target = "10_Profile/Scratch.md";
    writeFileSync(path.join(dir, target), "# Scratch\n\nNo tasks yet.\n");

    const result = appendTask(dir, db, target, "- [ ] Erste Aufgabe");

    const text = readFileSync(path.join(dir, target), "utf8");
    expect(text).toBe(
      "# Scratch\n\nNo tasks yet.\n\n## Aufgaben\n- [ ] Erste Aufgabe",
    );
    const lines = text.split("\n");
    expect(result).toEqual({
      ok: true,
      line: lines.length,
      raw: "- [ ] Erste Aufgabe",
    });
    expect(lines[lines.length - 1]).toBe("- [ ] Erste Aufgabe");
  });

  it("creates the missing Task_Inbox from its template and files the task under the heading", () => {
    const result = appendTask(dir, db, TASK_INBOX, "- [ ] Aus dem Inbox-Test");

    const text = readFileSync(path.join(dir, TASK_INBOX), "utf8");
    expect(text).toBe(
      "---\ntags: [inbox, tasks]\n---\n\n# Task_Inbox\n\n## Aufgaben\n- [ ] Aus dem Inbox-Test\n",
    );
    const lines = text.split("\n");
    const expectedLine = lines.indexOf("- [ ] Aus dem Inbox-Test") + 1;
    expect(result).toEqual({
      ok: true,
      line: expectedLine,
      raw: "- [ ] Aus dem Inbox-Test",
    });
    const indexed = db
      .prepare("SELECT COUNT(*) AS c FROM notes WHERE path = ?")
      .get(TASK_INBOX) as { c: number };
    expect(indexed.c).toBe(1);
  });
});

// Decision 4: listing and reading may follow a user-planted symlink, but the two write surfaces
// must refuse one that resolves outside the vault - so a note that merely looks vault-relative
// cannot be used to write onto the rest of the disk.
describe("realpath containment", () => {
  it("toggleTask refuses a note file that is a symlink to outside the vault", () => {
    const outsideFile = path.join(outside, "Outside.md");
    writeFileSync(outsideFile, "- [ ] Draussen\n");
    const relPath = "90_Archive/Escape.md";
    const linkPath = path.join(dir, relPath);
    symlinkSync(outsideFile, linkPath);

    const result = toggleTask(dir, db, relPath, 1, "- [ ] Draussen");

    expect(result).toEqual({ ok: false, current: null, escapesVault: true });
    expect(readFileSync(outsideFile, "utf8")).toBe("- [ ] Draussen\n");
    // atomicWrite's rename lands on the symlink itself rather than its target, so an unrefused
    // write would not touch the outside file - it would silently replace the vault's symlink
    // with a plain file instead. That loss is what this checks for.
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  });

  it("toggleTask refuses a note reached through a folder symlinked to outside the vault", () => {
    const outsideFolder = path.join(outside, "Ordner");
    mkdirSync(outsideFolder);
    const outsideFile = path.join(outsideFolder, "Note.md");
    writeFileSync(outsideFile, "- [ ] Draussen\n");
    symlinkSync(outsideFolder, path.join(dir, "90_Archive", "Linked"));

    const result = toggleTask(
      dir,
      db,
      "90_Archive/Linked/Note.md",
      1,
      "- [ ] Draussen",
    );

    expect(result).toEqual({ ok: false, current: null, escapesVault: true });
    expect(readFileSync(outsideFile, "utf8")).toBe("- [ ] Draussen\n");
  });

  it("does not refuse a symlink whose realpath stays inside the vault", () => {
    symlinkSync(
      path.join(dir, LEUCHTTURM),
      path.join(dir, "90_Archive", "InVaultLink.md"),
    );
    const before = db
      .prepare("SELECT raw FROM tasks WHERE path = ? AND line = ?")
      .get(LEUCHTTURM, 8) as TaskRow;

    const result = toggleTask(
      dir,
      db,
      "90_Archive/InVaultLink.md",
      8,
      before.raw,
      "2026-09-01",
    );

    expect(result.ok).toBe(true);
  });

  it("appendTask refuses a target that is a symlink to outside the vault", () => {
    const outsideFile = path.join(outside, "Outside.md");
    writeFileSync(outsideFile, "## Aufgaben\n");
    const relPath = "90_Archive/Escape.md";
    const linkPath = path.join(dir, relPath);
    symlinkSync(outsideFile, linkPath);

    const result = appendTask(dir, db, relPath, "- [ ] Neu");

    expect(result).toEqual({ ok: false });
    expect(readFileSync(outsideFile, "utf8")).toBe("## Aufgaben\n");
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  });

  it("appendTask refuses a target reached through a folder symlinked to outside the vault", () => {
    const outsideFolder = path.join(outside, "Ordner");
    mkdirSync(outsideFolder);
    const outsideFile = path.join(outsideFolder, "Note.md");
    writeFileSync(outsideFile, "## Aufgaben\n");
    symlinkSync(outsideFolder, path.join(dir, "90_Archive", "Linked"));

    const result = appendTask(
      dir,
      db,
      "90_Archive/Linked/Note.md",
      "- [ ] Neu",
    );

    expect(result).toEqual({ ok: false });
    expect(readFileSync(outsideFile, "utf8")).toBe("## Aufgaben\n");
  });
});
