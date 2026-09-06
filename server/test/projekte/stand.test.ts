import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { projektOf } from "../../src/vault/index/frontmatter.js";
import type { ProjectRow } from "../../src/projekte/db.js";
import type { ProjektStand, Signals } from "../../src/projekte/stand.js";
import {
  localDay,
  plaudNoteMeta,
  projektStand,
} from "../../src/projekte/stand.js";
import { scratchDir } from "./tmp.js";

interface NoteFixture {
  path: string;
  title?: string;
  frontmatter: Record<string, unknown>;
  body?: string;
}

// Module-level scratch dir, one per file, as handoffs.test.ts does; each buildVault call gets its
// own database file so tests in this file do not share state.
const scratch = scratchDir("bench-stand-");
afterAll(scratch.cleanup);
let dbCount = 0;
let notizenCount = 0;

/** A fresh scratch subdirectory holding the given `.md` files, named the way buildVault names its databases. */
function notizenDir(files: Record<string, string>): string {
  const dir = path.join(scratch.dir, `notizen-${String(notizenCount++)}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function buildVault(notes: NoteFixture[]): Database.Database {
  const db = openVaultDb(
    path.join(scratch.dir, `vault-${String(dbCount++)}.sqlite`),
  );
  const insert = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, projekt, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const note of notes) {
    insert.run(
      note.path,
      note.title ?? path.posix.basename(note.path, ".md"),
      path.posix.dirname(note.path),
      JSON.stringify(note.frontmatter),
      projektOf(note.frontmatter),
      note.body ?? "",
      0,
      0,
    );
  }
  return db;
}

function insertTask(
  db: Database.Database,
  notePath: string,
  line: number,
  done: number,
): void {
  db.prepare(
    "INSERT INTO tasks (path, line, raw, text, done) VALUES (?, ?, '- [ ] t', 't', ?)",
  ).run(notePath, line, done);
}

const HANDOFF_FOLDER = "50_Workflow/Handoffs";

function handoff(
  slug: string,
  overrides: { updated?: string; repos?: string[] } = {},
): NoteFixture {
  return {
    path: `${HANDOFF_FOLDER}/Handoff_${slug}.md`,
    frontmatter: {
      projekt: slug,
      updated: overrides.updated,
      repos: overrides.repos ?? [],
    },
  };
}

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    path: "",
    name: "",
    kind: "git",
    remote: null,
    remoteLabel: null,
    branch: null,
    lastCommitAt: null,
    lastCommitSubject: null,
    dirty: 0,
    ahead: null,
    behind: null,
    notePath: null,
    brand: null,
    status: null,
    issues: null,
    prs: null,
    groupKey: "g",
    scannedAt: 0,
    ...overrides,
  };
}

describe("localDay", () => {
  it("formats a timestamp as YYYY-MM-DD in the local zone", () => {
    expect(localDay(new Date(2026, 7, 1, 23, 30).getTime())).toBe("2026-08-01");
  });
});

describe("projektStand", () => {
  it("couples repos by lowercased resolved path and reports missing ones by basename", () => {
    const db = buildVault([
      handoff("a", { repos: ["/abs/Repo-A", "/abs/nicht-da"] }),
    ]);
    const rows = [
      row({ path: "/abs/repo-a", name: "repo-a" }),
      row({ path: "/abs/other", name: "other" }),
    ];
    const reply = projektStand(db, rows, null);
    const first: ProjektStand = reply.projekte[0];
    expect(first.repos.map((r) => r.name)).toEqual(["repo-a"]);
    expect(first.missingRepos).toEqual(["nicht-da"]);
    expect(reply.ohneProjekt.map((r) => r.name)).toEqual(["other"]);
  });

  it("is veraltet when the newest commit day is after updated, not on it", () => {
    const onTheDay = new Date(2026, 7, 1, 23, 30).getTime(); // 2026-08-01 local, late evening
    const dayAfter = new Date(2026, 7, 2, 0, 5).getTime();
    const db = buildVault([
      handoff("a", { updated: "2026-08-01", repos: ["/abs/a"] }),
    ]);
    expect(
      projektStand(db, [row({ path: "/abs/a", lastCommitAt: onTheDay })], null)
        .projekte[0].signals.veraltet,
    ).toBe(false);
    expect(
      projektStand(db, [row({ path: "/abs/a", lastCommitAt: dayAfter })], null)
        .projekte[0].signals.veraltet,
    ).toBe(true);
  });

  it("is not veraltet without repos, without commits, or without a date", () => {
    const withoutRepos = buildVault([handoff("a", { updated: "2026-08-01" })]);
    expect(
      projektStand(withoutRepos, [], null).projekte[0].signals.veraltet,
    ).toBe(false);

    const withoutCommit = buildVault([
      handoff("b", { updated: "2026-08-01", repos: ["/abs/b"] }),
    ]);
    expect(
      projektStand(withoutCommit, [row({ path: "/abs/b" })], null).projekte[0]
        .signals.veraltet,
    ).toBe(false);

    const withoutDate = buildVault([handoff("c", { repos: ["/abs/c"] })]);
    expect(
      projektStand(
        withoutDate,
        [row({ path: "/abs/c", lastCommitAt: Date.now() })],
        null,
      ).projekte[0].signals.veraltet,
    ).toBe(false);
  });

  it("counts dirty repos", () => {
    const db = buildVault([handoff("a", { repos: ["/abs/x", "/abs/y"] })]);
    const signals: Signals = projektStand(
      db,
      [row({ path: "/abs/x", dirty: 3 }), row({ path: "/abs/y", dirty: 0 })],
      null,
    ).projekte[0].signals;
    expect(signals.dirtyRepos).toBe(1);
  });

  it("counts open tasks of notes carrying the slug, excluding housekeeping folders and done tasks", () => {
    const db = buildVault([
      handoff("a"),
      { path: "30_Projekte/A/A.md", frontmatter: { projekt: "A" } },
      { path: "Templates/T.md", frontmatter: { projekt: "a" } },
    ]);
    insertTask(db, "30_Projekte/A/A.md", 1, 0);
    insertTask(db, "30_Projekte/A/A.md", 2, 1);
    insertTask(db, `${HANDOFF_FOLDER}/Handoff_a.md`, 5, 0);
    insertTask(db, "Templates/T.md", 1, 0);
    expect(projektStand(db, [], null).projekte[0].signals.offeneTasks).toBe(1);
  });

  it("counts a task under a note whose projekt normalises to the slug, not one that fails the rule", () => {
    const db = buildVault([
      handoff("bench"),
      { path: "30_Projekte/A.md", frontmatter: { projekt: " Bench " } },
      { path: "30_Projekte/B.md", frontmatter: { projekt: "kein slug!" } },
    ]);
    insertTask(db, "30_Projekte/A.md", 1, 0);
    insertTask(db, "30_Projekte/B.md", 1, 0);
    const reply = projektStand(db, [], null);
    expect(reply.projekte[0].signals.offeneTasks).toBe(1);
  });

  it("sorts veraltet first, then oldest updated first, unknown dates last", () => {
    const db = buildVault([
      handoff("a", { updated: "2026-07-01", repos: ["/abs/a"] }),
      handoff("b", { updated: "2026-07-10", repos: ["/abs/b"] }),
      handoff("c"),
      handoff("d", { updated: "2026-07-20", repos: ["/abs/d"] }),
    ]);
    const rows = [
      row({ path: "/abs/a", lastCommitAt: new Date(2026, 6, 2).getTime() }), // after 07-01 -> veraltet
      row({ path: "/abs/b", lastCommitAt: new Date(2026, 6, 11).getTime() }), // after 07-10 -> veraltet
      row({ path: "/abs/d", lastCommitAt: new Date(2026, 6, 20).getTime() }), // on 07-20 -> not veraltet
    ];
    const reply = projektStand(db, rows, null);
    expect(reply.projekte.map((p) => p.slug)).toEqual(["a", "b", "d", "c"]);
  });

  it("passes the handoff warnings through and keeps ohneProjekt in the given order", () => {
    const db = buildVault([
      { path: `${HANDOFF_FOLDER}/Handoff_ohne.md`, frontmatter: {} },
    ]);
    const rows = [
      row({ path: "/abs/z", name: "z" }),
      row({ path: "/abs/a", name: "a" }),
    ];
    const reply = projektStand(db, rows, null);
    expect(reply.warnings).toEqual(["Handoff ohne projekt: Handoff_ohne.md"]);
    expect(reply.ohneProjekt.map((r) => r.name)).toEqual(["z", "a"]);
  });
});

describe("plaudNoteMeta", () => {
  it("reads projekt and datum, tolerating a titel with a colon, and is null without either", () => {
    expect(
      plaudNoteMeta(
        "---\ntitel: 08-18 Besprechung: Q4\nprojekt: Bench \ndatum: 2026-08-20\n---\n",
      ),
    ).toEqual({ projekt: "bench", datum: "2026-08-20" });
    expect(plaudNoteMeta("---\ndatum: 2026-08-20\n---\n")).toBeNull();
    expect(plaudNoteMeta("# none")).toBeNull();
  });
});

describe("plaudNotizen", () => {
  it("counts notes with the slug dated after updated, not on it, not before, and 0 without a dir or updated", () => {
    const dir = notizenDir({
      "a.md": "---\nprojekt: bench\ndatum: 2026-08-02\n---\n",
      "b.md": "---\nprojekt: bench\ndatum: 2026-08-01\n---\n",
      "c.md": "---\nprojekt: bench\ndatum: 2026-07-31\n---\n",
      "d.md": "---\nprojekt: other\ndatum: 2026-09-01\n---\n",
      "e.txt": "---\nprojekt: bench\ndatum: 2026-09-01\n---\n",
    });
    const db = buildVault([
      handoff("bench", { updated: "2026-08-01" }),
      handoff("nodate"),
    ]);
    const reply = projektStand(db, [], dir);
    expect(
      reply.projekte.find((p) => p.slug === "bench")?.signals.plaudNotizen,
    ).toBe(1);
    expect(
      reply.projekte.find((p) => p.slug === "nodate")?.signals.plaudNotizen,
    ).toBe(0);
    expect(projektStand(db, [], null).projekte[0].signals.plaudNotizen).toBe(0);
    expect(
      projektStand(db, [], path.join(scratch.dir, "missing")).projekte[0]
        .signals.plaudNotizen,
    ).toBe(0);
  });
});
