export interface Project {
  path: string;
  name: string;
  kind: "git" | "folder";
  remote: string | null;
  remoteLabel: string | null;
  branch: string | null;
  lastCommitAt: number | null;
  lastCommitSubject: string | null;
  /** The count of dirty entries from `git status`, not a boolean - see server/src/projekte/db.ts's ProjectRow. */
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

/** GET /api/projekte/project's shape: a row as scanned, without the list's derived duplicate
    flags - those describe a row's place in the whole list, not the row on its own. */
export type ProjectDetail = Omit<Project, "isDuplicate" | "sameName">;

export interface ProjectDetailReply {
  project: ProjectDetail;
  duplicates: ProjectDetail[];
}

/** GET /api/projekte/stand's shape - mirrors server/src/projekte/stand.ts's ProjektStand and
    StandReply, with repos and ohneProjekt as this side's ProjectDetail rather than the server's
    ProjectRow. */
interface StandSignals {
  veraltet: boolean;
  dirtyRepos: number;
  offeneTasks: number;
  plaudNotizen: number;
}

export interface ProjektStand {
  slug: string;
  title: string;
  notePath: string;
  updated: string | null;
  zustand: string;
  repos: ProjectDetail[];
  missingRepos: string[];
  signals: StandSignals;
}

export interface StandReply {
  projekte: ProjektStand[];
  ohneProjekt: ProjectDetail[];
  warnings: string[];
}
