import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api } from "./api";
import type { ListReply, Project, ScanSummary } from "./types";

function project(overrides: Partial<Project> = {}): Project {
  return {
    path: "/home/m/werkstatt/leuchtfeuer",
    name: "leuchtfeuer",
    kind: "git",
    remote: "git@github.com:manu/leuchtfeuer.git",
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

const loadedList: ListReply = {
  scannedAt: Date.UTC(2026, 7, 30),
  summary: null,
  projects: [project()],
};

const scanSummary: ScanSummary = {
  projects: 1,
  repos: 1,
  folders: 0,
  duplicates: 0,
  ms: 5,
};

vi.mock("./api", () => ({
  api: {
    list: vi.fn(),
    scan: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.list).mockResolvedValue(loadedList);
  vi.mocked(api.scan).mockResolvedValue(scanSummary);
});

describe("Projekte App", () => {
  it("shows the summary line and the loaded rows", async () => {
    render(<App />);
    const summary = await screen.findByText(
      "1 Projekte · 1 Repos · 0 Dubletten · zuletzt " +
        new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
          loadedList.scannedAt!,
        ),
    );
    expect(summary).toBeInTheDocument();
    expect(screen.getByText("leuchtfeuer")).toBeInTheDocument();
  });

  it("shows a not-yet-scanned message before the first load resolves", async () => {
    let resolveList!: (value: ListReply) => void;
    vi.mocked(api.list).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    render(<App />);
    expect(screen.getByText("Noch nicht gescannt.")).toBeInTheDocument();
    resolveList(loadedList);
    await screen.findByText("leuchtfeuer");
  });

  it("shows an empty state once a scan finds nothing", async () => {
    vi.mocked(api.list).mockResolvedValue({
      scannedAt: null,
      summary: null,
      projects: [],
    });
    render(<App />);
    expect(
      await screen.findByText("Keine Projekte gefunden."),
    ).toBeInTheDocument();
  });

  it("scans again on demand and reloads the list", async () => {
    render(<App />);
    await screen.findByText("leuchtfeuer");
    await userEvent.click(screen.getByRole("button", { name: "Neu scannen" }));
    expect(api.scan).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("disables the button and relabels it while a scan runs", async () => {
    let resolveScan!: (value: ScanSummary) => void;
    vi.mocked(api.scan).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        }),
    );
    render(<App />);
    await screen.findByText("leuchtfeuer");
    await userEvent.click(screen.getByRole("button", { name: "Neu scannen" }));
    const button = await screen.findByRole("button", { name: "Scannt …" });
    expect(button).toBeDisabled();
    resolveScan(scanSummary);
    await screen.findByRole("button", { name: "Neu scannen" });
  });
});
