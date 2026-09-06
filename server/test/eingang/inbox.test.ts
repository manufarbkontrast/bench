import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  frontmatterValue,
  isLocal,
  listInbox,
  localRecordingIds,
  plaudStatus,
  quelleOf,
} from "../../src/eingang/inbox.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-eingang-inbox-");
afterAll(scratch.cleanup);

let n = 0;
/** A fresh watch dir plus a notizen/archiv pair, none of which exist until a test populates them. */
function world(): {
  watch: string;
  notizenDir: string;
  archivDir: string;
} {
  n += 1;
  const base = path.join(scratch.dir, `world-${n}`);
  return {
    watch: path.join(base, "inbox"),
    notizenDir: path.join(base, "notizen"),
    archivDir: path.join(base, "archiv"),
  };
}

function writeInboxFile(watch: string, name: string, content = "x"): void {
  mkdirSync(watch, { recursive: true });
  writeFileSync(path.join(watch, name), content);
}

describe("listInbox", () => {
  it("lists names matching transcript/transkript/besprechung case-insensitively, and audio extensions, but not a plain name", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "foo-transcript.txt");
    writeInboxFile(watch, "Besprechung_x.pdf");
    writeInboxFile(watch, "notes.txt");
    writeInboxFile(watch, "voice.m4a");

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    const byName = new Map(files.map((file) => [file.name, file]));
    expect(byName.get("foo-transcript.txt")?.kind).toBe("text");
    expect(byName.get("Besprechung_x.pdf")?.kind).toBe("text");
    expect(byName.get("voice.m4a")?.kind).toBe("audio");
    expect(byName.has("notes.txt")).toBe(false);
  });

  it("skips names starting with a dot or an underscore even when they would otherwise match", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, ".transcript.txt");
    writeInboxFile(watch, "_HIER-transcript.txt");
    writeInboxFile(watch, "kept-transcript.txt");

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    expect(files.map((file) => file.name)).toEqual(["kept-transcript.txt"]);
  });

  it("contributes nothing for a missing watch dir rather than throwing", () => {
    const { notizenDir, archivDir } = world();
    const missing = path.join(scratch.dir, "does-not-exist");

    const files = listInbox([missing], { notizenDir, archivDir }, new Set());

    expect(files).toEqual([]);
  });

  it("marks a file notiz_vorhanden when its name exists in the archive dir", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "call-transcript.txt");
    mkdirSync(archivDir, { recursive: true });
    writeFileSync(path.join(archivDir, "call-transcript.txt"), "archived");

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    expect(files[0].status).toBe("notiz_vorhanden");
  });

  it("marks a file notiz_vorhanden when a note's quelle names it, even though the same note's titel has its own colon-space", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "foo-transcript.txt");
    mkdirSync(notizenDir, { recursive: true });
    writeFileSync(
      path.join(notizenDir, "note.md"),
      [
        "---",
        "titel: 08-18 Besprechung: Q4-Planungslogik",
        "quelle: foo-transcript.txt",
        "---",
        "",
        "# Body",
      ].join("\n"),
    );

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    expect(files[0].status).toBe("notiz_vorhanden");
  });

  it("marks a file in_arbeit when its name is in inFlight and it has no archive or note hit", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "session-transcript.txt");

    const files = listInbox(
      [watch],
      { notizenDir, archivDir },
      new Set(["session-transcript.txt"]),
    );

    expect(files[0].status).toBe("in_arbeit");
  });

  it("prefers notiz_vorhanden over in_arbeit when both apply", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "both-transcript.txt");
    mkdirSync(archivDir, { recursive: true });
    writeFileSync(path.join(archivDir, "both-transcript.txt"), "archived");

    const files = listInbox(
      [watch],
      { notizenDir, archivDir },
      new Set(["both-transcript.txt"]),
    );

    expect(files[0].status).toBe("notiz_vorhanden");
  });

  it("defaults to unverarbeitet when neither the archive, a note, nor inFlight has a hit", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "fresh-transcript.txt");

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    expect(files[0].status).toBe("unverarbeitet");
  });

  it("orders files by mtime descending", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "a-transcript.txt");
    writeInboxFile(watch, "b-transcript.txt");
    writeInboxFile(watch, "c-transcript.txt");
    const base = new Date("2026-08-01T00:00:00Z").getTime() / 1000;
    utimesSync(path.join(watch, "a-transcript.txt"), base, base);
    utimesSync(
      path.join(watch, "b-transcript.txt"),
      base + 20_000,
      base + 20_000,
    );
    utimesSync(
      path.join(watch, "c-transcript.txt"),
      base + 10_000,
      base + 10_000,
    );

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    expect(files.map((file) => file.name)).toEqual([
      "b-transcript.txt",
      "c-transcript.txt",
      "a-transcript.txt",
    ]);
  });

  it("lists a non-matching file name when its own watch dir's basename matches NAME_PATTERN", () => {
    const { notizenDir, archivDir } = world();
    const watch = path.join(
      scratch.dir,
      `world-${n}-dir`,
      "Besprechungs-Textfiles",
    );
    writeInboxFile(watch, "agenda.pdf");

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    expect(files.map((file) => file.name)).toEqual(["agenda.pdf"]);
  });

  it("does not list the same non-matching file name when its watch dir's basename also does not match", () => {
    const { notizenDir, archivDir } = world();
    const watch = path.join(scratch.dir, `world-${n}-dir`, "stuff");
    writeInboxFile(watch, "agenda.pdf");

    const files = listInbox([watch], { notizenDir, archivDir }, new Set());

    expect(files).toEqual([]);
  });

  it("lists a same-named file from each of two watch dirs, both carrying the same reconciled status", () => {
    const { notizenDir, archivDir } = world();
    const watchA = path.join(scratch.dir, `world-${n}-a`);
    const watchB = path.join(scratch.dir, `world-${n}-b`);
    writeInboxFile(watchA, "shared-transcript.txt");
    writeInboxFile(watchB, "shared-transcript.txt");

    const files = listInbox(
      [watchA, watchB],
      { notizenDir, archivDir },
      new Set(),
    );

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.dir)).toEqual(
      expect.arrayContaining([watchA, watchB]),
    );
    expect(files.every((file) => file.name === "shared-transcript.txt")).toBe(
      true,
    );
    expect(files.every((file) => file.status === "unverarbeitet")).toBe(true);
  });
});

