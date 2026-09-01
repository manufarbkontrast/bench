import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type GhRunner = (args: string[]) => Promise<string>;

const execFileAsync = promisify(execFile);

// A deliberate small duplicate of projekte/gh.ts's realGh - cross-app imports stay banned, and
// this is the whole of what either side needs from the CLI.
/** The real CLI. Routes depend on `GhRunner | "off"` instead, so a test never reaches this. */
export const realGh: GhRunner = async (args) => {
  const { stdout } = await execFileAsync("gh", args, { timeout: 15_000 });
  return stdout;
};

export interface Issue {
  number: number;
  title: string;
  url: string;
  labels: string[];
}

interface GhIssueJson {
  number: number;
  title: string;
  url: string;
  labels: { name: string }[];
}

/**
 * Null on any failure - offline, not logged in, the repo is gone, junk output - so a GitHub label
 * Bench cannot reach never fails the whole list.
 */
export async function fetchIssues(
  run: GhRunner,
  label: string,
): Promise<Issue[] | null> {
  try {
    const stdout = await run([
      "issue",
      "list",
      "-R",
      label,
      "--state",
      "open",
      "--json",
      "number,title,url,labels",
      "--limit",
      "200",
    ]);
    const parsed = JSON.parse(stdout) as GhIssueJson[];
    return parsed.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      labels: issue.labels.map((l) => l.name),
    }));
  } catch {
    return null;
  }
}
