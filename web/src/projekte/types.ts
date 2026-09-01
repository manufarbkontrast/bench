export interface Project {
  path: string;
  name: string;
  kind: "git" | "folder";
  remote: string | null;
  remoteLabel: string | null;
  branch: string | null;
  lastCommitAt: number | null;
  lastCommitSubject: string | null;
  /** SQLite's 0 or 1, not a boolean - see server/src/projekte/db.ts's ProjectRow. */
  dirty: number;
  ahead: number | null;
  behind: number | null;
  notePath: string | null;
  brand: string | null;
  status: string | null;
  issues: number | null;
  prs: number | null;
  groupKey: string;
  scannedAt: number;
  isDuplicate: boolean;
  sameName: boolean;
}

export interface ScanSummary {
  projects: number;
  repos: number;
  folders: number;
  duplicates: number;
  ms: number;
}

export interface ListReply {
  scannedAt: number | null;
  summary: ScanSummary | null;
  projects: Project[];
}
