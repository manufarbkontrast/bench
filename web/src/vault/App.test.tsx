import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import App from "./App";
import { api } from "./api";

vi.mock("./api", () => ({
  api: {
    info: vi.fn().mockResolvedValue({ name: "fixture", notes: 2 }),
    tree: vi.fn().mockResolvedValue([
      { path: "00_Index/Start.md", title: "Start", folder: "00_Index" },
      { path: "Alt.md", title: "Alt", folder: "" },
    ]),
    note: vi.fn().mockResolvedValue({
      path: "00_Index/Start.md",
      title: "Start",
      folder: "00_Index",
      frontmatter: {},
      body: "# Start\n\nHallo.",
      mtime: 0,
      tags: [],
      links: [],
      backlinks: [],
    }),
    search: vi.fn(),
  },
}));

describe("Vault App", () => {
  it("loads the tree and opens the Start note", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Start", level: 1 }),
    ).toBeInTheDocument();
    expect(api.tree).toHaveBeenCalled();
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });
});
