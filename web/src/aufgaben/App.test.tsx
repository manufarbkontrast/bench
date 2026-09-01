import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api, HttpError } from "./api";
import type { Task, TreeEntry } from "./types";

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

vi.mock("./api", () => ({
  api: {
    tasks: vi.fn(),
    tree: vi.fn(),
    toggle: vi.fn(),
    create: vi.fn(),
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

  it("shows all six views in order", async () => {
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

  it("closes the create form on Abbrechen without submitting", async () => {
    render(<App />);
    await screen.findByText("Spezifikation schreiben");
    await userEvent.click(screen.getByRole("button", { name: "Neue Aufgabe" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Notiz")).not.toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });
});
