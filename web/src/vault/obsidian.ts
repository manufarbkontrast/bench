/** Obsidian's own URI scheme opens the note in the app; the file is named without .md. */
export function obsidianUrl(vault: string, path: string): string {
  const file = path.replace(/\.md$/, "");
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}
