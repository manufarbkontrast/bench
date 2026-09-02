/** German summaries for an inbox file: size in KB/MB and the medium date - Aufgaben's format.ts
    duplicated deliberately rather than imported, per PROJECT.md's per-app boundary. */
import type { InboxFile } from "./types";

const KB = 1024;
const MB = KB * 1024;

const NUMBER = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function sizeText(bytes: number): string {
  if (bytes >= MB) return `${NUMBER.format(bytes / MB)} MB`;
  return `${NUMBER.format(bytes / KB)} KB`;
}

export function dateText(mtime: number): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(mtime),
  );
}

/** The muted meta line under a file's name: size and mtime, joined the way Aufgaben's metaText
    joins a task's dates. */
export function fileMetaText(file: InboxFile): string {
  return `${sizeText(file.size)} · ${dateText(file.mtime)}`;
}
