import { describe, expect, it } from "vitest";
import { extractTasks, parseTaskLine } from "../../src/vault/index/tasks.js";

describe("parseTaskLine", () => {
  it("reads every emoji field", () => {
    expect(
      parseTaskLine(
        "- [ ] Prototyp bauen ⏫ ⏳ 2026-08-18 🛫 2026-08-10 📅 2026-08-25 🔁 every week",
      ),
    ).toEqual({
      raw: "- [ ] Prototyp bauen ⏫ ⏳ 2026-08-18 🛫 2026-08-10 📅 2026-08-25 🔁 every week",
      text: "Prototyp bauen",
      done: false,
      due: "2026-08-25",
      scheduled: "2026-08-18",
      start: "2026-08-10",
      priority: "high",
      recurrence: "every week",
      doneAt: null,
    });
  });

  it("reads a done task with its completion date", () => {
    const t = parseTaskLine("  - [x] Kickoff halten ✅ 2026-08-02")!;
    expect(t.done).toBe(true);
    expect(t.doneAt).toBe("2026-08-02");
    expect(t.text).toBe("Kickoff halten");
  });

  it("maps all five priorities", () => {
    const p = (s: string) => parseTaskLine(`- [ ] x ${s}`)!.priority;
    expect([p("🔺"), p("⏫"), p("🔼"), p("🔽"), p("⏬")]).toEqual([
      "highest",
      "high",
      "medium",
      "low",
      "lowest",
    ]);
    expect(parseTaskLine("- [ ] x")!.priority).toBeNull();
  });

  it("keeps wikilinks and parentheses in the text", () => {
    expect(
      parseTaskLine("- [ ] Rückfrage klären (aus [[Call]]) 🔽")!.text,
    ).toBe("Rückfrage klären (aus [[Call]])");
  });

  it("returns null for anything that is not a task line", () => {
    expect(parseTaskLine("- not a task")).toBeNull();
    expect(parseTaskLine("[ ] no bullet")).toBeNull();
    expect(parseTaskLine("- [?] odd state")).toBeNull();
  });
});

describe("extractTasks", () => {
  it("numbers lines from 1 and skips fenced code", () => {
    const body =
      "intro\n- [ ] one\n```\n- [ ] not\n```\n- [x] two ✅ 2026-01-02";
    expect(extractTasks(body).map((t) => [t.line, t.text, t.done])).toEqual([
      [2, "one", false],
      [6, "two", true],
    ]);
  });
});
