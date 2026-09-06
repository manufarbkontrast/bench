import { describe, expect, it } from "vitest";
import {
  projektOf,
  splitNote,
  tagsOf,
  titleOf,
} from "../../src/vault/index/frontmatter.js";

describe("splitNote", () => {
  it("separates YAML frontmatter from the body", () => {
    const { frontmatter, body } = splitNote(
      "---\ntags: [a, b]\nupdated: 2026-08-01\n---\n\n# Hi\n",
    );
    expect(frontmatter.tags).toEqual(["a", "b"]);
    expect(String(frontmatter.updated)).toMatch(/^2026-08-01/);
    expect(body.trim()).toBe("# Hi");
  });

  it("returns an empty frontmatter when there is none", () => {
    expect(splitNote("# Only body\n")).toEqual({
      frontmatter: {},
      body: "# Only body\n",
    });
  });

  it("falls back to the whole file as body when the YAML inside a closed block is malformed", () => {
    const text = "---\ntitle: [unterminated\nfoo: bar\n---\n\nBody text.\n";
    expect(splitNote(text)).toEqual({ frontmatter: {}, body: text });
  });

  it("falls back to the whole file as body when the frontmatter fence never closes", () => {
    const text = "---\ntitle: Unclosed\nBody right after, no closing fence.\n";
    expect(splitNote(text)).toEqual({ frontmatter: {}, body: text });
  });
});

describe("titleOf", () => {
  it("is the file name without folders or extension", () => {
    expect(
      titleOf("30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md"),
    ).toBe("2026-08-01 Call Hafen");
  });
});

describe("tagsOf", () => {
  it("accepts a list, a string, and nothing", () => {
    expect(tagsOf({ tags: ["a", "#b", 3] })).toEqual(["a", "b"]);
    expect(tagsOf({ tags: "solo" })).toEqual(["solo"]);
    expect(tagsOf({})).toEqual([]);
  });
});

describe("projektOf", () => {
  it("keeps a slug of lowercase letters, digits and single hyphens", () => {
    expect(projektOf({ projekt: "bench" })).toBe("bench");
    expect(projektOf({ projekt: "shoesplease-klaviyo" })).toBe(
      "shoesplease-klaviyo",
    );
    expect(projektOf({ projekt: "q4-2026" })).toBe("q4-2026");
  });

  it("trims and lowercases before checking", () => {
    expect(projektOf({ projekt: "  Bench " })).toBe("bench");
  });

  it("is null for anything outside the alphabet", () => {
    for (const bad of [
      "Nicht Gültig!",
      "zwei worte",
      "-vorn",
      "hinten-",
      "doppel--strich",
      "ümlaut",
      "",
      "   ",
    ])
      expect(projektOf({ projekt: bad })).toBeNull();
  });

  it("is null when the key is absent or not a string", () => {
    expect(projektOf({})).toBeNull();
    expect(projektOf({ projekt: 42 })).toBeNull();
    expect(projektOf({ projekt: ["bench"] })).toBeNull();
  });
});
