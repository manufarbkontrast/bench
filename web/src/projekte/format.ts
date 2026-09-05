/** German summaries for a scanned project row: change counts, dates and vault note links. */

export const EM_DASH = "—";

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
  if (ms === null) return EM_DASH;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(ms);
}

/** A note's link text is its basename without the .md extension - the same convention as
    web/src/vault/obsidian.ts's file names, applied here to a note a project points at rather
    than the note being viewed. */
export function noteTitle(notePath: string): string {
  const base = notePath.split("/").pop() ?? notePath;
  return base.replace(/\.md$/, "");
}

export function noteHref(notePath: string): string {
  return `/vault/n/${notePath.split("/").map(encodeURIComponent).join("/")}`;
}
