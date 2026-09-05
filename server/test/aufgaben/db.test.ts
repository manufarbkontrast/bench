import { describe, expect, it } from "vitest";
import {
  findImport,
  listImports,
  openAufgabenDb,
  recordImport,
} from "../../src/aufgaben/db.js";

describe("openAufgabenDb", () => {
  it("records an import and finds it back by source file and row hash, camelCase", () => {
    const db = openAufgabenDb(":memory:");
    recordImport(db, {
      sourceFile: "2026-08-20_hafenrunde.md",
      rowHash: "abc123",
      targetPath: "00_Index/Task_Inbox.md",
      line: 7,
      importedAt: 1_700_000_000,
    });

    expect(findImport(db, "2026-08-20_hafenrunde.md", "abc123")).toEqual({
      sourceFile: "2026-08-20_hafenrunde.md",
      rowHash: "abc123",
      targetPath: "00_Index/Task_Inbox.md",
      line: 7,
      importedAt: 1_700_000_000,
    });
  });

  it("misses to null for an unrecorded key", () => {
    const db = openAufgabenDb(":memory:");
    expect(findImport(db, "missing.md", "no-such-hash")).toBeNull();
  });

  it("throws on a second recordImport with the same source file and row hash", () => {
    const db = openAufgabenDb(":memory:");
    const row = {
      sourceFile: "2026-08-20_hafenrunde.md",
      rowHash: "abc123",
      targetPath: "00_Index/Task_Inbox.md",
      line: 7,
      importedAt: 1_700_000_000,
    };
    recordImport(db, row);
    expect(() => recordImport(db, row)).toThrow();
  });

  it("lists every import recorded for a source file, and none for another", () => {
    const db = openAufgabenDb(":memory:");
    recordImport(db, {
      sourceFile: "note.md",
      rowHash: "hash-a",
      targetPath: "target-a.md",
      line: 1,
      importedAt: 1,
    });
    recordImport(db, {
      sourceFile: "note.md",
      rowHash: "hash-b",
      targetPath: "target-b.md",
      line: 2,
      importedAt: 2,
    });
    recordImport(db, {
      sourceFile: "other.md",
      rowHash: "hash-c",
      targetPath: "target-c.md",
      line: 3,
      importedAt: 3,
    });

    expect(listImports(db, "note.md").map((r) => r.rowHash)).toEqual([
      "hash-a",
      "hash-b",
    ]);
  });
});
