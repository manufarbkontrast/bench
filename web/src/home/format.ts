/** German date and delta-line formatting, in miniature - duplicated from web/src/aufgaben/format.ts
    and web/src/projekte/format.ts rather than imported, since this document may not import from
    a sibling app. */

const EM_DASH = "—";

export function dateText(date: string | null): string {
  if (date === null) return EM_DASH;
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(y, m - 1, d),
  );
}

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
