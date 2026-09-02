import { describe, expect, it } from "vitest";
import { dateText, fileMetaText, sizeText } from "./format";
import type { InboxFile } from "./types";

describe("sizeText", () => {
  it("formats kilobytes with a German decimal comma", () => {
    expect(sizeText(2048)).toBe("2,0 KB");
  });

  it("formats megabytes once the size reaches one", () => {
    expect(sizeText(3 * 1024 * 1024)).toBe("3,0 MB");
  });
});

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

describe("fileMetaText", () => {
  it("joins the size and the date with a middle dot", () => {
    const file: InboxFile = {
      dir: "/plaud/inbox",
      name: "a.txt",
      size: 2048,
      mtime: Date.UTC(2026, 7, 30),
      kind: "text",
      status: "unverarbeitet",
    };
    expect(fileMetaText(file)).toBe(
      `${sizeText(file.size)} · ${dateText(file.mtime)}`,
    );
  });
});
