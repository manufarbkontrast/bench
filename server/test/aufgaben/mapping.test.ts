import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { suggestTarget } from "../../src/aufgaben/mapping.js";
import { openDb as openVaultDb } from "../../src/vault/db.js";
import { TASK_INBOX } from "../../src/vault/write.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-mapping-");
afterAll(scratch.cleanup);

const AEND_MERCH = "30_Projekte/AEND/Merch.md";
const SHOES_PLEASE = "20_Brands/Shoes_Please/Shoes_Please.md";
const MACHU = "20_Brands/Machu/Machu.md";
const KI_ROLLOUT = "30_Projekte/KI_Automatisierung/Rollout_Plan.md";
const ALL_TARGETS = [AEND_MERCH, SHOES_PLEASE, MACHU, KI_ROLLOUT];

function buildVault(notePaths: string[], name: string): Database.Database {
  const db = openVaultDb(path.join(scratch.dir, name));
  const insertNote = db.prepare(
    "INSERT INTO notes (path, title, folder, frontmatter, body, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const notePath of notePaths)
    insertNote.run(notePath, "title", "", "{}", "", 0, 0);
  return db;
}

describe("suggestTarget", () => {
  it("maps text naming Artists and Releases to the Merch note", () => {
    const db = buildVault(ALL_TARGETS, "artists-releases.sqlite");
    expect(
      suggestTarget(
        "Die Artists brauchen neue Releases für den Merch-Drop",
        db,
      ),
    ).toBe(AEND_MERCH);
  });

  it("maps SPZ to Shoes Please", () => {
    const db = buildVault(ALL_TARGETS, "spz.sqlite");
    expect(suggestTarget("SPZ braucht neue Schuhe", db)).toBe(SHOES_PLEASE);
  });

  it("matches the multi-word keyword 'shoes please' as a lowercased substring", () => {
    const db = buildVault(ALL_TARGETS, "shoes-please.sqlite");
    expect(suggestTarget("Neuigkeiten von Shoes Please diese Woche", db)).toBe(
      SHOES_PLEASE,
    );
  });

  it("falls through to the next rule when the matched rule's target is missing from the index", () => {
    const db = buildVault(
      [SHOES_PLEASE, KI_ROLLOUT],
      "missing-fallthrough.sqlite",
    );
    // "Release" hits the Merch rule, but Merch.md is not indexed here; "Dashboard" hits the
    // automation rule, whose target is indexed, so that is what wins.
    expect(
      suggestTarget("Wir planen das nächste Release und ein Dashboard", db),
    ).toBe(KI_ROLLOUT);
  });

  it("falls through to TASK_INBOX when the matched target is missing and nothing else matches", () => {
    const db = buildVault([SHOES_PLEASE], "missing-inbox.sqlite");
    expect(suggestTarget("Zeit für das nächste Release", db)).toBe(TASK_INBOX);
  });

  it("falls through to TASK_INBOX when no keyword matches", () => {
    const db = buildVault(ALL_TARGETS, "no-keyword.sqlite");
    expect(suggestTarget("Ein ganz normaler Einkaufszettel", db)).toBe(
      TASK_INBOX,
    );
  });

  it("does not match 'agent' as a whole word inside Musikagentur", () => {
    const db = buildVault(ALL_TARGETS, "musik.sqlite");
    expect(suggestTarget("Die Musikagentur hat sich gemeldet", db)).toBe(
      TASK_INBOX,
    );
  });
});
