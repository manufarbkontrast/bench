import { describe, expect, it } from "vitest";
import {
  dauerText,
  fetchedFileName,
  fetchRecording,
  parseListFiles,
  parseMarks,
  parseNote,
  parseTranscriptPage,
  renderFetchedFile,
  slugify,
  zeitText,
  type FetchedRecording,
  type Recording,
} from "../../src/eingang/plaud-fetch.js";
import type { PlaudCall } from "../../src/eingang/plaud-mcp.js";

const lampe: Recording = {
  id: "fix-lampe-0901",
  titel: "Lampe für den Leuchtturm",
  start: "2026-09-01T09:00:00",
  dauer: 1523000,
};

describe("parseListFiles", () => {
  it("maps data entries to recordings and pages by a full page", () => {
    const entry = (i: number) => ({
      id: `id${String(i)}`,
      name: `N${String(i)}`,
      created_at: "2026-09-01T09:02:11",
      serial_number: "S",
      start_at: "2026-09-01T09:00:00",
      duration: 1000,
    });
    const full = JSON.stringify({
      type: "list",
      data: Array.from({ length: 20 }, (_, i) => entry(i)),
      page: 1,
      page_size: 20,
    });
    expect(parseListFiles(full, 1).nextPage).toBe(2);
    const short = JSON.stringify({
      type: "list",
      data: [entry(1)],
      page: 2,
      page_size: 20,
    });
    const page = parseListFiles(short, 2);
    expect(page.nextPage).toBeNull();
    expect(page.recordings).toEqual([
      { id: "id1", titel: "N1", start: "2026-09-01T09:00:00", dauer: 1000 },
    ]);
  });
  it("names an untitled recording Ohne Titel and skips an entry without an id", () => {
    const text = JSON.stringify({
      type: "list",
      data: [
        { id: "a", name: "", start_at: "2026-09-01T09:00:00", duration: 5 },
        { name: "no id" },
      ],
      page: 1,
      page_size: 20,
    });
    expect(parseListFiles(text, 1).recordings.map((r) => r.titel)).toEqual([
      "Ohne Titel",
    ]);
  });
});

describe("parseTranscriptPage / parseMarks / parseNote", () => {
  it("reads segments, the cursor, marks and the auto_sum_note", () => {
    const page = JSON.stringify({
      file_id: "x",
      block: "transaction",
      total: 1,
      offset: 0,
      limit: 500,
      returned: 1,
      next_cursor: "c2",
      segments: [
        {
          content: "Hallo",
          end_time: 4100,
          start_time: 1520,
          speaker: "Speaker 1",
          original_speaker: "Speaker 1",
          embeddingKey: null,
        },
      ],
    });
    expect(parseTranscriptPage(page)).toEqual({
      segments: [
        { start: 1520, end: 4100, speaker: "Speaker 1", text: "Hallo" },
      ],
      nextCursor: "c2",
    });
    const marks = JSON.stringify({
      file_id: "x",
      block: "mark_memo",
      total: 1,
      offset: 0,
      limit: 500,
      returned: 1,
      next_cursor: null,
      marks: [
        {
          timestamp: 4000,
          mark_type: 1,
          mark_content: "Lampe bestellen",
          content: null,
          title: null,
          mark_id: "m",
        },
      ],
    });
    expect(parseMarks(marks)).toEqual([{ at: 4000, text: "Lampe bestellen" }]);
    const note = JSON.stringify([
      { data_type: "high_light", data_content: "- x" },
      {
        data_type: "auto_sum_note",
        data_content: "## Zusammenfassung\n\nText.",
      },
    ]);
    expect(parseNote(note)).toBe("## Zusammenfassung\n\nText.");
  });
  it("treats a bare [], the not-available line and an empty note array as nothing", () => {
    expect(parseTranscriptPage("[]")).toEqual({
      segments: [],
      nextCursor: null,
    });
    expect(parseMarks("[]")).toEqual([]);
    expect(
      parseMarks(
        'Block "mark_memo" not available for this recording. Available blocks: transaction.',
      ),
    ).toEqual([]);
    expect(parseNote("[]")).toBeNull();
  });
});

