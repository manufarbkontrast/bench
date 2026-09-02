export interface InboxFile {
  dir: string;
  name: string;
  size: number;
  mtime: number;
  kind: "text" | "audio";
  status: "unverarbeitet" | "in_arbeit" | "notiz_vorhanden";
}

export type EingangJobKind = "plaud-sync" | "plaud-process";

function dirBasename(dir: string): string {
  const parts = dir.split(/[/\\]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? "";
}

/** Only a file the server's plaud-process fence can reach gets a working button: it demands a
    bare filename that resolves under <plaudHome>/inbox (server/src/eingang/jobs.ts
    planPlaudProcess), so a file elsewhere - already reconciled, or sitting in a second watch dir -
    needs Einsammeln first, which is what actually moves a file into that folder. */
export function isProcessable(file: InboxFile): boolean {
  return (
    file.kind === "text" &&
    file.status === "unverarbeitet" &&
    dirBasename(file.dir) === "inbox"
  );
}
