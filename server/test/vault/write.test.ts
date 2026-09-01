import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
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

beforeEach(() => {
  dir = copyFixture();
  db = openDb(":memory:");
  indexAll(db, dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
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

    expect(result).toEqual({ line: 19, raw: "- [ ] Neue Aufgabe" });
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
    expect(result.line).toBe(lines.length);
    expect(lines[lines.length - 1]).toBe("- [ ] Erste Aufgabe");
  });

  it("creates the missing Task_Inbox from its template and files the task under the heading", () => {
    const result = appendTask(dir, db, TASK_INBOX, "- [ ] Aus dem Inbox-Test");

    const text = readFileSync(path.join(dir, TASK_INBOX), "utf8");
    expect(text).toBe(
      "---\ntags: [inbox, tasks]\n---\n\n# Task_Inbox\n\n## Aufgaben\n- [ ] Aus dem Inbox-Test\n",
    );
    const lines = text.split("\n");
    expect(lines[result.line - 1]).toBe("- [ ] Aus dem Inbox-Test");
    const indexed = db
      .prepare("SELECT COUNT(*) AS c FROM notes WHERE path = ?")
      .get(TASK_INBOX) as { c: number };
    expect(indexed.c).toBe(1);
  });
});
