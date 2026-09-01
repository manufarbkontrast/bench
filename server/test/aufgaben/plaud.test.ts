import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { PlaudItem } from "../../src/aufgaben/plaud.js";
import { listPlaudNotes, parsePlaudNote } from "../../src/aufgaben/plaud.js";
import { scratchDir } from "./tmp.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/aufgaben/fixture/notizen",
);
const FIXTURE_FILE = "2026-08-20_hafenrunde.md";
const fixtureText = readFileSync(path.join(FIXTURE_DIR, FIXTURE_FILE), "utf8");

const scratch = scratchDir("bench-plaud-parse-");
afterAll(scratch.cleanup);

describe("parsePlaudNote", () => {
  it("reads the frontmatter of the real fixture", () => {
    const note = parsePlaudNote(FIXTURE_FILE, fixtureText);
    expect(note.title).toBe(
      "08-20 Besprechung: Hafenrunde und Leuchtturm-Ausbau",
    );
    expect(note.date).toBe("2026-08-20");
    expect(note.source).toMatch(/-transcript\.pdf$/);
  });

  it("collects the Arbeitsaufträge rows in document order", () => {
    const note = parsePlaudNote(FIXTURE_FILE, fixtureText);
    expect(note.items).toHaveLength(4);
    const first: PlaudItem = note.items[0];
    const { rowHash, ...rest } = first;
    expect(rest).toEqual({
      wer: "Jonas",
      was: "Die Spezifikation für den Leuchtturm-Ausbau schreiben",
      bis: "2026-09-05",
      zeitmarke: "[00:01:10]",
    });
    expect(rowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives every row a distinct, 64-character hex hash", () => {
    const note = parsePlaudNote(FIXTURE_FILE, fixtureText);
    const hashes = note.items.map((item) => item.rowHash);
    expect(new Set(hashes).size).toBe(4);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("collects Offene Fragen and Direkt erledigbar as plain strings", () => {
    const note = parsePlaudNote(FIXTURE_FILE, fixtureText);
    expect(note.openQuestions).toEqual([
      "Welche Lampe genau gemeint ist `[00:02:40]`",
      "Ob der Hafen im Oktober frei ist `[00:03:15]`",
    ]);
    expect(note.direct).toEqual([
      "Den Plan aus dem Frühjahr heraussuchen und neben die Notiz legen.",
    ]);
  });

  it("parses a frontmatter titel containing its own colon-space, verbatim", () => {
    const text = [
      "---",
      "titel: 08-18 Besprechung: Q4-Planungslogik 2026, Budget",
      "datum: 2026-08-18",
      "quelle: q4-transcript.pdf",
      "---",
      "",
      "# Fallback heading",
      "",
      "## Arbeitsaufträge",
      "",
    ].join("\n");
    const note = parsePlaudNote("2026-08-18_q4.md", text);
    expect(note.title).toBe("08-18 Besprechung: Q4-Planungslogik 2026, Budget");
    expect(note.date).toBe("2026-08-18");
    expect(note.source).toBe("q4-transcript.pdf");
  });

  it("returns empty items when there is no Arbeitsaufträge section", () => {
    const text = [
      "---",
      "titel: Ohne Aufträge",
      "---",
      "",
      "# Ohne Aufträge",
      "",
    ].join("\n");
    const note = parsePlaudNote("ohne.md", text);
    expect(note.items).toEqual([]);
  });

  it("skips a malformed row with fewer than four cells", () => {
    const text = [
      "## Arbeitsaufträge",
      "",
      "| Wer | Was | Bis wann | Zeitmarke |",
      "| --- | --- | --- | --- |",
      "| Jonas | fehlende Spalten |",
      "| Jonas | Vollständige Zeile | 2026-09-01 | `[00:00:05]` |",
      "",
    ].join("\n");
    const note = parsePlaudNote("malformed.md", text);
    expect(note.items).toHaveLength(1);
    expect(note.items[0].wer).toBe("Jonas");
    expect(note.items[0].was).toBe("Vollständige Zeile");
  });

  it("falls back to the first # heading when there is no frontmatter", () => {
    const text = [
      "# Nur eine Überschrift",
      "",
      "Ein Absatz ohne Frontmatter.",
    ].join("\n");
    const note = parsePlaudNote("kein-frontmatter.md", text);
    expect(note.title).toBe("Nur eine Überschrift");
    expect(note.date).toBeNull();
    expect(note.source).toBeNull();
  });

  it("falls back to the filename when there is neither frontmatter nor a heading", () => {
    const note = parsePlaudNote(
      "nur-inhalt.md",
      "Kein Titel, keine Frontmatter.",
    );
    expect(note.title).toBe("nur-inhalt.md");
  });
});

describe("listPlaudNotes", () => {
  it("lists the .md files in the fixture dir", () => {
    expect(listPlaudNotes(FIXTURE_DIR)).toEqual([FIXTURE_FILE]);
  });

  it("returns an empty list for a missing directory", () => {
    expect(listPlaudNotes(path.join(scratch.dir, "missing"))).toEqual([]);
  });

  it("sorts multiple files descending, newest first", () => {
    const dir = path.join(scratch.dir, "sorted");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "2026-08-01_alt.md"), "# alt");
    writeFileSync(path.join(dir, "2026-08-20_neu.md"), "# neu");
    writeFileSync(path.join(dir, "2026-08-10_mitte.md"), "# mitte");
    expect(listPlaudNotes(dir)).toEqual([
      "2026-08-20_neu.md",
      "2026-08-10_mitte.md",
      "2026-08-01_alt.md",
    ]);
  });
});
