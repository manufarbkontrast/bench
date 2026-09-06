import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb as openVaultDb } from "../../src/vault/db.js";
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
  it("keeps a fenced block's own ## line as part of the section, not a boundary", () => {
    const body =
      "# Handoff\n\n## Zustand\n\nText davor.\n\n```\n## nicht wirklich eine Überschrift\n```\n\nText danach.\n\n## Offen\n\nX\n";
    expect(zustandSection(body)).toBe(
      "Text davor.\n\n```\n## nicht wirklich eine Überschrift\n```\n\nText danach.",
    );
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
  it("reads slug, title (the body's first H1, never the note's own filename-derived title), updated, repos and zustand from a handoff note", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_leuchtturm.md`,
        // Deliberately NOT "Handoff: Leuchtturm" - proving title comes from the body's H1 below,
        // never from the note row's own title column (Obsidian's filename-derived one).
        title: "Handoff_leuchtturm",
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
    const h = handoffs[0];
    expect(h.slug).toBe("leuchtturm");
    expect(h.title).toBe("Handoff: Leuchtturm");
    expect(h.updated).toBe("2026-08-01");
    expect(h.repos[0]).toBe(
      path.resolve(path.join(process.env.HOME ?? "", "Projekte", "leuchtturm")),
    );
    expect(h.repos[1]).toBe(path.resolve("/abs/hafen"));
    expect(h.zustand).toBe("Steht.");
  });
  it("falls back to the slug when the body has no H1", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_hafen.md`,
        frontmatter: { projekt: "hafen" },
        body: "## Zustand\n\nKaimauer vermessen.\n",
      },
    ]);
    const { handoffs } = vaultHandoffs(db);
    expect(handoffs[0].title).toBe("hafen");
  });
  it("falls back to the slug when the only # line sits inside a fenced block", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_fenced.md`,
        frontmatter: { projekt: "fenced" },
        body: "## Zustand\n\n```\n# build the thing\n```\n\nText.\n",
      },
    ]);
    const { handoffs } = vaultHandoffs(db);
    expect(handoffs[0].title).toBe("fenced");
  });
  it("skips a fenced # line and reads the real H1 that follows", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_fenced2.md`,
        frontmatter: { projekt: "fenced2" },
        body: "```\n# x\n```\n\n# Title\n\n## Zustand\n\nText.\n",
      },
    ]);
    const { handoffs } = vaultHandoffs(db);
    expect(handoffs[0].title).toBe("Title");
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
  it("warns when repos is present but not a list", () => {
    const db = buildVault([
      {
        path: `${HANDOFF}/Handoff_a.md`,
        frontmatter: { projekt: "a", repos: "~/Projekte/x" },
      },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs[0].repos).toEqual([]);
    expect(warnings).toEqual(["repos ist keine Liste in Handoff_a.md"]);
  });
  it("stays silent when repos is simply absent", () => {
    const db = buildVault([
      { path: `${HANDOFF}/Handoff_b.md`, frontmatter: { projekt: "b" } },
    ]);
    const { handoffs, warnings } = vaultHandoffs(db);
    expect(handoffs[0].repos).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
