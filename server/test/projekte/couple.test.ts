import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { vaultCouplings } from "../../src/projekte/couple.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-couple-");
afterAll(scratch.cleanup);

interface NoteFixture {
  path: string;
  frontmatter: Record<string, unknown>;
  tags?: string[];
}

function buildVault(notes: NoteFixture[]): Database.Database {
  const db = openVaultDb(path.join(scratch.dir, "vault.sqlite"));
  const insertNote = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertTag = db.prepare("INSERT INTO tags (path, tag) VALUES (?, ?)");
  for (const note of notes) {
    insertNote.run(
      note.path,
      "title",
      "",
      JSON.stringify(note.frontmatter),
      "",
      0,
      0,
    );
    for (const tag of note.tags ?? []) insertTag.run(note.path, tag);
  }
  return db;
}

describe("vaultCouplings", () => {
  it("extracts one coupling per note with a path, tilde-expanded and sorted", () => {
    const db = buildVault([
      {
        path: "zz-repo.md",
        frontmatter: { path: "~/x/repo" },
        tags: ["project", "brand/nordlicht", "status/active"],
      },
      { path: "aa-other.md", frontmatter: { path: "/abs/other" } },
      { path: "bb-empty.md", frontmatter: { path: "" } },
      { path: "cc-missing.md", frontmatter: {} },
    ]);

    const couplings = vaultCouplings(db);

    expect(couplings).toEqual([
      {
        notePath: "aa-other.md",
        projectPath: path.resolve("/abs/other"),
        brand: null,
        status: null,
      },
      {
        notePath: "zz-repo.md",
        projectPath: path.resolve(path.join(os.homedir(), "x/repo")),
        brand: "nordlicht",
        status: "active",
      },
    ]);
  });
});
