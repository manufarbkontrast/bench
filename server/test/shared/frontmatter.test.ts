import { describe, expect, it } from "vitest";
import { scanFrontmatter } from "../../src/shared/frontmatter.js";

describe("scanFrontmatter", () => {
  it("reads each key up to its first ': ', keeping a value's own ': ' verbatim", () => {
    const { fields, body } = scanFrontmatter(
      "---\ntitel: 08-18 Besprechung: Q4\naufnahme: abc-1\n---\n# x\n",
    );
    expect(fields.get("titel")).toBe("08-18 Besprechung: Q4");
    expect(fields.get("aufnahme")).toBe("abc-1");
    expect(body).toBe("# x\n");
  });

  it("trims the value and ignores a line without ': '", () => {
    const { fields } = scanFrontmatter(
      "---\nprojekt: Bench \ntags: [a, b]\nkein trenner\n---\n",
    );
    expect(fields.get("projekt")).toBe("Bench");
    expect(fields.get("tags")).toBe("[a, b]");
    expect(fields.size).toBe(2);
  });

  it("keeps the first occurrence of a repeated key", () => {
    expect(
      scanFrontmatter("---\nk: eins\nk: zwei\n---\n").fields.get("k"),
    ).toBe("eins");
  });

  it("is empty with the whole text as body when there is no frontmatter", () => {
    const text = "# Just a heading\n\nNo frontmatter here.";
    expect(scanFrontmatter(text)).toEqual({ fields: new Map(), body: text });
  });

  it("is empty with the whole text as body when the fence never closes", () => {
    const text = "---\ntitel: offen\nBody right after.\n";
    expect(scanFrontmatter(text)).toEqual({ fields: new Map(), body: text });
  });

  it("only opens on a '---' that is line one, exactly", () => {
    expect(scanFrontmatter("\n---\ntitel: x\n---\n").fields.size).toBe(0);
    expect(scanFrontmatter("--- \ntitel: x\n---\n").fields.size).toBe(0);
  });
});
