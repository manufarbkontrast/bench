import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTree, noteUrl, startNote } from "./tree";
import type { TreeEntry } from "./types";

const entries: TreeEntry[] = [
  { path: "00_Index/Start.md", title: "Start", folder: "00_Index" },
  {
    path: "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    title: "2026-08-01 Call Hafen",
    folder: "30_Projekte/Leuchtturm/Calls",
  },
  {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    title: "Leuchtturm",
    folder: "30_Projekte/Leuchtturm",
  },
  { path: "Willkommen.md", title: "Willkommen", folder: "" },
];

describe("buildTree", () => {
  it("nests folders and keeps root notes at the top level", () => {
    const root = buildTree(entries);
    expect(root.notes.map((n) => n.title)).toEqual(["Willkommen"]);
    expect(root.folders.map((f) => f.name)).toEqual([
      "00_Index",
      "30_Projekte",
    ]);
    const projects = root.folders[1];
    expect(projects.path).toBe("30_Projekte");
    expect(projects.folders[0].folders[0]).toMatchObject({
      name: "Calls",
      path: "30_Projekte/Leuchtturm/Calls",
    });
    expect(projects.folders[0].notes.map((n) => n.title)).toEqual([
      "Leuchtturm",
    ]);
  });
});

describe("noteUrl and ancestorsOf", () => {
  it("encodes each segment and lists the folders above a note", () => {
    expect(
      noteUrl("30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md"),
    ).toBe("/n/30_Projekte/Leuchtturm/Calls/2026-08-01%20Call%20Hafen.md");
    expect(ancestorsOf("30_Projekte/Leuchtturm/Calls/x.md")).toEqual([
      "30_Projekte",
      "30_Projekte/Leuchtturm",
      "30_Projekte/Leuchtturm/Calls",
    ]);
    expect(ancestorsOf("x.md")).toEqual([]);
  });
});

describe("startNote", () => {
  it("prefers the note called Start, else the first", () => {
    expect(startNote(entries)?.path).toBe("00_Index/Start.md");
    expect(startNote(entries.slice(1))?.path).toBe(
      "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    );
    expect(startNote([])).toBeUndefined();
  });
});
