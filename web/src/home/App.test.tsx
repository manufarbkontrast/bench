import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "./App";
import { api } from "./api";
import type { InboxFile, Project, Task } from "./types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    line: 8,
    text: "Spezifikation fertigstellen",
    done: false,
    due: null,
    doneAt: null,
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    path: "/code/leuchtturm",
    name: "leuchtturm",
    dirty: 0,
    ahead: null,
    behind: null,
    lastCommitAt: null,
    ...overrides,
  };
}

// The sample fixture world server/src/eingang/fixture/inbox: the werkstattrunde transcript and
// the m4a recording are unprocessed, the Hafenrunde transcript reconciles to a note - see
// server/test/eingang/routes.test.ts for the same three files.
const inboxFixture: InboxFile[] = [
  { status: "unverarbeitet" },
  { status: "unverarbeitet" },
  { status: "notiz_vorhanden" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function inWeek(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

const sessionBody = [
  "# Session-Kontext",
  "",
  "Rollierender Stand des Beispiel-Vaults.",
  "",
  "## Hier weitermachen — Stand 2026-08-19",
  "",
  "Der Leuchtturm-Prototyp wartet auf den Test im Hafen.",
  "",
  "## Notizen",
  "",
  "Nichts weiter.",
].join("\n");

vi.mock("./api", () => ({
  api: {
    tasks: vi.fn(),
    projects: vi.fn(),
    inbox: vi.fn(),
    sessionNote: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function panel(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  if (!section) throw new Error(`no section for heading ${name}`);
  return section;
}

describe("Cockpit", () => {
  it("renders all seven panels in order, filled from the fixtures", async () => {
    vi.mocked(api.tasks).mockResolvedValue([
      task({ text: "Spezifikation fertigstellen", due: "2020-01-01" }),
      task({ text: "Kabel bestellen", due: inWeek(2) }),
      task({
        text: "Test durchgeführt",
        done: true,
        doneAt: "2026-08-20",
      }),
      task({ text: "Ohne Datum erledigt", done: true, doneAt: null }),
    ]);
    vi.mocked(api.projects).mockResolvedValue([
      project({ name: "leuchtturm", dirty: 2, ahead: 1, behind: 0 }),
      project({
        name: "frisch-committed",
        lastCommitAt: Date.now() - DAY_MS,
      }),
      project({
        name: "ruhig-und-alt",
        lastCommitAt: Date.now() - 30 * DAY_MS,
      }),
    ]);
    vi.mocked(api.inbox).mockResolvedValue(inboxFixture);
    vi.mocked(api.sessionNote).mockResolvedValue({ body: sessionBody });

    render(<App />);
    await screen.findByText("Spezifikation fertigstellen");

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Überfällig",
      "Diese Woche",
      "Eingang",
      "Projekte in Bewegung",
      "Hier weitermachen",
      "Zahlen",
      "Zuletzt erledigt",
    ]);

    const uberfaellig = panel("Überfällig");
    expect(
      within(uberfaellig).getByText("Spezifikation fertigstellen"),
    ).toBeInTheDocument();
    expect(within(uberfaellig).getByText(/^Fällig /)).toBeInTheDocument();

    const woche = panel("Diese Woche");
    expect(within(woche).getByText("Kabel bestellen")).toBeInTheDocument();

    const eingang = panel("Eingang");
    expect(within(eingang).getByText("2 unverarbeitet")).toBeInTheDocument();
    expect(
      within(eingang).getByRole("link", { name: "Verarbeiten" }),
    ).toHaveAttribute("href", "/eingang/");

    const bewegung = panel("Projekte in Bewegung");
    expect(within(bewegung).getByText("leuchtturm")).toBeInTheDocument();
    expect(
      within(bewegung).getByText("2 geändert · 1 voraus"),
    ).toBeInTheDocument();
    expect(within(bewegung).getByText("frisch-committed")).toBeInTheDocument();
    expect(
      within(bewegung).queryByText("ruhig-und-alt"),
    ).not.toBeInTheDocument();

    const weitermachen = panel("Hier weitermachen");
    expect(
      within(weitermachen).getByText("Hier weitermachen — Stand 2026-08-19"),
    ).toBeInTheDocument();
    expect(
      within(weitermachen).getByText(
        "Der Leuchtturm-Prototyp wartet auf den Test im Hafen.",
      ),
    ).toBeInTheDocument();
    expect(
      within(weitermachen).getByRole("link", { name: "Im Vault öffnen" }),
    ).toHaveAttribute("href", "/vault/n/00_Index/Session_Context.md");

    const zahlen = panel("Zahlen");
    expect(
      within(zahlen).getByText("Kommt mit der Zahlen-App (Phase 5)."),
    ).toBeInTheDocument();

    const erledigt = panel("Zuletzt erledigt");
    expect(within(erledigt).getByText("Test durchgeführt")).toBeInTheDocument();
    expect(
      within(erledigt).getByText("Ohne Datum erledigt"),
    ).toBeInTheDocument();

    const appRow = within(screen.getByRole("navigation", { name: "Apps" }));
    for (const [name, href] of [
      ["Vault", "/vault/"],
      ["Projekte", "/projekte/"],
      ["Aufgaben", "/aufgaben/"],
      ["Eingang", "/eingang/"],
      ["CRM", "/crm/"],
      ["Rolodex", "/rolodex/"],
    ]) {
      expect(appRow.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("shows every empty state when nothing is due, moving or done and no note exists", async () => {
    vi.mocked(api.tasks).mockResolvedValue([]);
    vi.mocked(api.projects).mockResolvedValue([]);
    vi.mocked(api.inbox).mockResolvedValue([]);
    vi.mocked(api.sessionNote).mockResolvedValue(null);

    render(<App />);
    await screen.findByText("Nichts überfällig.");

    expect(
      screen.getByText("Diese Woche ist nichts fällig."),
    ).toBeInTheDocument();
    expect(screen.getByText("Alles ruhig.")).toBeInTheDocument();
    expect(
      screen.getByText("Keine Session-Notiz gefunden."),
    ).toBeInTheDocument();
    expect(screen.getByText("Noch nichts erledigt.")).toBeInTheDocument();

    const eingang = panel("Eingang");
    expect(within(eingang).getByText("Nichts Neues.")).toBeInTheDocument();
    expect(
      within(eingang).getByRole("link", { name: "Verarbeiten" }),
    ).toHaveAttribute("href", "/eingang/");
  });
});
