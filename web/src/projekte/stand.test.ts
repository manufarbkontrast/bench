import { describe, expect, it } from "vitest";
import { ageDays, ageText, dayText, standHints } from "./stand";
import type { ProjektStand } from "./types";

describe("ageDays", () => {
  it("counts whole days between two calendar dates", () => {
    expect(ageDays("2026-09-01", "2026-09-05")).toBe(4);
  });

  it("is null without an updated date", () => {
    expect(ageDays(null, "2026-09-05")).toBeNull();
  });
});

describe("ageText", () => {
  it("shows Datum fehlt without a day count", () => {
    expect(ageText(null)).toBe("Datum fehlt");
  });

  it("shows heute for zero days", () => {
    expect(ageText(0)).toBe("heute");
  });

  it("keeps the singular for one day", () => {
    expect(ageText(1)).toBe("vor 1 Tag");
  });

  it("pluralises above one day", () => {
    expect(ageText(5)).toBe("vor 5 Tagen");
  });
});

describe("dayText", () => {
  it("formats a YYYY-MM-DD string in German medium style, from local date parts", () => {
    expect(dayText("2026-08-01")).toBe(
      new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
        new Date(2026, 7, 1),
      ),
    );
  });
});

function stand(overrides: Partial<ProjektStand> = {}): ProjektStand {
  return {
    slug: "a",
    title: "A",
    notePath: "50_Workflow/Handoffs/Handoff_a.md",
    updated: "2026-08-01",
    zustand: "",
    repos: [],
    missingRepos: [],
    signals: {
      veraltet: false,
      dirtyRepos: 0,
      offeneTasks: 0,
      plaudNotizen: 0,
    },
    ...overrides,
  };
}

describe("standHints", () => {
  it("is empty for a quiet project", () => {
    expect(standHints(stand())).toEqual([]);
  });

  it("flags a stale handoff", () => {
    expect(
      standHints(
        stand({
          signals: {
            veraltet: true,
            dirtyRepos: 0,
            offeneTasks: 0,
            plaudNotizen: 0,
          },
        }),
      ),
    ).toEqual(["Stand veraltet"]);
  });

  it("keeps the singular for one dirty repo, pluralises above one", () => {
    expect(
      standHints(
        stand({
          signals: {
            veraltet: false,
            dirtyRepos: 1,
            offeneTasks: 0,
            plaudNotizen: 0,
          },
        }),
      ),
    ).toEqual(["1 Repo ungesichert"]);
    expect(
      standHints(
        stand({
          signals: {
            veraltet: false,
            dirtyRepos: 3,
            offeneTasks: 0,
            plaudNotizen: 0,
          },
        }),
      ),
    ).toEqual(["3 Repos ungesichert"]);
  });

  it("keeps the singular for one open task, pluralises above one", () => {
    expect(
      standHints(
        stand({
          signals: {
            veraltet: false,
            dirtyRepos: 0,
            offeneTasks: 1,
            plaudNotizen: 0,
          },
        }),
      ),
    ).toEqual(["1 offene Aufgabe"]);
    expect(
      standHints(
        stand({
          signals: {
            veraltet: false,
            dirtyRepos: 0,
            offeneTasks: 2,
            plaudNotizen: 0,
          },
        }),
      ),
    ).toEqual(["2 offene Aufgaben"]);
  });

  it("keeps the singular for one Plaud note, pluralises above one", () => {
    expect(
      standHints(
        stand({
          signals: {
            veraltet: false,
            dirtyRepos: 0,
            offeneTasks: 0,
            plaudNotizen: 1,
          },
        }),
      ),
    ).toEqual(["1 Plaud-Notiz seit Handoff"]);
    expect(
      standHints(
        stand({
          signals: {
            veraltet: false,
            dirtyRepos: 0,
            offeneTasks: 0,
            plaudNotizen: 3,
          },
        }),
      ),
    ).toEqual(["3 Plaud-Notizen seit Handoff"]);
  });

  it("lists one line per missing repo, after the other hints", () => {
    expect(
      standHints(
        stand({
          signals: {
            veraltet: true,
            dirtyRepos: 0,
            offeneTasks: 0,
            plaudNotizen: 0,
          },
          missingRepos: ["repo-a", "repo-b"],
        }),
      ),
    ).toEqual([
      "Stand veraltet",
      "Repo nicht gefunden: repo-a",
      "Repo nicht gefunden: repo-b",
    ]);
  });

  it("orders all hints together: stale, dirty, tasks, plaud notes, missing repos", () => {
    expect(
      standHints(
        stand({
          signals: {
            veraltet: true,
            dirtyRepos: 1,
            offeneTasks: 2,
            plaudNotizen: 1,
          },
          missingRepos: ["x"],
        }),
      ),
    ).toEqual([
      "Stand veraltet",
      "1 Repo ungesichert",
      "2 offene Aufgaben",
      "1 Plaud-Notiz seit Handoff",
      "Repo nicht gefunden: x",
    ]);
  });
});
