/** The seven read-only kontext replies, mirroring server/src/kontext/{readers,skills}.ts's own
    exported shapes - this app never writes, so no request body types are needed. */

export interface VaultNote {
  path: string;
  title: string;
  body: string;
}

export interface ClaudeFile {
  name: string;
  body: string;
  mtime: number;
}

export interface MemoryProject {
  dir: string;
  notes: ClaudeFile[];
}

interface RepoFile {
  name: "CLAUDE.md" | "AGENTS.md";
  body: string;
}

export interface Repo {
  name: string;
  files: RepoFile[];
}

export interface Skill {
  name: string;
  description: string;
}

export interface ProfilReply {
  notes: VaultNote[];
}

export interface RegelnReply {
  claude: ClaudeFile[];
  vault: VaultNote[];
}

export interface StandReply {
  note: VaultNote | null;
}

export interface MemoryReply {
  projects: MemoryProject[];
}

export interface ReposReply {
  repos: Repo[];
}

export interface SkillsReply {
  count: number;
  skills: Skill[];
}

export interface McpReply {
  servers: string[];
}
