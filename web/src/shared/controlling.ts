/** The controlling run's two headline texts, read by two documents: Zahlen shows the run, the
    Cockpit its last-run panel. Shared rather than copied because both lines encode rules that
    belong to the controlling skill, not to either app - the `keine` convention below above all,
    which would drift silently if one copy learnt a change the other did not. */

interface RunHeadline {
  stichtag: string;
  modus: "zwischenstand" | "abschluss";
}

/** `stichtag` is a bare `YYYY-MM-DD`; parsed at local midnight, since `new Date(stichtag)` reads a
    date-only ISO string as UTC and prints the previous day west of Greenwich. */
function stichtagText(stichtag: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(`${stichtag}T00:00:00`),
  );
}

export function runLineText(run: RunHeadline): string {
  return `${run.modus === "abschluss" ? "Abschluss" : "Zwischenstand"} vom ${stichtagText(run.stichtag)}`;
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
