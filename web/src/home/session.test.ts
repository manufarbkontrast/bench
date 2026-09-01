import { describe, expect, it } from "vitest";
import { firstSection } from "./session";

const twoSections = [
  "# Session-Kontext",
  "",
  "Rollierender Stand des Beispiel-Vaults.",
  "",
  "## Hier weitermachen — Stand 2026-08-19",
  "",
  "Der Leuchtturm-Prototyp wartet auf den Test im Hafen. Zuerst die Spezifikation",
  "fertigstellen, dann das Material bestellen.",
  "",
  "## Notizen",
  "",
  "Nichts weiter.",
].join("\n");

describe("firstSection", () => {
  it("returns the first ## heading and only the lines up to the next one", () => {
    expect(firstSection(twoSections)).toEqual({
      heading: "Hier weitermachen — Stand 2026-08-19",
      text: "Der Leuchtturm-Prototyp wartet auf den Test im Hafen. Zuerst die Spezifikation\nfertigstellen, dann das Material bestellen.",
    });
  });

  it("returns null when the body has no ## heading", () => {
    const body = "# Session-Kontext\n\nNur ein Absatz, keine Abschnitte.";
    expect(firstSection(body)).toBeNull();
  });

  it("runs to end of body when the section is the last one", () => {
    const body = "## Notizen\n\nNichts weiter.";
    expect(firstSection(body)).toEqual({
      heading: "Notizen",
      text: "Nichts weiter.",
    });
  });
});
