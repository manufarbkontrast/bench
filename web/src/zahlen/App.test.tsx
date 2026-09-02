import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { runLineText } from "./format";
import type { RunFolder, RunReply } from "./types";

const AUGUST = runLineText({ stichtag: "2026-08-15", modus: "zwischenstand" });
const JULY = runLineText({ stichtag: "2026-07-15", modus: "zwischenstand" });

function runFolder(overrides: Partial<RunFolder> = {}): RunFolder {
  return {
    folder: "2026-08-15-zwischenstand",
    stichtag: "2026-08-15",
    modus: "zwischenstand",
    ...overrides,
  };
}

/** The non-null member of RunReply - the shape every test here actually builds. */
type PopulatedRunReply = Extract<RunReply, { run: RunFolder }>;

function runReply(
  overrides: Partial<PopulatedRunReply> = {},
): PopulatedRunReply {
  return {
    run: runFolder(),
    kpis: [
      {
        kennzahl: "Umsatz gesamt",
        vergleich: "51.200 €",
        aktuell: "54.300 €",
        veraenderung: "+6,1 %",
      },
    ],
    breakEven: ['Kampagne "Sommeraktion Nord" liegt unter dem Break-even.'],
    zusammenfassung:
      "# Zwischenstand 15.08.2026\n\nUmsatz liegt bei 54.300 Euro.",
    bestellungen: 123,
    ...overrides,
  };
}

vi.mock("./api", () => ({
  api: {
    last: vi.fn(),
    run: vi.fn(),
    runs: vi.fn(),
    links: vi.fn(),
  },
  fileUrl: (folder: string, name: string) =>
    `/api/zahlen/file?folder=${folder}&name=${name}`,
}));

import { api } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.last).mockResolvedValue(runReply());
  vi.mocked(api.run).mockResolvedValue(
    runReply({
      run: runFolder({
        folder: "2026-07-15-zwischenstand",
        stichtag: "2026-07-15",
      }),
      kpis: [],
      breakEven: [],
      zusammenfassung: "# Zwischenstand 15.07.2026\n\n48.900 Euro.",
      bestellungen: null,
    }),
  );
  vi.mocked(api.runs).mockResolvedValue({
    runs: [
      runFolder(),
      runFolder({
        folder: "2026-07-15-zwischenstand",
        stichtag: "2026-07-15",
      }),
    ],
  });
  vi.mocked(api.links).mockResolvedValue({
    base: "https://mycrafton.example.com",
    paths: ["/", "/umlagerungen", "/nachbestellungen", "/marken"],
  });
});

describe("Zahlen App", () => {
  it("shows Noch kein Lauf. when there is no run", async () => {
    vi.mocked(api.last).mockResolvedValue({ run: null });
    render(<App />);
    expect(await screen.findByText("Noch kein Lauf.")).toBeInTheDocument();
  });

  it("renders the KPI rows and the zusammenfassung pre block for the last run", async () => {
    render(<App />);
    expect(
      await screen.findByText(AUGUST, { selector: ".zahlen-run-line" }),
    ).toBeInTheDocument();
    expect(screen.getByText("54.300 €")).toBeInTheDocument();
    expect(
      screen.getByText("Kampagnen unter Break-even: 1"),
    ).toBeInTheDocument();
    const pre = document.querySelector("pre.zahlen-md");
    expect(pre?.textContent).toContain("Umsatz liegt bei 54.300 Euro.");
  });

  it("points the Bericht iframe and the downloads at /api/zahlen/file", async () => {
    render(<App />);
    await screen.findByText(AUGUST, { selector: ".zahlen-run-line" });
    expect(screen.getByTitle("Bericht")).toHaveAttribute(
      "src",
      "/api/zahlen/file?folder=2026-08-15-zwischenstand&name=bericht.html",
    );
    expect(screen.getByText("rohdaten.json")).toHaveAttribute(
      "href",
      "/api/zahlen/file?folder=2026-08-15-zwischenstand&name=rohdaten.json",
    );
    expect(screen.getByText("zusammenfassung.md")).toHaveAttribute(
      "href",
      "/api/zahlen/file?folder=2026-08-15-zwischenstand&name=zusammenfassung.md",
    );
  });

  it("selects an archive run, calls api.run and swaps the view", async () => {
    render(<App />);
    await screen.findByText(AUGUST, { selector: ".zahlen-run-line" });

    await userEvent.click(screen.getByRole("button", { name: JULY }));

    expect(api.run).toHaveBeenCalledWith("2026-07-15-zwischenstand");
    await waitFor(() => {
      expect(
        screen.getByText("Kampagnen unter Break-even: 0"),
      ).toBeInTheDocument();
    });
    const pre = document.querySelector("pre.zahlen-md");
    expect(pre?.textContent).toContain("48.900 Euro.");
  });

  it("marks the archive row for the currently shown run as pressed", async () => {
    render(<App />);
    await screen.findByText(AUGUST, { selector: ".zahlen-run-line" });
    const current = screen.getByRole("button", { name: AUGUST });
    expect(current).toHaveAttribute("aria-pressed", "true");
  });

  it("shows Keine Läufe. when the archive is empty", async () => {
    vi.mocked(api.runs).mockResolvedValue({ runs: [] });
    render(<App />);
    expect(await screen.findByText("Keine Läufe.")).toBeInTheDocument();
  });

  it("labels and links the myCrafton deep links when a base is configured", async () => {
    render(<App />);
    const link = await screen.findByRole("link", { name: "Umlagerungen" });
    expect(link).toHaveAttribute(
      "href",
      "https://mycrafton.example.com/umlagerungen",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows Nicht konfiguriert. and no links when the myCrafton base is unset", async () => {
    vi.mocked(api.links).mockResolvedValue({ base: null, paths: [] });
    render(<App />);
    expect(await screen.findByText("Nicht konfiguriert.")).toBeInTheDocument();
    expect(
      within(
        screen.getByText("Nicht konfiguriert.").closest("section")!,
      ).queryByRole("link"),
    ).not.toBeInTheDocument();
  });
});
