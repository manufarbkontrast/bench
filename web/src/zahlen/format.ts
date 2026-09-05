/** German rendering for a controlling run: the run line and the break-even count - the same
    small local duplicate as web/src/eingang/format.ts's dateText, per app rather than shared. */
import type { RunFolder } from "./types";

/** `stichtag` is a bare `YYYY-MM-DD` with no time of day, so it is parsed at local midnight
    rather than through `new Date(stichtag)`, which reads a date-only ISO string as UTC and can
    print the previous day west of Greenwich. */
export function dateText(stichtag: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(`${stichtag}T00:00:00`),
  );
}

export function runLineText(
  run: Pick<RunFolder, "stichtag" | "modus">,
): string {
  return `${run.modus === "abschluss" ? "Abschluss" : "Zwischenstand"} vom ${dateText(run.stichtag)}`;
}

/** A `- keine ...` bullet is the campaigns skill's own wording for "none found" - see
    server/src/zahlen/summary.ts - so a single such bullet reads as "keine" rather than "1". */
export function breakEvenText(bullets: string[]): string {
  const count =
    bullets.length === 1 && bullets[0].startsWith("keine")
      ? "keine"
      : String(bullets.length);
  return `Kampagnen unter Break-even: ${count}`;
}
