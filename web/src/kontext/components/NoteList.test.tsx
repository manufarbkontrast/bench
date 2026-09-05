import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NoteList from "./NoteList";
import type { VaultNote } from "../types";

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    path: "10_Profile/ueber-mich.md",
    title: "Über mich",
    body: "profil text",
    ...overrides,
  };
}

describe("NoteList", () => {
  it("shows Nichts gefunden. when there are no notes", () => {
    render(<NoteList notes={[]} />);
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
  });

  it("renders a note's title as a linked heading and its body preformatted", () => {
    render(<NoteList notes={[note()]} />);
    const link = screen.getByRole("link", { name: "Über mich" });
    expect(link).toHaveAttribute("href", "/vault/n/10_Profile/ueber-mich.md");
    const pre = document.querySelector("pre.kontext-body");
    expect(pre?.textContent).toBe("profil text");
  });

  it("encodes a space in a path segment", () => {
    render(
      <NoteList
        notes={[
          note({ path: "10_Profile/Ein Ordner/Datei.md", title: "Datei" }),
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Datei" })).toHaveAttribute(
      "href",
      "/vault/n/10_Profile/Ein%20Ordner/Datei.md",
    );
  });

  it("renders every note when there is more than one", () => {
    render(
      <NoteList
        notes={[
          note(),
          note({
            path: "50_Workflow/regeln.md",
            title: "Regeln",
            body: "workflow regeln",
          }),
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Über mich" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Regeln" })).toBeVisible();
  });
});
