import { describe, expect, it } from "vitest";
import { prepareMarkdown, resolveAsset } from "./markdown";
import type { NoteLink } from "./types";

const links: NoteLink[] = [
  {
    target: "Cockpit",
    heading: null,
    alias: null,
    embed: false,
    toPath: "00_Index/Cockpit.md",
  },
  {
    target: "Stack",
    heading: "Datenbank",
    alias: "Datenbank-Stack",
    embed: false,
    toPath: "40_Tech_Stack/Stack.md",
  },
  {
    target: "Nicht vorhanden",
    heading: null,
    alias: null,
    embed: false,
    toPath: null,
  },
  {
    target: "assets/skizze.svg",
    heading: null,
    alias: null,
    embed: true,
    toPath: null,
  },
];

describe("prepareMarkdown", () => {
  it("turns resolved wikilinks into note links and keeps aliases", () => {
    expect(
      prepareMarkdown(
        "Siehe [[Cockpit]] und [[Stack#Datenbank|Datenbank-Stack]].",
        links,
      ),
    ).toBe(
      "Siehe [Cockpit](/vault/n/00_Index/Cockpit.md) und [Datenbank-Stack](/vault/n/40_Tech_Stack/Stack.md).",
    );
  });

  it("leaves a dangling link as plain text", () => {
    expect(prepareMarkdown("[[Nicht vorhanden]] fehlt", links)).toBe(
      "Nicht vorhanden fehlt",
    );
  });

  it("accepts the escaped pipe Obsidian writes inside tables", () => {
    expect(prepareMarkdown("| [[Cockpit\\|Das Cockpit]] |", links)).toBe(
      "| [Das Cockpit](/vault/n/00_Index/Cockpit.md) |",
    );
  });

  it("turns an embed into an image served from the vault", () => {
    expect(prepareMarkdown("![[assets/skizze.svg]]", links)).toBe(
      "![assets/skizze.svg](/api/vault/file?path=assets%2Fskizze.svg)",
    );
  });

  it("rewrites callouts as bold-titled quotes", () => {
    expect(prepareMarkdown("> [!tip] Hinweis\n> Text", links)).toBe(
      "> **Hinweis**\n> Text",
    );
    expect(prepareMarkdown("> [!warning]\n> Text", links)).toBe(
      "> **Warning**\n> Text",
    );
  });

  it("does not touch fenced code", () => {
    const body = "```js\n[[Kein Link]]\n```\n[[Cockpit]]";
    expect(prepareMarkdown(body, links)).toBe(
      "```js\n[[Kein Link]]\n```\n[Cockpit](/vault/n/00_Index/Cockpit.md)",
    );
  });
});

describe("resolveAsset", () => {
  it("resolves a relative image against the note's folder and leaves absolute URLs alone", () => {
    expect(resolveAsset("../assets/skizze.svg", "20_Brands")).toBe(
      "/api/vault/file?path=assets%2Fskizze.svg",
    );
    expect(resolveAsset("bild.png", "")).toBe("/api/vault/file?path=bild.png");
    expect(resolveAsset("https://example.com/x.png", "20_Brands")).toBe(
      "https://example.com/x.png",
    );
  });
});
