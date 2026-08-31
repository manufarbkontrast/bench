import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type GhRunner = (args: string[]) => Promise<string>;

const execFileAsync = promisify(execFile);

/** The real CLI. Routes depend on `GhRunner | "off"` instead, so a test never reaches this. */
export const realGh: GhRunner = async (args) => {
  const { stdout } = await execFileAsync("gh", args, { timeout: 15_000 });
  return stdout;
};

const QUERY =
  "query($o:String!,$n:String!){repository(owner:$o,name:$n){issues(states:OPEN){totalCount}pullRequests(states:OPEN){totalCount}}}";

interface GraphqlResponse {
  data: {
    repository: {
      issues: { totalCount: number };
      pullRequests: { totalCount: number };
    };
  };
}

/**
 * Null on any failure - offline, not logged in, the repo is gone, junk output - so a GitHub label
 * Bench cannot reach never fails a scan.
 */
export async function fetchCounts(
  run: GhRunner,
  label: string,
): Promise<{ issues: number; prs: number } | null> {
  const slash = label.indexOf("/");
  const owner = label.slice(0, slash);
  const name = label.slice(slash + 1);
  try {
    const stdout = await run([
      "api",
      "graphql",
      "-f",
      `query=${QUERY}`,
      "-F",
      `o=${owner}`,
      "-F",
      `n=${name}`,
    ]);
    const parsed = JSON.parse(stdout) as GraphqlResponse;
    return {
      issues: parsed.data.repository.issues.totalCount,
      prs: parsed.data.repository.pullRequests.totalCount,
    };
  } catch {
    return null;
  }
}
