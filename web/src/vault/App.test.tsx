import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// api.tree's call count is asserted below; without this, an earlier test's mount leaves the
// mock's call history in place and the count no longer starts from zero.
beforeEach(() => {
  vi.clearAllMocks();
});

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

  it("opens the quick-find with the shortcut and refetches the tree on focus", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Start", level: 1 });
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(
      screen.getByRole("dialog", { name: "Schnellsuche" }),
    ).toBeInTheDocument();
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(api.tree).toHaveBeenCalledTimes(2));
  });
});
