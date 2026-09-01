import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { EXCLUDED, listTasks } from "../../src/aufgaben/tasks.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-aufgaben-tasks-");
afterAll(scratch.cleanup);

interface NoteFixture {
  path: string;
  title: string;
  tags: string[];
}

interface TaskFixture {
  path: string;
  line: number;
  text: string;
}

function buildVault(
  notes: NoteFixture[],
  tasks: TaskFixture[],
  name: string,
): Database.Database {
  const db = openVaultDb(path.join(scratch.dir, name));
  const insertNote = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertTag = db.prepare("INSERT INTO tags (path, tag) VALUES (?, ?)");
  const insertTask = db.prepare(
    `INSERT INTO tasks (path, line, raw, text, done, due, scheduled, start, priority, recurrence, done_at)
     VALUES (?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, NULL, NULL)`,
  );
  for (const note of notes) {
    insertNote.run(note.path, note.title, "", "{}", "", 0, 0);
    for (const tag of note.tags) insertTag.run(note.path, tag);
  }
  for (const task of tasks)
    insertTask.run(task.path, task.line, `- [ ] ${task.text}`, task.text);
  return db;
}

describe("listTasks", () => {
  it("drops a task filed under 50_Workflow", () => {
    const db = buildVault(
      [
        {
          path: "50_Workflow/Testing.md",
          title: "Testing",
          tags: ["workflow"],
        },
      ],
      [{ path: "50_Workflow/Testing.md", line: 1, text: "Not surfaced" }],
      "excluded-workflow.sqlite",
    );
    expect(listTasks(db)).toEqual([]);
  });

  it("drops a task filed under Templates or 90_Archive, wherever the segment sits", () => {
    const db = buildVault(
      [
        { path: "Templates/Neues.md", title: "Neues", tags: [] },
        {
          path: "30_Projekte/90_Archive/Alt.md",
          title: "Alt",
          tags: [],
        },
      ],
      [
        { path: "Templates/Neues.md", line: 1, text: "Aus Vorlage" },
        { path: "30_Projekte/90_Archive/Alt.md", line: 1, text: "Archiviert" },
      ],
      "excluded-others.sqlite",
    );
    expect(listTasks(db)).toEqual([]);
  });

  it("carries the note's first brand tag, prefix stripped", () => {
    const db = buildVault(
      [
        {
          path: "30_Projekte/Leuchtturm/Leuchtturm.md",
          title: "Leuchtturm",
          tags: ["project", "brand/nordlicht", "status/active"],
        },
      ],
      [
        {
          path: "30_Projekte/Leuchtturm/Leuchtturm.md",
          line: 1,
          text: "Spezifikation schreiben",
        },
      ],
      "brand.sqlite",
    );
    expect(listTasks(db)).toEqual([
      {
        path: "30_Projekte/Leuchtturm/Leuchtturm.md",
        line: 1,
        raw: "- [ ] Spezifikation schreiben",
        text: "Spezifikation schreiben",
        done: false,
        due: null,
        scheduled: null,
        start: null,
        priority: null,
        recurrence: null,
        doneAt: null,
        noteTitle: "Leuchtturm",
        brand: "nordlicht",
      },
    ]);
  });

  it("leaves brand null for a note with no brand tag", () => {
    const db = buildVault(
      [{ path: "30_Projekte/Ohne/Ohne.md", title: "Ohne", tags: ["project"] }],
      [{ path: "30_Projekte/Ohne/Ohne.md", line: 1, text: "Etwas tun" }],
      "no-brand.sqlite",
    );
    expect(listTasks(db)[0].brand).toBeNull();
  });

  it("takes the first brand tag when a note carries more than one", () => {
    const db = buildVault(
      [
        {
          path: "20_Brands/Doppel.md",
          title: "Doppel",
          tags: ["brand/erste", "brand/zweite"],
        },
      ],
      [{ path: "20_Brands/Doppel.md", line: 1, text: "Etwas tun" }],
      "two-brands.sqlite",
    );
    expect(listTasks(db)[0].brand).toBe("erste");
  });

  it("exposes EXCLUDED as the three housekeeping folders", () => {
    expect(EXCLUDED).toEqual(
      new Set(["50_Workflow", "Templates", "90_Archive"]),
    );
  });
});
