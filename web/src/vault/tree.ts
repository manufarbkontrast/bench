import type { TreeEntry } from "./types";

export interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  notes: TreeEntry[];
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "de");
const byTitle = (a: TreeEntry, b: TreeEntry) =>
  a.title.localeCompare(b.title, "de");

function build(entries: TreeEntry[], prefix: string, name: string): FolderNode {
  const here = entries.filter((e) => e.folder === prefix);
  const childNames = [
    ...new Set(
      entries
        .filter(
          (e) =>
            e.folder !== prefix &&
            (prefix === "" || e.folder.startsWith(`${prefix}/`)),
        )
        .map(
          (e) =>
            e.folder.slice(prefix === "" ? 0 : prefix.length + 1).split("/")[0],
        ),
    ),
  ];
  const folders = childNames
    .map((child) =>
      build(entries, prefix === "" ? child : `${prefix}/${child}`, child),
    )
    .sort(byName);
  return { name, path: prefix, folders, notes: [...here].sort(byTitle) };
}

/** The folder tree the flat list implies; the root's name is empty. */
export function buildTree(entries: TreeEntry[]): FolderNode {
  return build(entries, "", "");
}

/** The route for a note: every segment URI-encoded, so spaces and umlauts survive. */
export function noteUrl(path: string): string {
  return `/n/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Folder paths from the top down to the note's own folder. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Where a visit begins: a note called Start, else the first note. */
export function startNote(entries: TreeEntry[]): TreeEntry | undefined {
  return entries.find((e) => e.title === "Start") ?? entries[0];
}
