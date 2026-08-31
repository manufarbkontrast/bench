import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import NoteView from "./NoteView";
import { api } from "../api";
import type { Note } from "../types";

vi.mock("../api", () => ({ api: { note: vi.fn() } }));

const note: Note = {
  path: "00_Index/Start.md",
  title: "Start",
  folder: "00_Index",
  frontmatter: {
    tags: ["moc"],
    updated: "2026-08-01",
    created: "2026-07-01T00:00:00.000Z",
  },
  body: "# Start\n\nGeh zu [[Cockpit]].\n\n> [!tip] Hinweis\n> Callout.",
  mtime: 0,
  tags: ["moc", "index"],
  links: [
    {
      target: "Cockpit",
      heading: null,
      alias: null,
      embed: false,
      toPath: "00_Index/Cockpit.md",
    },
  ],
  backlinks: [{ path: "10_Profile/Persona.md", title: "Persona" }],
};

function renderNote() {
  render(
    <MemoryRouter initialEntries={["/n/00_Index/Start.md"]}>
      <Routes>
        <Route path="/n/*" element={<NoteView vaultName="obsidian" />} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteView", () => {
  it("renders the note with a working wikilink, tags, frontmatter and backlinks", async () => {
    vi.mocked(api.note).mockResolvedValue(note);
    renderNote();
    expect(
      await screen.findByRole("heading", { name: "Start", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cockpit" })).toHaveAttribute(
      "href",
      "/n/00_Index/Cockpit.md",
    );
    expect(screen.getByText("Hinweis")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Tags" })).toHaveTextContent("moc");
    const frontmatter = screen.getByRole("table", { name: "Frontmatter" });
    expect(frontmatter).toHaveTextContent("updated");
    expect(frontmatter).toHaveTextContent("2026-07-01");
    expect(screen.getByRole("link", { name: "Persona" })).toHaveAttribute(
      "href",
      "/n/10_Profile/Persona.md",
    );
    expect(
      screen.getByRole("link", { name: "In Obsidian öffnen" }),
    ).toHaveAttribute(
      "href",
      "obsidian://open?vault=obsidian&file=00_Index%2FStart",
    );
  });

  it("toggles to the raw text and back", async () => {
    vi.mocked(api.note).mockResolvedValue(note);
    renderNote();
    await screen.findByRole("heading", { name: "Start", level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Rohtext" }));
    expect(screen.getByText(/\[\[Cockpit\]\]/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ansicht" }));
    expect(screen.getByRole("link", { name: "Cockpit" })).toBeInTheDocument();
  });

  it("says when a note is missing", async () => {
    vi.mocked(api.note).mockRejectedValue(new Error("Not found"));
    renderNote();
    expect(await screen.findByText(/Notiz nicht gefunden/)).toBeInTheDocument();
  });
});
