import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { ClaudeFile, VaultNote } from "./types";

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    path: "10_Profile/ueber-mich.md",
    title: "Über mich",
    body: "profil text",
    ...overrides,
  };
}

function claudeFile(overrides: Partial<ClaudeFile> = {}): ClaudeFile {
  return {
    name: "beispiel-regel.md",
    body: "Regel-Text",
    mtime: Date.UTC(2026, 7, 30, 10, 0, 0),
    ...overrides,
  };
}

vi.mock("./api", () => ({
  api: {
    profil: vi.fn(),
    regeln: vi.fn(),
    stand: vi.fn(),
    memory: vi.fn(),
    repos: vi.fn(),
    skills: vi.fn(),
    mcp: vi.fn(),
  },
}));

import { api } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.profil).mockResolvedValue({ notes: [note()] });
  vi.mocked(api.regeln).mockResolvedValue({
    claude: [claudeFile()],
    vault: [
      note({
        path: "50_Workflow/regeln.md",
        title: "Regeln",
        body: "workflow regeln",
      }),
    ],
  });
  vi.mocked(api.stand).mockResolvedValue({
    note: note({
      path: "00_Index/Session_Context.md",
      title: "Session Context",
      body: "aktueller stand",
    }),
  });
  vi.mocked(api.memory).mockResolvedValue({
    projects: [
      { dir: "-tmp-beispiel", notes: [claudeFile({ name: "notiz.md" })] },
    ],
  });
  vi.mocked(api.repos).mockResolvedValue({
    repos: [
      {
        name: "mein-repo",
        files: [{ name: "CLAUDE.md", body: "claude anweisungen" }],
      },
    ],
  });
  vi.mocked(api.skills).mockResolvedValue({
    count: 2,
    skills: [
      { name: "leuchtturm-skill", description: "Ordnet Fixture-Daten ein" },
      { name: "hafen-skill", description: "Sammelt Ankunftsdaten" },
    ],
  });
  vi.mocked(api.mcp).mockResolvedValue({
    servers: ["beispiel-a", "beispiel-b"],
  });
});

async function openTab(name: string) {
  await userEvent.click(await screen.findByRole("button", { name }));
}

describe("Kontext App", () => {
  it("starts on Profil and moves aria-pressed when a tab is chosen", async () => {
    render(<App />);
    const profilTab = await screen.findByRole("button", { name: "Profil" });
    const regelnTab = screen.getByRole("button", { name: "Regeln" });
    expect(profilTab).toHaveAttribute("aria-pressed", "true");
    expect(regelnTab).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(regelnTab);
    expect(regelnTab).toHaveAttribute("aria-pressed", "true");
    expect(profilTab).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the Profil tab's notes with a linked, encoded heading", async () => {
    render(<App />);
    const heading = await screen.findByRole("link", { name: "Über mich" });
    expect(heading).toHaveAttribute(
      "href",
      "/vault/n/10_Profile/ueber-mich.md",
    );
    expect(screen.getByText("profil text")).toBeInTheDocument();
  });

  it("encodes a space in a note path segment", async () => {
    vi.mocked(api.profil).mockResolvedValue({
      notes: [note({ path: "10_Profile/Ein Ordner/Datei.md", title: "Datei" })],
    });
    render(<App />);
    expect(await screen.findByRole("link", { name: "Datei" })).toHaveAttribute(
      "href",
      "/vault/n/10_Profile/Ein%20Ordner/Datei.md",
    );
  });

  it("shows Nichts gefunden. on Profil when there are no notes", async () => {
    vi.mocked(api.profil).mockResolvedValue({ notes: [] });
    render(<App />);
    expect(await screen.findByText("Nichts gefunden.")).toBeInTheDocument();
  });

  it("renders the Regeln tab's two subsections", async () => {
    render(<App />);
    await openTab("Regeln");
    expect(
      screen.getByRole("heading", { name: "Claude-Regeln" }),
    ).toBeInTheDocument();
    expect(screen.getByText("beispiel-regel.md")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Workflow (Vault)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Regeln" })).toHaveAttribute(
      "href",
      "/vault/n/50_Workflow/regeln.md",
    );
  });

  it("renders the Stand tab's single note", async () => {
    render(<App />);
    await openTab("Stand");
    expect(
      screen.getByRole("link", { name: "Session Context" }),
    ).toBeInTheDocument();
    expect(screen.getByText("aktueller stand")).toBeInTheDocument();
  });

  it("shows Nichts gefunden. on Stand when there is no session note", async () => {
    vi.mocked(api.stand).mockResolvedValue({ note: null });
    render(<App />);
    await openTab("Stand");
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
  });

  it("groups the Memory tab by project dir", async () => {
    render(<App />);
    await openTab("Memory");
    expect(
      screen.getByRole("heading", { name: "-tmp-beispiel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("notiz.md")).toBeInTheDocument();
  });

  it("shows Nichts gefunden. on Memory when there are no projects", async () => {
    vi.mocked(api.memory).mockResolvedValue({ projects: [] });
    render(<App />);
    await openTab("Memory");
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
  });

  it("renders the Repos tab per project with its file sub-blocks", async () => {
    render(<App />);
    await openTab("Repos");
    expect(
      screen.getByRole("heading", { name: "mein-repo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "CLAUDE.md" }),
    ).toBeInTheDocument();
    expect(screen.getByText("claude anweisungen")).toBeInTheDocument();
  });

  it("shows Nichts gefunden. on Repos when there are no registered projects", async () => {
    vi.mocked(api.repos).mockResolvedValue({ repos: [] });
    render(<App />);
    await openTab("Repos");
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
  });

  it("renders the MCP tab as a plain list", async () => {
    render(<App />);
    await openTab("MCP");
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("beispiel-a")).toBeInTheDocument();
    expect(screen.getByText("beispiel-b")).toBeInTheDocument();
  });

  it("shows Nichts gefunden. when the MCP list is empty", async () => {
    vi.mocked(api.mcp).mockResolvedValue({ servers: [] });
    render(<App />);
    await openTab("MCP");
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
  });

  it("narrows the Skills rows on search while the counter stays at the API count", async () => {
    render(<App />);
    await openTab("Skills");
    expect(screen.getByText("2 Skills")).toBeInTheDocument();
    expect(screen.getByText(/leuchtturm-skill — /)).toBeInTheDocument();
    expect(screen.getByText(/hafen-skill — /)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Suchen"), "leuchtturm");
    expect(screen.getByText(/leuchtturm-skill — /)).toBeInTheDocument();
    expect(screen.queryByText(/hafen-skill — /)).not.toBeInTheDocument();
    expect(screen.getByText("2 Skills")).toBeInTheDocument();
  });

  it("shows Nichts gefunden. when the Skills search matches nothing", async () => {
    render(<App />);
    await openTab("Skills");
    await userEvent.type(screen.getByLabelText("Suchen"), "kein-treffer");
    expect(screen.getByText("Nichts gefunden.")).toBeInTheDocument();
    expect(screen.getByText("2 Skills")).toBeInTheDocument();
  });
});
