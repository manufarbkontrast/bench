/**
 * Parses a controlling run's zusammenfassung.md - a hand-rolled line scan in the style of
 * aufgaben/plaud.ts's table reader, not a markdown library: the shape this file always has (one
 * title, one KPI table, one bullet section) is small and fixed enough that a scanner is both
 * correct and dependency-free, and it never throws on a folder whose report is still partial.
 */

export interface Kpi {
  kennzahl: string;
  vergleich: string;
  aktuell: string;
  veraenderung: string;
}

export interface ParsedSummary {
  title: string;
  kpis: Kpi[];
  breakEven: string[];
}

/** A pipe-delimited row's cells, trimmed, with the empty leading/trailing split dropped. */
function tableCells(line: string): string[] {
  const cells = line.split("|").map((cell) => cell.trim());
  const start = cells[0] === "" ? 1 : 0;
  const end = cells[cells.length - 1] === "" ? cells.length - 1 : cells.length;
  return cells.slice(start, end);
}

const SEPARATOR_CELL = /^:?-+:?$/;

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

/**
 * The first pipe-table starting after `titleIndex` - header and the `|---|` separator are both
 * skipped, and a row with fewer than four cells is dropped rather than padded, since a truncated
 * row has no reliable Veränderung to show. The table ends at the first line that does not start
 * with `|`, so a blank line or the next section closes it.
 */
function parseKpiTable(lines: string[], titleIndex: number): Kpi[] {
  const tableStart = lines.findIndex(
    (line, index) => index > titleIndex && line.startsWith("|"),
  );
  if (tableStart === -1) return [];
  const kpis: Kpi[] = [];
  let sawHeader = false;
  for (let i = tableStart; i < lines.length && lines[i].startsWith("|"); i++) {
    const cells = tableCells(lines[i]);
    if (isSeparatorRow(cells)) continue;
    if (!sawHeader) {
      sawHeader = true;
      continue;
    }
    if (cells.length < 4) continue;
    const [kennzahl, vergleich, aktuell, veraenderung] = cells;
    kpis.push({ kennzahl, vergleich, aktuell, veraenderung });
  }
  return kpis;
}

/** The lines strictly between an exact `## <name>` heading and the next `## ` heading, or []. */
function sectionLines(lines: string[], name: string): string[] {
  const heading = `## ${name}`;
  const start = lines.indexOf(heading);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

function bullets(lines: string[]): string[] {
  return lines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

/**
 * `- keine ...` is returned as a literal bullet like any other - it is the campaigns skill's own
 * wording for "none found", and deciding that it means zero real campaigns is a UI concern, not
 * this parser's.
 */
export function parseSummary(md: string): ParsedSummary {
  const lines = md.split("\n");
  const titleIndex = lines.findIndex((line) => line.startsWith("# "));
  const title = titleIndex === -1 ? "" : lines[titleIndex].slice(2).trim();
  return {
    title,
    kpis: parseKpiTable(lines, titleIndex),
    breakEven: bullets(sectionLines(lines, "Kampagnen unter Break-even")),
  };
}
