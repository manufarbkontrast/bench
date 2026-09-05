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

  // The two shapes realGh's execFileAsync actually produces (measured against the real
  // execFile, not guessed): ENOENT when gh is absent from PATH, and a nonzero exit with
  // stderr when gh runs but the network call inside it fails. fetchCounts's catch is
  // unconditional, so both collapse to null the same way the generic-Error case above does -
  // these two pin that the specific shapes a dead network or a missing binary produce are
  // included, not just an idealised Error.
  it("returns null on the ENOENT shape a missing gh binary throws", async () => {
    const enoent = Object.assign(new Error("spawn gh ENOENT"), {
      code: "ENOENT",
    });
    const run: GhRunner = vi.fn(() => Promise.reject(enoent));
    await expect(fetchCounts(run, "owner/repo")).resolves.toBeNull();
  });

  it("returns null on the nonzero-exit-with-stderr shape a network failure throws", async () => {
    const networkError = Object.assign(new Error("Command failed: gh"), {
      code: 1,
      stderr: "gh: connection error, could not resolve api.github.com\n",
    });
    const run: GhRunner = vi.fn(() => Promise.reject(networkError));
    await expect(fetchCounts(run, "owner/repo")).resolves.toBeNull();
  });

  it("returns null on junk JSON rather than throwing", async () => {
    const run: GhRunner = vi.fn(() => Promise.resolve("not json"));
    await expect(fetchCounts(run, "owner/repo")).resolves.toBeNull();
  });
});
