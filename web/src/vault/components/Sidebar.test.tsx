import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import Sidebar from "./Sidebar";
import type { TreeEntry } from "../types";

const entries: TreeEntry[] = [
  { path: "00_Index/Start.md", title: "Start", folder: "00_Index" },
  {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    title: "Leuchtturm",
    folder: "30_Projekte/Leuchtturm",
  },
];

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderSidebar(at = "/") {
  render(
    <MemoryRouter initialEntries={[at]}>
      <Sidebar
        entries={entries}
        vaultName="fixture"
        onSearch={() => undefined}
      />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("shows folders as collapsible tree items and names the vault", () => {
    renderSidebar();
    expect(screen.getByText("fixture")).toBeInTheDocument();
    const tree = within(screen.getByRole("tree", { name: "Notizen" }));
    expect(tree.getByRole("treeitem", { name: "00_Index" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      tree.queryByRole("treeitem", { name: "Start" }),
    ).not.toBeInTheDocument();
  });

  it("opens a folder and navigates to a note", async () => {
    renderSidebar();
    await userEvent.click(
      screen.getByRole("button", { name: "Ordner 00_Index aufklappen" }),
    );
    await userEvent.click(screen.getByRole("treeitem", { name: "Start" }));
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/n/00_Index/Start.md",
    );
  });

  it("expands the folders above the note that is open", () => {
    renderSidebar("/n/30_Projekte/Leuchtturm/Leuchtturm.md");
    // The fixture nests a note under a folder of the same name (a "folder note"), so both rows
    // share the accessible name "Leuchtturm" - `selected` picks the note out from its folder.
    expect(
      screen.getByRole("treeitem", { name: "Leuchtturm", selected: true }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
