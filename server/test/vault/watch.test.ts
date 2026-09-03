import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { FSWatcher } from "chokidar";
import { openDb } from "../../src/vault/db.js";
import { indexAll } from "../../src/vault/index/indexer.js";
import { watchVault } from "../../src/vault/watch.js";
import { copyFixture } from "./fixture.js";

let dir: string;
let db: Database.Database;
let watcher: FSWatcher;
let waiters: (() => void)[] = [];

const notes = () =>
  (db.prepare("SELECT COUNT(*) AS c FROM notes").get() as { c: number }).c;

/** Resolves on the watcher's next onChange - the moment the index is updated, however slow the machine. */
const nextChange = () =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("no watcher event within 30 s")),
      30_000,
    );
    waiters = [
      ...waiters,
      () => {
        clearTimeout(timer);
        resolve();
      },
    ];
  });

beforeEach(async () => {
  dir = copyFixture();
  db = openDb(":memory:");
  indexAll(db, dir);
  waiters = [];
  watcher = watchVault(db, dir, () => {
    const pending = waiters;
    waiters = [];
    for (const w of pending) w();
  });
  await new Promise<void>((resolve) => watcher.on("ready", () => resolve()));
});

afterEach(async () => {
  await watcher.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("watchVault", () => {
  it("indexes a new note, re-indexes a changed one and forgets a deleted one", async () => {
    const added = nextChange();
    writeFileSync(
      path.join(dir, "60_Knowledge", "Neu.md"),
      "# Neu\n\nVerweist auf [[Start]].\n",
    );
    await added;
    expect(notes()).toBe(14);
    expect(
      db
        .prepare("SELECT to_path FROM links WHERE from_path = ?")
        .get("60_Knowledge/Neu.md"),
    ).toEqual({ to_path: "00_Index/Start.md" });

    const edited = nextChange();
    writeFileSync(
      path.join(dir, "60_Knowledge", "Neu.md"),
      "# Neu\n\nOhne Link.\n",
    );
    await edited;
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM links WHERE from_path = ?")
          .get("60_Knowledge/Neu.md") as { c: number }
      ).c,
    ).toBe(0);

    const removed = nextChange();
    unlinkSync(path.join(dir, "60_Knowledge", "Neu.md"));
    await removed;
    expect(notes()).toBe(13);
  });

  it("indexes a note with malformed frontmatter instead of leaving the event unhandled, and it is findable by body text", async () => {
    const added = nextChange();
    writeFileSync(
      path.join(dir, "60_Knowledge", "Kaputt.md"),
      "---\ntitle: [unterminated\nfoo: bar\n---\n\nKaputte Frontmatter mit findmekaputttoken.\n",
    );
    await added;
    expect(notes()).toBe(14);
    // The fallback in splitNote keeps the whole file as body rather than dropping it from the
    // index - proving it appears in the notes table is not the same as proving FTS can find it,
    // since notes_fts is a second table indexNote writes to independently.
    expect(
      db
        .prepare(
          "SELECT path FROM notes_fts WHERE notes_fts MATCH 'findmekaputttoken'",
        )
        .all(),
    ).toEqual([{ path: "60_Knowledge/Kaputt.md" }]);
  });

  it("ignores files that are not notes", async () => {
    writeFileSync(path.join(dir, ".obsidian", "workspace.json"), "{}");
    writeFileSync(path.join(dir, "assets", "neu.svg"), "<svg/>");
    // Neither ignored write fires onChange (dot-dir is filtered by chokidar, the svg by
    // isNotePath), so the next event this waits for can only be the real note below - proving
    // events still flow and the ignored files were skipped, without betting on a fixed sleep.
    const added = nextChange();
    writeFileSync(
      path.join(dir, "60_Knowledge", "Echt.md"),
      "# Echt\n\nEin echtes Notiz.\n",
    );
    await added;
    expect(notes()).toBe(14);
  });
});
