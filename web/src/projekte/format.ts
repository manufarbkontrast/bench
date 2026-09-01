/** German summaries for a scanned project row: change counts and dates. */

export function deltaText(
  dirty: number,
  ahead: number | null,
  behind: number | null,
): string {
  const parts = [
    dirty > 0 ? `${dirty} geändert` : null,
    ahead !== null && ahead > 0 ? `${ahead} voraus` : null,
    behind !== null && behind > 0 ? `${behind} zurück` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "sauber";
}

export function dateText(ms: number | null): string {
  if (ms === null) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(ms);
}
