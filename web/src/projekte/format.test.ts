import { describe, expect, it } from "vitest";
import { dateText, deltaText } from "./format";

describe("deltaText", () => {
  it("reports a clean checkout when nothing has changed", () => {
    expect(deltaText(0, null, null)).toBe("sauber");
  });

  it("reports a clean checkout when ahead and behind are zero, not null", () => {
    expect(deltaText(0, 0, 0)).toBe("sauber");
  });

  it("joins changed and ahead, omitting a zero behind", () => {
    expect(deltaText(2, 1, 0)).toBe("2 geändert · 1 voraus");
  });

  it("reports behind on its own", () => {
    expect(deltaText(0, 0, 3)).toBe("3 zurück");
  });

  it("joins all three parts", () => {
    expect(deltaText(4, 2, 1)).toBe("4 geändert · 2 voraus · 1 zurück");
  });

  it("omits ahead and behind when they are null rather than zero", () => {
    expect(deltaText(1, null, null)).toBe("1 geändert");
  });
});

describe("dateText", () => {
  it("formats a timestamp in German medium style", () => {
    const ms = Date.UTC(2026, 7, 30);
    expect(dateText(ms)).toBe(
      new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(ms),
    );
  });

  it("shows a dash for an absent date", () => {
    expect(dateText(null)).toBe("—");
  });
});
