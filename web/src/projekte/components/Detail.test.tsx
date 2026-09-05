import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Detail from "./Detail";
import { dateText } from "../format";
import type { ProjectDetail } from "../types";

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    path: "/home/m/werkstatt/leuchtfeuer",
    name: "leuchtfeuer",
    kind: "git",
    remote: "git@github.com:manu/leuchtfeuer.git", // allow-secret: SSH remote fixture, not an email address
    remoteLabel: "manu/leuchtfeuer",
    branch: "main",
    lastCommitAt: Date.UTC(2026, 7, 20),
    lastCommitSubject: "feat: raise the tower",
    dirty: 2,
    ahead: 1,
    behind: 0,
    notePath: "30_Projekte/Leuchtfeuer/Leuchtfeuer.md",
    brand: "Leuchtfeuer",
    status: "aktiv",
    issues: 3,
    prs: 1,
    groupKey: "github.com/manu/leuchtfeuer",
    scannedAt: Date.UTC(2026, 7, 30),
    ...overrides,
  };
}

describe("Detail", () => {
  it("renders every field with its German label", () => {
    render(<Detail project={project()} duplicates={[]} onClose={vi.fn()} />);
    expect(screen.getByText("Pfad")).toBeInTheDocument();
    expect(
      screen.getByText("/home/m/werkstatt/leuchtfeuer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Branch")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("Letzter Commit")).toBeInTheDocument();
    expect(
      screen.getByText(dateText(Date.UTC(2026, 7, 20))),
    ).toBeInTheDocument();
    expect(screen.getByText("Änderungen")).toBeInTheDocument();
    expect(screen.getByText("2 geändert · 1 voraus")).toBeInTheDocument();
    expect(screen.getByText("Issues")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("PRs")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Marke")).toBeInTheDocument();
    expect(screen.getByText("Leuchtfeuer")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("aktiv")).toBeInTheDocument();
  });

  it("shows a dash for absent branch, commit date, issues, PRs, brand and status", () => {
    render(
      <Detail
        project={project({
          branch: null,
          lastCommitAt: null,
          issues: null,
          prs: null,
          brand: null,
          status: null,
        })}
        duplicates={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText("—")).toHaveLength(6);
  });

  it("links to GitHub only when there is a label", () => {
    render(<Detail project={project()} duplicates={[]} onClose={vi.fn()} />);
    const link = screen.getByRole("link", { name: "In GitHub öffnen" });
    expect(link).toHaveAttribute("href", "https://github.com/manu/leuchtfeuer");
  });

  it("shows no GitHub link without a label", () => {
    render(
      <Detail
        project={project({ remoteLabel: null })}
        duplicates={[]}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "In GitHub öffnen" }),
    ).not.toBeInTheDocument();
  });

  it("links into the vault only when coupled", () => {
    render(<Detail project={project()} duplicates={[]} onClose={vi.fn()} />);
    const link = screen.getByRole("link", { name: "Notiz im Vault" });
    expect(link).toHaveAttribute(
      "href",
      "/vault/n/30_Projekte/Leuchtfeuer/Leuchtfeuer.md",
    );
  });

  it("shows no vault link when not coupled", () => {
    render(
      <Detail
        project={project({ notePath: null })}
        duplicates={[]}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Notiz im Vault" }),
    ).not.toBeInTheDocument();
  });

  it("lists the other paths in the group as duplicates", () => {
    render(
      <Detail
        project={project()}
        duplicates={[
          project({
            path: "/home/m/archiv/leuchtfeuer-alt",
            name: "leuchtfeuer-alt",
          }),
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Duplikate")).toBeInTheDocument();
    expect(
      screen.getByText("/home/m/archiv/leuchtfeuer-alt"),
    ).toBeInTheDocument();
  });

  it("shows no duplicates section when the group has none", () => {
    render(<Detail project={project()} duplicates={[]} onClose={vi.fn()} />);
    expect(screen.queryByText("Duplikate")).not.toBeInTheDocument();
  });

  it("closes when Schließen is clicked", async () => {
    const onClose = vi.fn();
    render(<Detail project={project()} duplicates={[]} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Detail project={project()} duplicates={[]} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the close button on open", () => {
    render(<Detail project={project()} duplicates={[]} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Schließen" })).toHaveFocus();
  });
});
