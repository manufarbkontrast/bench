import { describe, expect, it } from "vitest";
import {
  groupByBrand,
  groupByNote,
  targetNotes,
  viewDone,
  viewToday,
  viewUnassigned,
  viewWeek,
  type Task,
  type TreeEntry,
} from "./types";

const TODAY = "2026-09-01";

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
    brand: "nordlicht",
    ...overrides,
  };
}

describe("viewToday", () => {
  it("puts an overdue open task in Überfällig", () => {
    const overdue = task({ text: "overdue", due: "2026-08-20" });
    const view = viewToday([overdue], TODAY);
    expect(view.overdue).toEqual([overdue]);
    expect(view.dueToday).toEqual([]);
    expect(view.highPriority).toEqual([]);
  });

  it("puts a task due today in Heute fällig", () => {
    const dueToday = task({ text: "today", due: TODAY });
    const view = viewToday([dueToday], TODAY);
    expect(view.dueToday).toEqual([dueToday]);
    expect(view.overdue).toEqual([]);
  });

  it("puts an undated highest- or high-priority task in Hohe Priorität", () => {
    const highest = task({ text: "highest", due: null, priority: "highest" });
    const high = task({ text: "high", due: null, priority: "high" });
    const view = viewToday([highest, high], TODAY);
    expect(view.highPriority).toEqual([highest, high]);
  });

  it("does not count a medium-priority undated task as high priority", () => {
    const medium = task({ text: "medium", due: null, priority: "medium" });
    expect(viewToday([medium], TODAY).highPriority).toEqual([]);
  });

  it("does not count a high-priority task that also has a due date", () => {
    const dated = task({ text: "dated", due: TODAY, priority: "high" });
    const view = viewToday([dated], TODAY);
    expect(view.highPriority).toEqual([]);
    expect(view.dueToday).toEqual([dated]);
  });

  it("leaves out a task due in three days", () => {
    const later = task({ text: "later", due: "2026-09-04" });
    const view = viewToday([later], TODAY);
    expect(view.overdue).toEqual([]);
    expect(view.dueToday).toEqual([]);
    expect(view.highPriority).toEqual([]);
  });

  it("never places a done task in any of the three lists", () => {
    const done = task({
      text: "done",
      done: true,
      due: "2026-08-20",
      priority: "highest",
    });
    const view = viewToday([done], TODAY);
    expect(view.overdue).toEqual([]);
    expect(view.dueToday).toEqual([]);
    expect(view.highPriority).toEqual([]);
  });
});

describe("viewWeek", () => {
  it("includes due dates from today through six days out, sorted by due", () => {
    const in3 = task({ text: "in 3 days", due: "2026-09-04" });
    const tomorrow = task({ text: "tomorrow", due: "2026-09-02" });
    const in6 = task({ text: "in 6 days", due: "2026-09-07" });
    const result = viewWeek([in3, tomorrow, in6], TODAY);
    expect(result.map((t) => t.text)).toEqual([
      "tomorrow",
      "in 3 days",
      "in 6 days",
    ]);
  });

  it("includes a task due today", () => {
    const dueToday = task({ due: TODAY });
    expect(viewWeek([dueToday], TODAY)).toEqual([dueToday]);
  });

  it("excludes a task due in seven days", () => {
    const outside = task({ due: "2026-09-08" });
    expect(viewWeek([outside], TODAY)).toEqual([]);
  });

  it("excludes a task with no due date", () => {
    expect(viewWeek([task({ due: null })], TODAY)).toEqual([]);
  });

  it("excludes a done task even when its due date is within the window", () => {
    const done = task({ due: "2026-09-02", done: true });
    expect(viewWeek([done], TODAY)).toEqual([]);
  });
});

describe("groupByNote", () => {
  it("groups open tasks under their note's title", () => {
    const a1 = task({ path: "a.md", noteTitle: "A", text: "a1" });
    const a2 = task({ path: "a.md", noteTitle: "A", text: "a2" });
    const b1 = task({ path: "b.md", noteTitle: "B", text: "b1" });
    const groups = groupByNote([b1, a1, a2]);
    expect(groups.map((g) => g.label)).toEqual(["A", "B"]);
    expect(groups[0].tasks).toEqual([a1, a2]);
  });

  it("excludes done tasks", () => {
    const done = task({ done: true });
    expect(groupByNote([done])).toEqual([]);
  });
});

describe("groupByBrand", () => {
  it("sorts named brands alphabetically and puts Ohne Marke last", () => {
    const nordlicht = task({ brand: "nordlicht" });
    const anders = task({ brand: "anders" });
    const unbranded = task({ brand: null });
    const groups = groupByBrand([nordlicht, anders, unbranded]);
    expect(groups.map((g) => g.label)).toEqual([
      "anders",
      "nordlicht",
      "Ohne Marke",
    ]);
  });

  it("excludes done tasks", () => {
    const done = task({ brand: "nordlicht", done: true });
    expect(groupByBrand([done])).toEqual([]);
  });

  it("omits the Ohne Marke group entirely when every task has a brand", () => {
    const groups = groupByBrand([task({ brand: "nordlicht" })]);
    expect(groups.map((g) => g.label)).toEqual(["nordlicht"]);
  });
});

describe("viewUnassigned", () => {
  it("returns open tasks whose note has no brand", () => {
    const unbranded = task({ brand: null, text: "unbranded" });
    const branded = task({ brand: "nordlicht", text: "branded" });
    expect(viewUnassigned([unbranded, branded])).toEqual([unbranded]);
  });

  it("excludes a done task with no brand", () => {
    const done = task({ brand: null, done: true });
    expect(viewUnassigned([done])).toEqual([]);
  });
});

describe("viewDone", () => {
  it("includes only done tasks, sorted by doneAt descending", () => {
    const open = task({ done: false, text: "open" });
    const older = task({ done: true, doneAt: "2026-08-01", text: "older" });
    const newer = task({ done: true, doneAt: "2026-08-20", text: "newer" });
    expect(viewDone([open, older, newer])).toEqual([newer, older]);
  });

  it("sorts a task with no doneAt after ones that have it", () => {
    const dated = task({ done: true, doneAt: "2026-08-01", text: "dated" });
    const undated = task({ done: true, doneAt: null, text: "undated" });
    expect(viewDone([undated, dated])).toEqual([dated, undated]);
  });

  it("caps the result at 30", () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      task({
        done: true,
        doneAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
        line: i + 1,
      }),
    );
    expect(viewDone(many)).toHaveLength(30);
  });
});

describe("targetNotes", () => {
  function entry(overrides: Partial<TreeEntry> = {}): TreeEntry {
    return { path: "x.md", title: "X", folder: "", ...overrides };
  }

  it("keeps notes under 20_Brands and 30_Projekte only", () => {
    const brand = entry({ path: "20_Brands/Nordlicht.md", title: "Nordlicht" });
    const project = entry({
      path: "30_Projekte/Leuchtturm/Leuchtturm.md",
      title: "Leuchtturm",
    });
    const other = entry({ path: "60_Knowledge/Lessons.md", title: "Lessons" });
    expect(targetNotes([brand, project, other])).toEqual([brand, project]);
  });
});