describe("quelleOf", () => {
  it("reads the quelle value from a note's frontmatter", () => {
    const text = ["---", "titel: X", "quelle: foo.pdf", "---", "", "# X"].join(
      "\n",
    );
    expect(quelleOf(text)).toBe("foo.pdf");
  });

  it("returns null for a note without frontmatter", () => {
    expect(quelleOf("# Just a heading\n\nNo frontmatter here.")).toBeNull();
  });

  it("returns null when the frontmatter has no quelle key", () => {
    const text = ["---", "titel: X", "datum: 2026-08-20", "---", "# X"].join(
      "\n",
    );
    expect(quelleOf(text)).toBeNull();
  });
});

describe("frontmatterValue / localRecordingIds / plaudStatus", () => {
  it("reads a key up to the first ': ' and ignores a titel with its own colon", () => {
    const text =
      "---\ntitel: 08-18 Besprechung: Q4\naufnahme: abc-1\n---\n# x\n";
    expect(frontmatterValue(text, "aufnahme")).toBe("abc-1");
    expect(frontmatterValue(text, "titel")).toBe("08-18 Besprechung: Q4");
    expect(frontmatterValue("# no frontmatter", "aufnahme")).toBeNull();
  });
  it("collects ids per folder, skipping non-md files and missing folders", () => {
    const { watch, notizenDir, archivDir } = world();
    writeInboxFile(watch, "a-transkript.md", "---\naufnahme: id-inbox\n---\n");
    writeInboxFile(watch, "b-transcript.txt", "---\naufnahme: id-txt\n---\n");
    mkdirSync(notizenDir, { recursive: true });
    writeFileSync(
      path.join(notizenDir, "n.md"),
      "---\naufnahme: id-note\n---\n",
    );
    const local = localRecordingIds({ inboxDir: watch, archivDir, notizenDir });
    expect([...local.inbox]).toEqual(["id-inbox"]);
    expect([...local.archiv]).toEqual([]);
    expect([...local.notizen]).toEqual(["id-note"]);
    expect(isLocal("id-note", local)).toBe(true);
    expect(isLocal("id-txt", local)).toBe(false);
  });
  it("reconciles in the fixed order", () => {
    const local = {
      inbox: new Set(["x", "both"]),
      archiv: new Set(["y", "both"]),
      notizen: new Set(["z", "both"]),
    };
    expect(plaudStatus("both", local, new Set())).toBe("notiz_vorhanden");
    expect(plaudStatus("y", local, new Set(["y"]))).toBe("im_archiv");
    expect(plaudStatus("x", local, new Set())).toBe("im_eingang");
    expect(plaudStatus("w", local, new Set(["w"]))).toBe("wird_geholt");
    expect(plaudStatus("w", local, new Set())).toBe("neu");
  });
});
