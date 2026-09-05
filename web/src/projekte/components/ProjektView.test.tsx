import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjektView from "./ProjektView";
import type { ProjectDetail, ProjektStand, StandReply } from "../types";

function repo(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
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
    ...overrides,
  };
}

function projekt(overrides: Partial<ProjektStand> = {}): ProjektStand {
  return {
    slug: "leuchtfeuer",
    title: "Leuchtfeuer",
    notePath: "50_Workflow/Handoffs/Handoff_a.md",
    updated: "2026-08-01",
    zustand: "Der Turm steht, die Fresnel-Linse fehlt noch.",
    repos: [repo()],
    missingRepos: [],
    signals: { veraltet: false, dirtyRepos: 0, offeneTasks: 0 },
    ...overrides,
  };
}

const TODAY = "2026-09-05";

describe("ProjektView", () => {
  it("shows a card with its title, header line, badges, zustand text and vault link", () => {
    const stand: StandReply = {
      projekte: [
        projekt({
          signals: { veraltet: true, dirtyRepos: 1, offeneTasks: 2 },
        }),
      ],
      ohneProjekt: [],
      warnings: [],
    };
    render(<ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Leuchtfeuer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Handoff vom 01.08.2026 · vor 35 Tagen"),
    ).toBeInTheDocument();
    expect(screen.getByText("Stand veraltet")).toBeInTheDocument();
    expect(screen.getByText("1 Repo ungesichert")).toBeInTheDocument();
    expect(screen.getByText("2 offene Aufgaben")).toBeInTheDocument();
    expect(
      screen.getByText("Der Turm steht, die Fresnel-Linse fehlt noch."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Handoff im Vault" }),
    ).toHaveAttribute("href", "/vault/n/50_Workflow/Handoffs/Handoff_a.md");
  });

  it("encodes a vault link's segments, not just the path as a whole", () => {
    const notePath = "50_Workflow/Handoffs/Handoff Übergabe.md";
    const stand: StandReply = {
      projekte: [projekt({ notePath })],
      ohneProjekt: [],
      warnings: [],
    };
    render(<ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: "Handoff im Vault" }),
    ).toHaveAttribute(
      "href",
      `/vault/n/${notePath.split("/").map(encodeURIComponent).join("/")}`,
    );
  });

  it("shows Datum fehlt in place of the header line when updated is null", () => {
    const stand: StandReply = {
      projekte: [projekt({ updated: null })],
      ohneProjekt: [],
      warnings: [],
    };
    render(<ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />);
    expect(screen.getByText("Datum fehlt")).toBeInTheDocument();
  });

  it("omits the zustand block when it is empty", () => {
    const stand: StandReply = {
      projekte: [projekt({ zustand: "" })],
      ohneProjekt: [],
      warnings: [],
    };
    const { container } = render(
      <ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />,
    );
    expect(container.querySelector(".projekte-stand-text")).toBeNull();
  });

  it("lists one badge line per missing repo", () => {
    const stand: StandReply = {
      projekte: [projekt({ missingRepos: ["nicht-da"] })],
      ohneProjekt: [],
      warnings: [],
    };
    render(<ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />);
    expect(
      screen.getByText("Repo nicht gefunden: nicht-da"),
    ).toBeInTheDocument();
  });

  it("calls onSelect with a repo's path when its name is clicked", async () => {
    const onSelect = vi.fn();
    const stand: StandReply = {
      projekte: [projekt()],
      ohneProjekt: [],
      warnings: [],
    };
    render(<ProjektView stand={stand} today={TODAY} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "leuchtfeuer" }));
    expect(onSelect).toHaveBeenCalledWith("/home/m/werkstatt/leuchtfeuer");
  });

  it("shows Keine Handoffs. when there are no projects", () => {
    const stand: StandReply = { projekte: [], ohneProjekt: [], warnings: [] };
    render(<ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />);
    expect(screen.getByText("Keine Handoffs.")).toBeInTheDocument();
  });

  it("lists Ohne Projekt repos and calls onSelect for one of them too", async () => {
    const onSelect = vi.fn();
    const stand: StandReply = {
      projekte: [],
      ohneProjekt: [
        repo({ path: "/home/m/werkstatt/treibgut", name: "treibgut" }),
      ],
      warnings: [],
    };
    render(<ProjektView stand={stand} today={TODAY} onSelect={onSelect} />);
    expect(
      screen.getByRole("heading", { name: "Ohne Projekt" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "treibgut" }));
    expect(onSelect).toHaveBeenCalledWith("/home/m/werkstatt/treibgut");
  });

  it("shows the all-claimed message when Ohne Projekt is empty", () => {
    const stand: StandReply = { projekte: [], ohneProjekt: [], warnings: [] };
    render(<ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />);
    expect(
      screen.getByText("Alle Repos sind einem Projekt zugeordnet."),
    ).toBeInTheDocument();
  });

  it("renders warnings", () => {
    const stand: StandReply = {
      projekte: [],
      ohneProjekt: [],
      warnings: ["Handoff ohne projekt: Handoff_x.md"],
    };
    render(<ProjektView stand={stand} today={TODAY} onSelect={vi.fn()} />);
    expect(
      screen.getByText("Handoff ohne projekt: Handoff_x.md"),
    ).toBeInTheDocument();
  });
});