describe("fetchRecording", () => {
  it("follows next_cursor, fetches marks and the note, and logs each call", async () => {
    const calls: string[] = [];
    const call: PlaudCall = (tool, args) => {
      calls.push(`${tool} ${JSON.stringify(args)}`);
      if (tool === "get_note")
        return Promise.resolve(
          JSON.stringify([
            { data_type: "auto_sum_note", data_content: "Note" },
          ]),
        );
      if (args.block === "mark_memo") return Promise.resolve("[]");
      const cursor = args.cursor;
      return Promise.resolve(
        JSON.stringify({
          next_cursor: cursor === undefined ? "c2" : null,
          segments: [
            {
              content: cursor === undefined ? "a" : "b",
              start_time: 0,
              end_time: 1,
              speaker: "S",
            },
          ],
        }),
      );
    };
    const log: string[] = [];
    const fetched = await fetchRecording(call, lampe, (l) => log.push(l));
    expect(fetched.segments.map((s) => s.text)).toEqual(["a", "b"]);
    expect(fetched.note).toBe("Note");
    expect(calls[0]).toBe(
      'get_transcript {"file_id":"fix-lampe-0901","block":"transaction","limit":500}',
    );
    expect(calls[1]).toContain('"cursor":"c2"');
    expect(
      calls.some(
        (c) => c.startsWith("get_transcript") && c.includes("mark_memo"),
      ),
    ).toBe(true);
    expect(calls.some((c) => c.startsWith("get_note"))).toBe(true);
    expect(log.length).toBeGreaterThanOrEqual(3);
  });
});

describe("naming and rendering", () => {
  it("slugifies German titles to ascii, capped at 60", () => {
    expect(slugify("Lampe für den Leuchtturm")).toBe(
      "lampe-fuer-den-leuchtturm",
    );
    expect(slugify("  Übergabe: Q4 / 2026!  ")).toBe("uebergabe-q4-2026");
    expect(slugify("")).toBe("aufnahme");
    expect(slugify("x".repeat(80))).toHaveLength(60);
  });
  it("formats durations and times", () => {
    expect(dauerText(23_000)).toBe("23s");
    expect(dauerText(323_000)).toBe("5m23s");
    expect(dauerText(3_900_000)).toBe("1h05m");
    expect(zeitText(4100)).toBe("00:00:04");
    expect(zeitText(3_661_000)).toBe("01:01:01");
  });
  it("names the file by day and slug, with a numeric suffix on collision", () => {
    expect(fetchedFileName(lampe, () => false)).toBe(
      "2026-09-01_lampe-fuer-den-leuchtturm-transkript.md",
    );
    const taken = new Set([
      "2026-09-01_lampe-fuer-den-leuchtturm-transkript.md",
      "2026-09-01_lampe-fuer-den-leuchtturm-2-transkript.md",
    ]);
    expect(fetchedFileName(lampe, (n) => taken.has(n))).toBe(
      "2026-09-01_lampe-fuer-den-leuchtturm-3-transkript.md",
    );
  });
  it("renders frontmatter and the three sections, with Keine. for absent marks and note", () => {
    const fetched: FetchedRecording = {
      recording: lampe,
      segments: [
        { start: 1520, end: 4100, speaker: "Speaker 1", text: "Hallo" },
      ],
      marks: [],
      note: null,
    };
    const text = renderFetchedFile(fetched, "2026-09-06");
    expect(
      text.startsWith(
        "---\naufnahme: fix-lampe-0901\ntitel: Lampe für den Leuchtturm\ndatum: 2026-09-01\nstart: 2026-09-01T09:00:00\ndauer: 25m23s\ngeholt: 2026-09-06\n---\n",
      ),
    ).toBe(true);
    expect(text).toContain(
      "# Lampe für den Leuchtturm\n\n## Transkript\n\n[00:00:01 - 00:00:04] Speaker 1: Hallo\n",
    );
    expect(text).toContain("## Markierungen\n\nKeine.\n");
    expect(text).toContain("## KI-Notiz (Plaud)\n\nKeine.\n");
    const withAll = renderFetchedFile(
      {
        ...fetched,
        marks: [{ at: 4000, text: "Lampe bestellen" }],
        note: "## Zusammenfassung\n\nText.",
      },
      "2026-09-06",
    );
    expect(withAll).toContain(
      "## Markierungen\n\n- [00:00:04] Lampe bestellen\n",
    );
    expect(withAll).toContain(
      "## KI-Notiz (Plaud)\n\n## Zusammenfassung\n\nText.\n",
    );
  });
});
