import { describe, expect, it, vi } from "vitest";
import { fetchIssues, type GhRunner } from "../../src/aufgaben/gh.js";

describe("fetchIssues", () => {
  it("parses issue JSON into Issue objects", async () => {
    const run: GhRunner = vi.fn(() =>
      Promise.resolve(
        JSON.stringify([
          {
            number: 42,
            title: "Fix the thing",
            url: "https://github.com/example/repo/issues/42",
            labels: [{ name: "bug" }, { name: "priority" }],
          },
        ]),
      ),
    );

    await expect(fetchIssues(run, "example/repo")).resolves.toEqual([
      {
        number: 42,
        title: "Fix the thing",
        url: "https://github.com/example/repo/issues/42",
        labels: ["bug", "priority"],
      },
    ]);
    expect(run).toHaveBeenCalledWith([
      "issue",
      "list",
      "-R",
      "example/repo",
      "--state",
      "open",
      "--json",
      "number,title,url,labels",
      "--limit",
      "200",
    ]);
  });

  it("returns null when the runner throws - offline, not logged in, gone", async () => {
    const run: GhRunner = vi.fn(() => Promise.reject(new Error("no auth")));
    await expect(fetchIssues(run, "example/repo")).resolves.toBeNull();
  });

  it("returns null on junk JSON rather than throwing", async () => {
    const run: GhRunner = vi.fn(() => Promise.resolve("not json"));
    await expect(fetchIssues(run, "example/repo")).resolves.toBeNull();
  });

  it("returns null when the JSON parses but is not an issue array", async () => {
    const run: GhRunner = vi.fn(() => Promise.resolve("{}"));
    await expect(fetchIssues(run, "example/repo")).resolves.toBeNull();
  });
});
