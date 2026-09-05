import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlaudPanel from "./PlaudPanel";
import { api } from "../api";
import type { PlaudNote, TreeEntry } from "../types";

vi.mock("../api", () => ({
  api: { tree: vi.fn() },
}));

const TREE: TreeEntry[] = [
  { path: "20_Brands/Nordlicht.md", title: "Nordlicht", folder: "20_Brands" },
  {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    title: "Leuchtturm",
    folder: "30_Projekte/Leuchtturm",
  },
];

const NOTE: PlaudNote = {
  file: "2026-08-20_hafenrunde.md",
  title: "Hafenrunde und Leuchtturm-Ausbau",
  date: "2026-08-20",
  source: "08-20_Besprechung_Hafenrunde-transcript.pdf",
  suggestedTarget: "00_Index/Task_Inbox.md",
  items: [
    {
      rowHash: "hash-1",
      wer: "Jonas",
      was: "Die Spezifikation für den Leuchtturm-Ausbau schreiben",
      bis: "2026-09-05",
      zeitmarke: "[00:01:10]",
      imported: null,
      existing: {
        path: "30_Projekte/Leuchtturm/Leuchtturm.md",
        line: 4,
        text: "Leuchtturm-Ausbau spezifizieren",
      },
    },
    {
      rowHash: "hash-2",
      wer: "ungeklärt",
      was: "Das Material für die neue Lampe bestellen",
      bis: "offen",
      zeitmarke: "[00:02:40]",
      imported: null,
      existing: null,
    },
    {
      rowHash: "hash-3",
      wer: "ungeklärt",
      was: "Den Prototyp im Hafen testen",
      bis: "offen",
      zeitmarke: "[00:02:40]",
      imported: { targetPath: "00_Index/Task_Inbox.md", line: 12 },
      existing: null,
    },
    {
      rowHash: "hash-4",
      wer: "Jonas",
      was: "Die Werkstatt für den Winter vorbereiten",
      bis: "offen",
      zeitmarke: "[00:03:15]",
      imported: null,
      existing: null,
    },
  ],
  openQuestions: [
    "Welche Lampe genau gemeint ist",
    "Ob der Hafen im Oktober frei ist",
  ],
  direct: ["Den Plan aus dem Frühjahr heraussuchen und neben die Notiz legen."],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.tree).mockResolvedValue(TREE);
});

describe("PlaudPanel", () => {
  it("renders the four rows of the note's Arbeitsaufträge table", async () => {
    render(<PlaudPanel notes={[NOTE]} onImport={vi.fn()} />);
    await screen.findByText("Hafenrunde und Leuchtturm-Ausbau");
    for (const item of NOTE.items) {
      expect(screen.getByText(item.was)).toBeInTheDocument();
    }
  });

  it("shows the note's title, date and Quelle", async () => {
    render(<PlaudPanel notes={[NOTE]} onImport={vi.fn()} />);
    expect(
      await screen.findByText("Hafenrunde und Leuchtturm-Ausbau"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Quelle: 08-20_Besprechung_Hafenrunde-transcript\.pdf/),
    ).toBeInTheDocument();
  });

  it("carries the row's Was as part of the import button's accessible name", async () => {
    render(<PlaudPanel notes={[NOTE]} onImport={vi.fn()} />);
    expect(
      await screen.findByRole("button", {
        name: /In Vault übernehmen.*Das Material für die neue Lampe bestellen/,
      }),
    ).toBeInTheDocument();
  });

  it("calls onImport with the file, rowHash and the select's value when clicked", async () => {
    const onImport = vi.fn();
    render(<PlaudPanel notes={[NOTE]} onImport={onImport} />);
    const button = await screen.findByRole("button", {
      name: /In Vault übernehmen.*Das Material für die neue Lampe bestellen/,
    });
    await userEvent.click(button);
    expect(onImport).toHaveBeenCalledWith(
      "2026-08-20_hafenrunde.md",
      "hash-2",
      "00_Index/Task_Inbox.md",
    );
  });

  it("calls onImport with the changed target once the select value is changed", async () => {
    const onImport = vi.fn();
    render(<PlaudPanel notes={[NOTE]} onImport={onImport} />);
    const select = await screen.findByLabelText(
      "Ziel für Das Material für die neue Lampe bestellen",
    );
    await userEvent.selectOptions(
      select,
      "30_Projekte/Leuchtturm/Leuchtturm.md",
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /In Vault übernehmen.*Das Material für die neue Lampe bestellen/,
      }),
    );
    expect(onImport).toHaveBeenCalledWith(
      "2026-08-20_hafenrunde.md",
      "hash-2",
      "30_Projekte/Leuchtturm/Leuchtturm.md",
    );
  });

  it("shows Übernommen linking into the vault for an imported row, with no button", async () => {
    render(<PlaudPanel notes={[NOTE]} onImport={vi.fn()} />);
    const link = await screen.findByRole("link", { name: "Übernommen" });
    expect(link).toHaveAttribute("href", "/vault/n/00_Index/Task_Inbox.md");
    expect(
      screen.queryByRole("button", {
        name: /In Vault übernehmen.*Den Prototyp im Hafen testen/,
      }),
    ).not.toBeInTheDocument();
  });

  it("renders the dedup hint only for the row with an existing hit", async () => {
    render(<PlaudPanel notes={[NOTE]} onImport={vi.fn()} />);
    await screen.findByText("Hafenrunde und Leuchtturm-Ausbau");
    const hints = screen.getAllByText("Ähnliche Aufgabe vorhanden:");
    expect(hints).toHaveLength(1);
    const existingLink = screen.getByRole("link", {
      name: "Leuchtturm-Ausbau spezifizieren",
    });
    expect(existingLink).toHaveAttribute(
      "href",
      "/vault/n/30_Projekte/Leuchtturm/Leuchtturm.md",
    );
  });

  it("renders Offene Fragen and Direkt erledigbar as bulleted lists", async () => {
    render(<PlaudPanel notes={[NOTE]} onImport={vi.fn()} />);
    await screen.findByText("Hafenrunde und Leuchtturm-Ausbau");
    expect(
      screen.getByText("Welche Lampe genau gemeint ist"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Den Plan aus dem Frühjahr heraussuchen und neben die Notiz legen.",
      ),
    ).toBeInTheDocument();
  });
});
