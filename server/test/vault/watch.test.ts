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

const notes = () =>
  (db.prepare("SELECT COUNT(*) AS c FROM notes").get() as { c: number }).c;

/** Poll until the index reflects the file system; chokidar's latency is small but not zero. */
async function until(check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error("index did not catch up in time");
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeEach(async () => {
  dir = copyFixture();
  db = openDb(":memory:");
  indexAll(db, dir);
  watcher = watchVault(db, dir);
  await new Promise<void>((resolve) => watcher.on("ready", () => resolve()));
});

afterEach(async () => {
  await watcher.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("watchVault", () => {
  it("indexes a new note, re-indexes a changed one and forgets a deleted one", async () => {
    writeFileSync(
      path.join(dir, "60_Knowledge", "Neu.md"),
      "# Neu\n\nVerweist auf [[Start]].\n",
    );
    await until(() => notes() === 13);
    expect(
      db
        .prepare("SELECT to_path FROM links WHERE from_path = ?")
        .get("60_Knowledge/Neu.md"),
    ).toEqual({ to_path: "00_Index/Start.md" });

    writeFileSync(
      path.join(dir, "60_Knowledge", "Neu.md"),
      "# Neu\n\nOhne Link.\n",
    );
    await until(
      () =>
        (
          db
            .prepare("SELECT COUNT(*) AS c FROM links WHERE from_path = ?")
            .get("60_Knowledge/Neu.md") as { c: number }
        ).c === 0,
    );

    unlinkSync(path.join(dir, "60_Knowledge", "Neu.md"));
    await until(() => notes() === 12);
  });

  it("ignores files that are not notes", async () => {
    writeFileSync(path.join(dir, ".obsidian", "workspace.json"), "{}");
    writeFileSync(path.join(dir, "assets", "neu.svg"), "<svg/>");
    await new Promise((r) => setTimeout(r, 400));
    expect(notes()).toBe(12);
  });
});
