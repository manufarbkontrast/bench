import { simpleGit } from "simple-git";

export interface GitState {
  branch: string | null;
  remote: string | null;
  lastCommitAt: number | null;
  lastCommitSubject: string | null;
  dirty: number;
  ahead: number | null;
  behind: number | null;
}

export async function readGitState(dir: string): Promise<GitState> {
  const git = simpleGit(dir);
  const status = await git.status();
  const remotes = await git.getRemotes(true);
  const origin = remotes.find((r) => r.name === "origin") ?? remotes.at(0);
  let lastCommitAt: number | null = null;
  let lastCommitSubject: string | null = null;
  try {
    const latest = (await git.log({ maxCount: 1 })).latest;
    if (latest) {
      lastCommitAt = Date.parse(latest.date);
      lastCommitSubject = latest.message;
    }
  } catch {
    // an unborn HEAD (fresh init, no commit) has no log; every other field still reads
  }
  return {
    branch: status.current,
    remote: origin?.refs.fetch ?? null,
    dirty: status.files.length,
    ahead: status.tracking ? status.ahead : null,
    behind: status.tracking ? status.behind : null,
    lastCommitAt,
    lastCommitSubject,
  };
}
