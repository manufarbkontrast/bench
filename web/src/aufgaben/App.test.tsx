import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api, HttpError } from "./api";
import type { PlaudNote, Task, TreeEntry } from "./types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    line: 8,
    // Far enough in the past to be overdue whenever this suite runs, without faking the clock.
    raw: "- [ ] Spezifikation schreiben 🔺 📅 2020-01-01",
    text: "Spezifikation schreiben",
    done: false,
    due: "2020-01-01",
    scheduled: null,
    start: null,
    priority: "highest",
    recurrence: null,
    doneAt: null,
    noteTitle: "Leuchtturm",
    brand: "nordlicht",
    ...overrides,
  };
}

const tree: TreeEntry[] = [
  { path: "20_Brands/Nordlicht.md", title: "Nordlicht", folder: "20_Brands" },
  {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    title: "Leuchtturm",
    folder: "30_Projekte/Leuchtturm",
  },
];

const plaudNote: PlaudNote = {
  file: "2026-08-20_hafenrunde.md",
  title: "Hafenrunde und Leuchtturm-Ausbau",
  date: "2026-08-20",
  source: "08-20_Besprechung_Hafenrunde-transcript.pdf",
  suggestedTarget: "00_Index/Task_Inbox.md",
  items: [
    {
      rowHash: "hash-1",
      wer: "Jonas",
      was: "Das Material für die neue Lampe bestellen",
      bis: "offen",
      zeitmarke: "[00:02:40]",
      imported: null,
      existing: null,
    },
  ],
  openQuestions: [],
  direct: [],
};

vi.mock("./api", () => ({
  api: {
    tasks: vi.fn(),
    tree: vi.fn(),
    toggle: vi.fn(),
    create: vi.fn(),
    plaud: vi.fn(),
    importItem: vi.fn(),
    issues: vi.fn(),
  },
  HttpError: class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.tasks).mockResolvedValue([task()]);
  vi.mocked(api.tree).mockResolvedValue(tree);
  vi.mocked(api.toggle).mockResolvedValue({ line: 8, raw: "- [x] done" });
  vi.mocked(api.create).mockResolvedValue({
    path: "00_Index/Task_Inbox.md",
    line: 3,
    raw: "- [ ] Neu",
  });
  vi.mocked(api.plaud).mockResolvedValue({ source: "sample", notes: [] });
  vi.mocked(api.importItem).mockResolvedValue({
    targetPath: "00_Index/Task_Inbox.md",
    line: 5,
    raw: "- [ ] x",
  });
  vi.mocked(api.issues).mockResolvedValue({ source: "off", repos: [] });
});

describe("Aufgaben App", () => {
  it("starts on Heute and moves aria-pressed when a tab is chosen", async () => {
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    const heute = screen.getByRole("button", { name: "Heute" });
    const woche = screen.getByRole("button", { name: "Woche" });
    expect(heute).toHaveAttribute("aria-pressed", "true");
    expect(woche).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(woche);
    expect(woche).toHaveAttribute("aria-pressed", "true");
    expect(heute).toHaveAttribute("aria-pressed", "false");
  });

  it("shows all seven views in order, Issues after Erledigt", async () => {
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    const group = within(screen.getByRole("group", { name: "Ansicht" }));
    expect(group.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Heute",
      "Woche",
      "Projekt",
      "Marke",
      "Unzugeordnet",
      "Erledigt",
      "Issues",
    ]);
  });

  it("toggles a task, calling api.toggle then refetching", async () => {
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(api.toggle).toHaveBeenCalledWith(
      "30_Projekte/Leuchtturm/Leuchtturm.md",
      8,
      "- [ ] Spezifikation schreiben 🔺 📅 2020-01-01",
    );
    await waitFor(() => {
      expect(api.tasks).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the conflict message and refetches when the toggle answers 409", async () => {
    vi.mocked(api.toggle).mockRejectedValue(new HttpError(409, "conflict"));
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("checkbox"));
    expect(
      await screen.findByText(
        "Die Notiz hat sich geändert – Liste neu geladen.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.tasks).toHaveBeenCalledTimes(2);
    });
  });

  it("opens the create form and submits it with the chosen target note", async () => {
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Neue Aufgabe" }));

    await userEvent.selectOptions(
      screen.getByLabelText("Notiz"),
      "30_Projekte/Leuchtturm/Leuchtturm.md",
    );
    await userEvent.type(screen.getByLabelText("Text"), "Kabel bestellen");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(api.create).toHaveBeenCalledWith({
      path: "30_Projekte/Leuchtturm/Leuchtturm.md",
      text: "Kabel bestellen",
    });
    await waitFor(() => {
      expect(api.tasks).toHaveBeenCalledTimes(2);
    });
  });

  it("logs and keeps the form open when api.create fails", async () => {
    const consoleError = vi.spyOn(console, "error");
    vi.mocked(api.create).mockRejectedValue(new Error("boom"));
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Neue Aufgabe" }));
    await userEvent.type(screen.getByLabelText("Text"), "Kabel bestellen");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
    });
    expect(screen.getByLabelText("Notiz")).toBeInTheDocument();
    expect(api.tasks).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("closes the create form on Abbrechen without submitting", async () => {
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Neue Aufgabe" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Notiz")).not.toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("shows the Plaud panel above the brandless tasks in Unzugeordnet", async () => {
    vi.mocked(api.plaud).mockResolvedValue({
      source: "sample",
      notes: [plaudNote],
    });
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Unzugeordnet" }));
    expect(
      await screen.findByText("Hafenrunde und Leuchtturm-Ausbau"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /In Vault übernehmen/,
      }),
    ).toBeInTheDocument();
  });

  it("imports a Plaud item by calling api.importItem then refetching api.plaud", async () => {
    vi.mocked(api.plaud).mockResolvedValue({
      source: "sample",
      notes: [plaudNote],
    });
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Unzugeordnet" }));
    await waitFor(() => {
      expect(api.plaud).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(
      screen.getByRole("button", { name: /In Vault übernehmen/ }),
    );

    expect(api.importItem).toHaveBeenCalledWith(
      "2026-08-20_hafenrunde.md",
      "hash-1",
      "00_Index/Task_Inbox.md",
    );
    await waitFor(() => {
      expect(api.plaud).toHaveBeenCalledTimes(2);
    });
  });

  it("refetches api.plaud after a 409 on double import", async () => {
    vi.mocked(api.plaud).mockResolvedValue({
      source: "sample",
      notes: [plaudNote],
    });
    vi.mocked(api.importItem).mockRejectedValue(
      new HttpError(409, "already imported"),
    );
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Unzugeordnet" }));
    await waitFor(() => {
      expect(api.plaud).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(
      screen.getByRole("button", { name: /In Vault übernehmen/ }),
    );

    await waitFor(() => {
      expect(api.plaud).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the Issues tab renders IssuesPanel", async () => {
    vi.mocked(api.issues).mockResolvedValue({
      source: "gh",
      repos: [{ label: "example/a", issues: [] }],
    });
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Issues" }));
    expect(
      await screen.findByRole("heading", { name: "example/a" }),
    ).toBeInTheDocument();
  });
});
