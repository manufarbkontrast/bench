import { describe, expect, it } from "vitest";
import {
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
