import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSummary } from "../../src/zahlen/summary.js";

const FULL_SUMMARY = readFileSync(
  fileURLToPath(
    new URL(
      "../../src/eingang/fixture/controlling/2026-08-15-zwischenstand/zusammenfassung.md",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("parseSummary", () => {
  it("pins the fixture zusammenfassung's title, KPI rows and break-even bullet", () => {
    const result = parseSummary(FULL_SUMMARY);

    expect(result.title).toBe("Zwischenstand 15.08.2026");
    expect(result.kpis).toEqual([
      {
        kennzahl: "Umsatz gesamt",
        vergleich: "51.200 €",
        aktuell: "54.300 €",
        veraenderung: "+6,1 %",
      },
      {
        kennzahl: "Google-ROAS",
        vergleich: "3,8",
        aktuell: "4,2",
        veraenderung: "+0,4",
      },
    ]);
    expect(result.breakEven).toEqual([
      'Kampagne "Sommeraktion Nord" liegt seit zwei Wochen unter dem Break-even.',
    ]);
  });

  it("returns a keine-bullet as a literal bullet - the UI decides what it means", () => {
    const md = [
      "# Bericht",
      "",
      "## Kampagnen unter Break-even",
      "",
      "- keine",
    ].join("\n");

    expect(parseSummary(md).breakEven).toEqual(["keine"]);
  });

  it("returns an empty kpis array when there is no table", () => {
    const md = "# Bericht\n\nKein Umsatz heute.\n";

    expect(parseSummary(md).kpis).toEqual([]);
  });

  it("returns an empty breakEven array when the section is missing", () => {
    const md =
      "# Bericht\n\n| A | B | C | D |\n| - | - | - | - |\n| a | b | c | d |\n";

    expect(parseSummary(md).breakEven).toEqual([]);
  });

  it("skips a table row with fewer than four cells", () => {
    const md = [
      "# Bericht",
      "",
      "| Kennzahl | Vergleich | Aktuell | Veränderung |",
      "| - | - | - | - |",
      "| Zu kurz | nur drei |",
      "| Voll | 1 | 2 | 3 |",
    ].join("\n");

    expect(parseSummary(md).kpis).toEqual([
      { kennzahl: "Voll", vergleich: "1", aktuell: "2", veraenderung: "3" },
    ]);
  });

  it("never throws on garbage input", () => {
    expect(() => parseSummary("")).not.toThrow();
    expect(parseSummary("").title).toBe("");
    expect(parseSummary("\n\n\n")).toEqual({
      title: "",
      kpis: [],
      breakEven: [],
    });
  });
});
