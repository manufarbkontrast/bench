import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import QuickFind from "./QuickFind";
import { api } from "../api";
import type { SearchHit } from "../types";

vi.mock("../api", () => ({ api: { search: vi.fn() } }));

const hits: SearchHit[] = [
  {
    path: "30_Projekte/Leuchtturm/Calls/2026-08-01 Call Hafen.md",
    title: "2026-08-01 Call Hafen",
    folder: "30_Projekte/Leuchtturm/Calls",
    snippet: "…das [Hafenkonzept] für…",
  },
  {
    path: "40_Tech_Stack/Stack.md",
    title: "Stack",
    folder: "40_Tech_Stack",
    snippet: "SQLite lokal",
  },
];

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderFind(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QuickFind onClose={onClose} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.search).mockResolvedValue(hits);
});

describe("QuickFind", () => {
  it("searches as you type and shows title, folder and snippet", async () => {
    renderFind();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Suche" }),
      "hafen",
    );
    await waitFor(() => expect(api.search).toHaveBeenCalledWith("hafen"));
    expect(
      await screen.findByRole("option", { name: /Call Hafen/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("30_Projekte/Leuchtturm/Calls"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hafenkonzept/)).toBeInTheDocument();
  });

  it("opens the selection with Enter and closes", async () => {
    const onClose = renderFind();
    await userEvent.type(screen.getByRole("textbox", { name: "Suche" }), "s");
    await screen.findByRole("option", { name: /Stack/ });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/n/40_Tech_Stack/Stack.md",
    );
  });

  it("closes on Escape and says when nothing matches", async () => {
    vi.mocked(api.search).mockResolvedValue([]);
    const onClose = renderFind();
    await userEvent.type(screen.getByRole("textbox", { name: "Suche" }), "zzz");
    expect(await screen.findByText(/Keine Treffer/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
