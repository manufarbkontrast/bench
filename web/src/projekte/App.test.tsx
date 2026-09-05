import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api } from "./api";
import type {
  ListReply,
  Project,
  ProjectDetailReply,
  ScanSummary,
  StandReply,
} from "./types";

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

const projectDetail: ProjectDetailReply = {
  project: project(),
  duplicates: [],
};

// leuchtfeuer sits in no handoff in this fixture, so it shows up under Ohne Projekt too - the
// same row shape as the table's, which is what lets most of these tests find its button without
// having to switch off the new default view first.
const loadedStand: StandReply = {
  projekte: [],
  ohneProjekt: [project()],
  warnings: [],
};

vi.mock("./api", () => ({
  api: {
    list: vi.fn(),
    scan: vi.fn(),
    project: vi.fn(),
    stand: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.list).mockResolvedValue(loadedList);
  vi.mocked(api.scan).mockResolvedValue(scanSummary);
  vi.mocked(api.project).mockResolvedValue(projectDetail);
  vi.mocked(api.stand).mockResolvedValue(loadedStand);
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

  it("fetches the stand only after the list has resolved, so a cold start does not race the first scan", async () => {
    // GET /list scans an empty table before answering (server/src/projekte/routes.ts); GET
    // /stand never scans. Firing them in parallel on a fresh clone or a deleted
    // data/projekte.sqlite would let /stand read the table before the scan has filled it in.
    let resolveList!: (value: ListReply) => void;
    vi.mocked(api.list).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    render(<App />);
    expect(api.stand).not.toHaveBeenCalled();
    resolveList(loadedList);
    await screen.findByText("leuchtfeuer");
    expect(api.stand).toHaveBeenCalledTimes(1);
  });

  it("defaults to the Projekte view and loads the stand on mount", async () => {
    render(<App />);
    const projekteBtn = await screen.findByRole("button", {
      name: "Projekte",
    });
    expect(projekteBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tabelle" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await screen.findByText("leuchtfeuer");
    expect(api.stand).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state in the table once a scan finds nothing", async () => {
    vi.mocked(api.list).mockResolvedValue({
      scannedAt: null,
      summary: null,
      projects: [],
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Tabelle" }));
    expect(
      await screen.findByText("Keine Projekte gefunden."),
    ).toBeInTheDocument();
  });

  it("still renders a card when the stand has a project but the list is empty", async () => {
    vi.mocked(api.list).mockResolvedValue({
      scannedAt: null,
      summary: null,
      projects: [],
    });
    vi.mocked(api.stand).mockResolvedValue({
      projekte: [
        {
          slug: "leuchtfeuer",
          title: "Leuchtfeuer",
          notePath: "50_Workflow/Handoffs/Handoff_a.md",
          updated: null,
          zustand: "",
          repos: [],
          missingRepos: [],
          signals: { veraltet: false, dirtyRepos: 0, offeneTasks: 0 },
        },
      ],
      ohneProjekt: [],
      warnings: [],
    });
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Leuchtfeuer" }),
    ).toBeInTheDocument();
  });

  it("scans again on demand and reloads the list and the stand", async () => {
    render(<App />);
    await screen.findByText("leuchtfeuer");
    await userEvent.click(screen.getByRole("button", { name: "Neu scannen" }));
    expect(api.scan).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.stand).toHaveBeenCalledTimes(2);
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

  it("re-enables the scan button when the scan fails", async () => {
    vi.mocked(api.scan).mockRejectedValue(new Error("scan failed"));
    render(<App />);
    await screen.findByText("leuchtfeuer");
    await userEvent.click(screen.getByRole("button", { name: "Neu scannen" }));
    await screen.findByRole("button", { name: "Neu scannen" });
    expect(screen.getByRole("button", { name: "Neu scannen" })).toBeEnabled();
  });

  it("switches to Tabelle and Board, moving aria-pressed, and back to Projekte", async () => {
    render(<App />);
    await screen.findByText("leuchtfeuer");
    const projekteBtn = screen.getByRole("button", { name: "Projekte" });
    const tableBtn = screen.getByRole("button", { name: "Tabelle" });
    const boardBtn = screen.getByRole("button", { name: "Board" });
    expect(projekteBtn).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(tableBtn);
    expect(tableBtn).toHaveAttribute("aria-pressed", "true");
    expect(projekteBtn).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(boardBtn);
    expect(boardBtn).toHaveAttribute("aria-pressed", "true");
    expect(tableBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Ohne Marke")).toBeInTheDocument();

    await userEvent.click(projekteBtn);
    expect(projekteBtn).toHaveAttribute("aria-pressed", "true");
    expect(boardBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("loads and shows the detail when a project is selected, from either view", async () => {
    render(<App />);
    await screen.findByText("leuchtfeuer");

    await userEvent.click(screen.getByRole("button", { name: "leuchtfeuer" }));
    expect(api.project).toHaveBeenCalledWith(loadedList.projects[0].path);
    await screen.findByRole("button", { name: "Schließen" });

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(
      screen.queryByRole("button", { name: "Schließen" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Board" }));
    await userEvent.click(screen.getByRole("button", { name: /leuchtfeuer/ }));
    expect(api.project).toHaveBeenCalledTimes(2);
    await screen.findByRole("button", { name: "Schließen" });
  });
});
