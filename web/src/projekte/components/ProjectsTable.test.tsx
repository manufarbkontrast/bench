import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectsTable from "./ProjectsTable";
import type { Project } from "../types";

function renderTable(
  projects: Project[],
  onSelect: (path: string) => void = vi.fn(),
) {
  render(<ProjectsTable projects={projects} onSelect={onSelect} />);
}

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
    notePath: "30_Projekte/Leuchtfeuer/Leuchtfeuer.md",
    brand: "Leuchtfeuer",
    status: "aktiv",
    issues: null,
    prs: null,
    groupKey: "github.com/manu/leuchtfeuer",
    scannedAt: Date.UTC(2026, 7, 30),
    isDuplicate: false,
    sameName: false,
    ...overrides,
  };
}

describe("ProjectsTable", () => {
  it("renders the name, path, branch, delta and a note link into the vault", () => {
    renderTable([project()]);
    expect(screen.getByText("leuchtfeuer")).toBeInTheDocument();
    expect(
      screen.getByText("/home/m/werkstatt/leuchtfeuer"),
    ).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("sauber")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Leuchtfeuer" });
    expect(link).toHaveAttribute(
      "href",
      "/vault/n/30_Projekte/Leuchtfeuer/Leuchtfeuer.md",
    );
  });

  it("shows a dash for null issues, PRs and a missing note", () => {
    renderTable([project({ issues: null, prs: null, notePath: null })]);
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("flags a duplicate", () => {
    renderTable([project({ isDuplicate: true })]);
    expect(screen.getByText("Dublette")).toBeInTheDocument();
  });

  it("flags a possible duplicate only when it is not an exact one", () => {
    renderTable([project({ isDuplicate: false, sameName: true })]);
    expect(screen.getByText("Mögliche Dublette")).toBeInTheDocument();
  });

  it("does not show a possible-duplicate badge once it is an exact duplicate", () => {
    renderTable([project({ isDuplicate: true, sameName: true })]);
    expect(screen.getByText("Dublette")).toBeInTheDocument();
    expect(screen.queryByText("Mögliche Dublette")).not.toBeInTheDocument();
  });

  it("flags a git checkout with no remote", () => {
    renderTable([project({ remote: null, remoteLabel: null })]);
    expect(screen.getByText("Kein Remote")).toBeInTheDocument();
  });

  it("flags a plain folder as without git", () => {
    renderTable([
      project({
        kind: "folder",
        remote: null,
        remoteLabel: null,
        branch: null,
        lastCommitAt: null,
      }),
    ]);
    expect(screen.getByText("Ohne Git")).toBeInTheDocument();
  });

  it("shows no hints when none apply", () => {
    renderTable([project()]);
    expect(screen.queryByText("Dublette")).not.toBeInTheDocument();
    expect(screen.queryByText("Mögliche Dublette")).not.toBeInTheDocument();
    expect(screen.queryByText("Kein Remote")).not.toBeInTheDocument();
    expect(screen.queryByText("Ohne Git")).not.toBeInTheDocument();
  });

  it("sorts rows by last commit date, most recent first, nulls last", () => {
    const older = project({
      path: "/a",
      name: "aa",
      lastCommitAt: Date.UTC(2026, 0, 1),
    });
    const newer = project({
      path: "/b",
      name: "bb",
      lastCommitAt: Date.UTC(2026, 6, 1),
    });
    const unknown = project({
      path: "/c",
      name: "cc",
      kind: "folder",
      remote: null,
      remoteLabel: null,
      branch: null,
      lastCommitAt: null,
    });
    renderTable([older, unknown, newer]);
    const dataRows = screen.getAllByRole("row").slice(1);
    const firstCellText = dataRows.map(
      (row) => within(row).getAllByRole("cell")[0].textContent,
    );
    expect(firstCellText[0]).toContain("bb");
    expect(firstCellText[1]).toContain("aa");
    expect(firstCellText[2]).toContain("cc");
  });

  it("calls onSelect with the path when the project name is clicked", async () => {
    const onSelect = vi.fn();
    renderTable([project()], onSelect);
    await userEvent.click(screen.getByRole("button", { name: "leuchtfeuer" }));
    expect(onSelect).toHaveBeenCalledWith("/home/m/werkstatt/leuchtfeuer");
  });

  it("gives every column header a scope", () => {
    renderTable([project()]);
    for (const name of [
      "Projekt",
      "Marke",
      "Status",
      "Branch",
      "Letzter Commit",
      "Änderungen",
      "Issues",
      "PRs",
      "Notiz",
      "Hinweise",
    ]) {
      expect(screen.getByRole("columnheader", { name })).toHaveAttribute(
        "scope",
        "col",
      );
    }
  });
});
