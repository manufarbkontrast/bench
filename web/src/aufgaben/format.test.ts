import { describe, expect, it } from "vitest";
import { dateText, metaText, noteHref, priorityText } from "./format";
import type { Task } from "./types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    line: 1,
    raw: "- [ ] x",
    text: "x",
    done: false,
    due: null,
    scheduled: null,
    start: null,
    priority: null,
    recurrence: null,
    doneAt: null,
    noteTitle: "Leuchtturm",
    brand: null,
    ...overrides,
  };
}

describe("dateText", () => {
  it("formats a YYYY-MM-DD string in German medium style", () => {
    expect(dateText("2026-08-30")).toBe(
      new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
        new Date(2026, 7, 30),
      ),
    );
  });

  it("shows an em dash for an absent date", () => {
    expect(dateText(null)).toBe("—");
  });
});

describe("priorityText", () => {
  it("labels every priority in German", () => {
    expect(priorityText("highest")).toBe("Höchste");
    expect(priorityText("high")).toBe("Hoch");
    expect(priorityText("medium")).toBe("Mittel");
    expect(priorityText("low")).toBe("Niedrig");
    expect(priorityText("lowest")).toBe("Niedrigste");
  });
});

describe("noteHref", () => {
  it("links to the vault note, encoding each path segment", () => {
    expect(noteHref("30_Projekte/Leuchtturm/Leuchtturm.md")).toBe(
      "/vault/n/30_Projekte/Leuchtturm/Leuchtturm.md",
    );
  });

  it("encodes a space in a folder or file name", () => {
    expect(noteHref("30_Projekte/Ein Ordner/Datei.md")).toBe(
      "/vault/n/30_Projekte/Ein%20Ordner/Datei.md",
    );
  });
});

describe("metaText", () => {
  it("joins due, scheduled, priority and recurrence when all are present", () => {
    const t = task({
      due: "2026-09-05",
      scheduled: "2026-09-02",
      priority: "high",
      recurrence: "every week",
    });
    expect(metaText(t)).toBe(
      `Fällig ${dateText("2026-09-05")} · Geplant ${dateText("2026-09-02")} · Hoch · Wiederholung: every week`,
    );
  });

  it("returns null when nothing applies", () => {
    expect(metaText(task())).toBeNull();
  });

  it("includes only the due date when nothing else is set", () => {
    expect(metaText(task({ due: "2026-09-05" }))).toBe(
      `Fällig ${dateText("2026-09-05")}`,
    );
  });
});
