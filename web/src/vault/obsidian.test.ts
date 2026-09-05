import { describe, expect, it } from "vitest";
import { obsidianUrl } from "./obsidian";

describe("obsidianUrl", () => {
  it("names the vault and the note without its extension", () => {
    expect(
      obsidianUrl(
        "obsidian",
        "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
      ),
    ).toBe(
      "obsidian://open?vault=obsidian&file=30_Projekte%2FLeuchtturm%2FCalls%2F2026-08-01%20Call%20Hafen",
    );
  });
});
