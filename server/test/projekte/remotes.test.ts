import { describe, expect, it } from "vitest";
import {
  githubLabel,
  groupKey,
  normalizeRemote,
} from "../../src/projekte/remotes.js";

describe("normalizeRemote", () => {
  it.each([
    ["git@github.com:Owner/Repo.git", "github.com/owner/repo"], // allow-secret: git remote fixture, not a real address
    ["https://github.com/owner/repo", "github.com/owner/repo"],
    ["ssh://git@github.com/Owner/Repo/", "github.com/owner/repo"], // allow-secret: git remote fixture, not a real address
    ["https://gitlab.com/a/b.git", "gitlab.com/a/b"],
    [
      "/Users/someone/origins/leuchtfeuer.git",
      "/users/someone/origins/leuchtfeuer",
    ],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeRemote(raw)).toBe(expected);
  });
});

describe("githubLabel", () => {
  it("labels only GitHub remotes", () => {
    expect(githubLabel("github.com/owner/repo")).toBe("owner/repo");
    expect(githubLabel("gitlab.com/a/b")).toBeNull();
  });
});

describe("groupKey", () => {
  it("falls back to the lowercased basename for remoteless repos", () => {
    expect(groupKey(null, "/roots/Werkstatt/Treibgut")).toBe("name:treibgut");
    expect(groupKey("github.com/o/r", "/x")).toBe("github.com/o/r");
  });
});
