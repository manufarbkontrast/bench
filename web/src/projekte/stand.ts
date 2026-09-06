/** Age and freshness helpers for a handoff's `Stand` card, and the German hints its badges show. */

import type { ProjektStand } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two YYYY-MM-DD strings, today minus updated; null without a date. Both
    sides go through Date.UTC of their parsed parts, so a viewer's own offset never enters it -
    the same trick server/src/projekte/stand.ts's localDay uses in the other direction. */
export function ageDays(updated: string | null, today: string): number | null {
  if (updated === null) return null;
  const [uy, um, ud] = updated.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(uy, um - 1, ud)) / DAY_MS,
  );
}

export function ageText(days: number | null): string {
  if (days === null) return "Datum fehlt";
  if (days === 0) return "heute";
  if (days === 1) return "vor 1 Tag";
  return `vor ${String(days)} Tagen`;
}

/** de-DE medium date of a YYYY-MM-DD string, built from local date parts rather than parsed as
    a string - `new Date("2026-08-01")` is UTC midnight and shifts a day west of Greenwich. */
export function dayText(updated: string): string {
  const [y, m, d] = updated.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(y, m - 1, d),
  );
}

/** The badges a Stand card shows, in a fixed order: staleness, then dirty repos, then open
    tasks, then Plaud notes since the handoff, then one line per repo the handoff names but the
    scan never found. */
export function standHints(p: ProjektStand): string[] {
  const hints: string[] = [];
  if (p.signals.veraltet) hints.push("Stand veraltet");
  if (p.signals.dirtyRepos === 1) hints.push("1 Repo ungesichert");
  else if (p.signals.dirtyRepos > 1)
    hints.push(`${String(p.signals.dirtyRepos)} Repos ungesichert`);
  if (p.signals.offeneTasks === 1) hints.push("1 offene Aufgabe");
  else if (p.signals.offeneTasks > 1)
    hints.push(`${String(p.signals.offeneTasks)} offene Aufgaben`);
  if (p.signals.plaudNotizen === 1) hints.push("1 Plaud-Notiz seit Handoff");
  else if (p.signals.plaudNotizen > 1)
    hints.push(`${String(p.signals.plaudNotizen)} Plaud-Notizen seit Handoff`);
  for (const name of p.missingRepos) hints.push(`Repo nicht gefunden: ${name}`);
  return hints;
}
