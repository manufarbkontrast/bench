/** German rendering for kontext. dateText is the same small local duplicate as
    web/src/eingang/format.ts's own - an epoch-ms mtime formatted de-DE medium - kept per-app
    rather than shared, per PROJECT.md's app boundary. noteHref is the same per-app duplicate
    aufgaben's and projekte's format.ts already carry. EMPTY_TEXT is the one "nothing to show"
    string every tab and sub-section in this app renders verbatim. */

export const EMPTY_TEXT = "Nichts gefunden.";

export function dateText(mtime: number): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(mtime),
  );
}

export function noteHref(path: string): string {
  return `/vault/n/${path.split("/").map(encodeURIComponent).join("/")}`;
}
