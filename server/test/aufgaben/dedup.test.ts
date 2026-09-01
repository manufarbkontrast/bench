import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { findExisting } from "../../src/aufgaben/dedup.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-dedup-");
afterAll(scratch.cleanup);

const WAS = "Die Spezifikation für den Leuchtturm-Ausbau schreiben";

interface TaskFixture {
  path: string;
  line: number;
  text: string;
  done: number;
}

function buildVault(tasks: TaskFixture[], name: string): Database.Database {
  const db = openVaultDb(path.join(scratch.dir, name));
  const insertNote = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (path, line, raw, text, done, due, scheduled, start, priority, recurrence, done_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)`,
  );
  for (const notePath of new Set(tasks.map((t) => t.path)))
    insertNote.run(notePath, "title", "", "{}", "", 0, 0);
  for (const task of tasks)
    insertTask.run(
      task.path,
      task.line,
      `- [ ] ${task.text}`,
      task.text,
      task.done,
    );
  return db;
}

describe("findExisting", () => {
  it("matches the fixture pairing at 2 of 4 significant words", () => {
    const db = buildVault(
      [{ path: "note.md", line: 1, text: "Spezifikation schreiben", done: 0 }],
      "hit.sqlite",
    );
    expect(findExisting(db, WAS)).toEqual({
      path: "note.md",
      line: 1,
      text: "Spezifikation schreiben",
    });
  });

  it("never matches a done task", () => {
    const db = buildVault(
      [{ path: "note.md", line: 1, text: "Spezifikation schreiben", done: 1 }],
      "done.sqlite",
    );
    expect(findExisting(db, WAS)).toBeNull();
  });

  it("returns null for an unrelated was", () => {
    const db = buildVault(
      [{ path: "note.md", line: 1, text: "Spezifikation schreiben", done: 0 }],
      "unrelated.sqlite",
    );
    expect(findExisting(db, "Den Hund heute Abend füttern")).toBeNull();
  });

  it("never counts short words like die, für, den towards the overlap", () => {
    const db = buildVault(
      [{ path: "note.md", line: 1, text: "Die für den", done: 0 }],
      "short.sqlite",
    );
    expect(findExisting(db, WAS)).toBeNull();
  });

  it("breaks a tie between equally-scoring tasks by path then line", () => {
    const db = buildVault(
      [
        { path: "b.md", line: 1, text: "Spezifikation schreiben", done: 0 },
        { path: "a.md", line: 5, text: "Spezifikation schreiben", done: 0 },
      ],
      "tie.sqlite",
    );
    expect(findExisting(db, WAS)).toEqual({
      path: "a.md",
      line: 5,
      text: "Spezifikation schreiben",
    });
  });
});
