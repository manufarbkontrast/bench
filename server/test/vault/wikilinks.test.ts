import { describe, expect, it } from "vitest";
import {
  extractWikilinks,
  stripCodeBlocks,
} from "../../src/vault/index/wikilinks.js";

describe("extractWikilinks", () => {
  it("reads target, heading and alias in every combination", () => {
    expect(
      extractWikilinks("[[A]] [[B|b]] [[C#H]] [[D#H|d]] ![[e.png]]"),
    ).toEqual([
      { target: "A", heading: null, alias: null, embed: false },
      { target: "B", heading: null, alias: "b", embed: false },
      { target: "C", heading: "H", alias: null, embed: false },
      { target: "D", heading: "H", alias: "d", embed: false },
      { target: "e.png", heading: null, alias: null, embed: true },
    ]);
  });

  it("ignores links inside fenced code blocks and inline code", () => {
    const body = "Real [[A]]\n```js\n[[NotOne]]\n```\nand `[[NotEither]]` here";
    expect(extractWikilinks(body).map((l) => l.target)).toEqual(["A"]);
  });
});

describe("stripCodeBlocks", () => {
  it("keeps the line count so line numbers stay true", () => {
    const body = "a\n```\nb\nc\n```\nd";
    expect(stripCodeBlocks(body).split("\n")).toEqual([
      "a",
      "",
      "",
      "",
      "",
      "d",
    ]);
  });
});
