import { describe, expect, it } from "vitest";
import { breakEvenText, dateText, runLineText } from "./format";

/** Matches the local ICU build's own rendering rather than a hardcoded string - see
    web/src/eingang/format.test.ts's dateText test for the same reasoning. */
function mediumDate(stichtag: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(`${stichtag}T00:00:00`),
  );
}

describe("dateText", () => {
  it("formats a stichtag as a de-DE medium date", () => {
    expect(dateText("2026-08-15")).toBe(mediumDate("2026-08-15"));
  });
});

describe("runLineText", () => {
  it("labels a zwischenstand run", () => {
    expect(
      runLineText({ stichtag: "2026-08-15", modus: "zwischenstand" }),
    ).toBe(`Zwischenstand vom ${mediumDate("2026-08-15")}`);
  });

  it("labels an abschluss run", () => {
    expect(runLineText({ stichtag: "2026-08-15", modus: "abschluss" })).toBe(
      `Abschluss vom ${mediumDate("2026-08-15")}`,
    );
  });
});

describe("breakEvenText", () => {
  it("reads a single keine-bullet as keine", () => {
    expect(breakEvenText(["keine"])).toBe("Kampagnen unter Break-even: keine");
  });

  it("counts two real bullets", () => {
    expect(
      breakEvenText([
        'Kampagne "Sommeraktion Nord" liegt unter dem Break-even.',
        'Kampagne "Winterschluss" liegt unter dem Break-even.',
      ]),
    ).toBe("Kampagnen unter Break-even: 2");
  });

  it("counts zero when the section is empty", () => {
    expect(breakEvenText([])).toBe("Kampagnen unter Break-even: 0");
  });
});
