import { describe, expect, it, vi } from "vitest";
import { fetchCounts, type GhRunner } from "../../src/projekte/gh.js";

describe("fetchCounts", () => {
  it("parses the GraphQL body into issue and PR counts", async () => {
    const run: GhRunner = vi.fn(() =>
      Promise.resolve(
        JSON.stringify({
          data: {
            repository: {
              issues: { totalCount: 115 },
              pullRequests: { totalCount: 3 },
            },
          },
        }),
      ),
    );

    await expect(fetchCounts(run, "owner/repo")).resolves.toEqual({
      issues: 115,
      prs: 3,
    });
    expect(run).toHaveBeenCalledWith([
      "api",
      "graphql",
      "-f",
      expect.stringContaining("query($o:String!,$n:String!)") as unknown,
      "-F",
      "o=owner",
      "-F",
      "n=repo",
    ]);
  });

  it("returns null when the runner throws - offline, not logged in, gone", async () => {
    const run: GhRunner = vi.fn(() => Promise.reject(new Error("no auth")));
    await expect(fetchCounts(run, "owner/repo")).resolves.toBeNull();
  });

  it("returns null on junk JSON rather than throwing", async () => {
    const run: GhRunner = vi.fn(() => Promise.resolve("not json"));
    await expect(fetchCounts(run, "owner/repo")).resolves.toBeNull();
  });
});
