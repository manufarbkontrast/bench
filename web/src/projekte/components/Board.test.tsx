import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Board from "./Board";
import type { Project } from "../types";

function project(overrides: Partial<Project> = {}): Project {
  return {
    path: "/home/m/werkstatt/leuchtfeuer",
    name: "leuchtfeuer",
    kind: "git",
    remote: "git@github.com:manu/leuchtfeuer.git", // allow-secret: SSH remote fixture, not an email address
    remoteLabel: "manu/leuchtfeuer",
    branch: "main",
    lastCommitAt: Date.UTC(2026, 7, 20),
    lastCommitSubject: "feat: raise the tower",
    dirty: 0,
    ahead: null,
    behind: null,
    notePath: null,
    brand: null,
    status: null,
    issues: null,
    prs: null,
    groupKey: "github.com/manu/leuchtfeuer",
    scannedAt: Date.UTC(2026, 7, 30),
    isDuplicate: false,
    sameName: false,
    ...overrides,
  };
}

describe("Board", () => {
  it("sections by Marke, Ohne Marke last, and columns by status ascending, Unzugeordnet last", () => {
    const projects = [
      project({ path: "/a", name: "a", brand: "Treibgut", status: "pause" }),
      project({ path: "/b", name: "b", brand: "Leuchtfeuer", status: "aktiv" }),
      project({ path: "/c", name: "c", brand: "Leuchtfeuer", status: null }),
      project({ path: "/d", name: "d", brand: null, status: null }),
    ];
    render(<Board projects={projects} onSelect={vi.fn()} />);

    const brandHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(brandHeadings).toEqual(["Leuchtfeuer", "Treibgut", "Ohne Marke"]);

    const leuchtfeuerSection = screen
      .getByRole("heading", { level: 2, name: "Leuchtfeuer" })
      .closest("section");
    expect(leuchtfeuerSection).not.toBeNull();
    const statusHeadings = within(leuchtfeuerSection!)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(statusHeadings).toEqual(["aktiv", "Unzugeordnet"]);
  });

  it("puts an entirely uncoupled list into one Ohne Marke section with one Unzugeordnet column", () => {
    render(
      <Board
        projects={[project(), project({ path: "/x", name: "x" })]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Ohne Marke",
    );
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Unzugeordnet",
    );
  });

  it("shows the name, delta line and badges on a card", () => {
    render(
      <Board projects={[project({ dirty: 2, ahead: 1 })]} onSelect={vi.fn()} />,
    );
    const card = screen.getByRole("button", { name: /leuchtfeuer/ });
    expect(within(card).getByText("leuchtfeuer")).toBeInTheDocument();
    expect(within(card).getByText("2 geändert · 1 voraus")).toBeInTheDocument();
  });

  it("calls onSelect with the project path when a card is clicked", async () => {
    const onSelect = vi.fn();
    render(<Board projects={[project()]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /leuchtfeuer/ }));
    expect(onSelect).toHaveBeenCalledWith("/home/m/werkstatt/leuchtfeuer");
  });
});
