import { describe, expect, it } from "vitest";
import { dateText, EMPTY_TEXT, noteHref } from "./format";

describe("dateText", () => {
  it("formats an mtime in German medium style", () => {
    const mtime = Date.UTC(2026, 7, 30, 10, 0, 0);
    expect(dateText(mtime)).toBe(
      new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
        new Date(mtime),
      ),
    );
  });
});

describe("noteHref", () => {
  it("links to the vault note, encoding each path segment", () => {
    expect(noteHref("10_Profile/ueber-mich.md")).toBe(
      "/vault/n/10_Profile/ueber-mich.md",
    );
  });

  it("encodes a space in a folder or file name", () => {
    expect(noteHref("10_Profile/Ein Ordner/Datei.md")).toBe(
      "/vault/n/10_Profile/Ein%20Ordner/Datei.md",
    );
  });
});

describe("EMPTY_TEXT", () => {
  it("is the exact German empty-state string", () => {
    expect(EMPTY_TEXT).toBe("Nichts gefunden.");
  });
});
