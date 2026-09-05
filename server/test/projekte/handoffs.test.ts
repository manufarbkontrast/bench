import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import type { Handoff } from "../../src/projekte/handoffs.js";
import {
  parseUpdated,
  vaultHandoffs,
  zustandSection,
} from "../../src/projekte/handoffs.js";
import { scratchDir } from "./tmp.js";

interface NoteFixture {
  path: string;
  title?: string;
  frontmatter: Record<string, unknown>;
  body?: string;
}

// Module-level scratch dir, one per file, as couple.test.ts does; each buildVault call gets its
// own database file inside it, named after the test.
const scratch = scratchDir("bench-handoffs-");
afterAll(scratch.cleanup);
let dbCount = 0;

function buildVault(notes: NoteFixture[]): Database.Database {
  const db = openVaultDb(
    path.join(scratch.dir, `vault-${String(dbCount++)}.sqlite`),
  );
  const insert = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const note of notes) {
    insert.run(
      note.path,
      note.title ?? path.posix.basename(note.path, ".md"),
      path.posix.dirname(note.path),
      JSON.stringify(note.frontmatter),
      note.body ?? "",
      0,
      0,
    );
  }
  return db;
}

const HANDOFF = "50_Workflow/Handoffs";

describe("zustandSection", () => {
  it("returns the Zustand section body up to the next H2", () => {
    const body = "# Handoff\n\n## Zustand\n\nA\nB\n\n## Offen\n\nC\n";
    expect(zustandSection(body)).toBe("A\nB");
  });
  it("falls back to the first H2 section", () => {
    expect(zustandSection("# H\n\n## Erstes\n\nX\n\n## Zweites\n\nY")).toBe(
      "X",
    );
  });
  it("is empty without any H2", () => {
    expect(zustandSection("# Nur Titel\n\nText")).toBe("");
  });
});

describe("parseUpdated", () => {
  it("keeps a plain date", () => {
    expect(parseUpdated("2026-09-05")).toBe("2026-09-05");
  });
  it("keeps the day of an ISO datetime (a YAML date through JSON)", () => {
    expect(parseUpdated("2026-09-05T00:00:00.000Z")).toBe("2026-09-05");
  });
  it("is null for anything else", () => {
    expect(parseUpdated("gestern")).toBeNull();
    expect(parseUpdated(20260905)).toBeNull();
    expect(parseUpdated(undefined)).toBeNull();
  });
});

describe("vaultHandoffs", () => {
  it("reads slug, title, updated, repos and zustand from a handoff note", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_leuchtturm.md`,
        title: "Handoff: Leuchtturm",
        frontmatter: {
          projekt: " Leuchtturm ",
          updated: "2026-08-01",
          repos: ["~/Projekte/leuchtturm", "/abs/hafen"],
        },
        body: "# Handoff: Leuchtturm\n\n## Zustand\n\nSteht.\n\n## Offen\n\n- x\n",
      },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(warnings).toEqual([]);
    expect(handoffs).toHaveLength(1);
    const h: Handoff = handoffs[0];
    expect(h.slug).toBe("leuchtturm");
    expect(h.title).toBe("Handoff: Leuchtturm");
    expect(h.updated).toBe("2026-08-01");
    expect(h.repos[0]).toBe(
      path.resolve(path.join(process.env.HOME ?? "", "Projekte", "leuchtturm")),
    );
    expect(h.repos[1]).toBe(path.resolve("/abs/hafen"));
    expect(h.zustand).toBe("Steht.");
  });
  it("ignores notes outside the Handoffs folder, including a sibling with an underscore", () => {
    const db = buildVault([
      { path: "50_Workflow/Testing.md", frontmatter: { projekt: "x" } },
      {
        path: "50xWorkflow/Handoffs/Handoff_y.md",
        frontmatter: { projekt: "y" },
      },
      { path: `${HANDOFF}/Handoff_z.md`, frontmatter: { projekt: "z" } },
    ]);
    expect(vaultHandoffs(db).handoffs.map((h) => h.slug)).toEqual(["z"]);
  });
  it("warns about a handoff without projekt and skips it", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_ohne.md`,
        frontmatter: { updated: "2026-01-01" },
      },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs).toEqual([]);
    expect(warnings).toEqual(["Handoff ohne projekt: Handoff_ohne.md"]);
  });
  it("keeps the first of two handoffs with the same slug and warns about the second", () => {
    const db = buildVault([
      { path: `${HANDOFF}/Handoff_b.md`, frontmatter: { projekt: "same" } },
      { path: `${HANDOFF}/Handoff_a.md`, frontmatter: { projekt: "SAME" } },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs.map((h) => h.notePath)).toEqual([
      `${HANDOFF}/Handoff_a.md`,
    ]);
    expect(warnings).toEqual(["Doppelter Slug same: Handoff_b.md"]);
  });
  it("skips non-string repos entries with a warning and tolerates a missing repos key", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_a.md`,
        frontmatter: { projekt: "a", repos: ["/abs/x", 7] },
      },
      { path: `${HANDOFF}/Handoff_b.md`, frontmatter: { projekt: "b" } },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs[0].repos).toEqual([path.resolve("/abs/x")]);
    expect(handoffs[1].repos).toEqual([]);
    expect(warnings).toEqual(["Ungültiger repos-Eintrag in Handoff_a.md"]);
  });
});
