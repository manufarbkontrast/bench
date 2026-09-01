import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import IssuesPanel from "./IssuesPanel";
import type { IssueRepo } from "../types";

describe("IssuesPanel", () => {
  it("renders one section per repo, with rows linking to the issue URL and labels as chips", () => {
    const repos: IssueRepo[] = [
      {
        label: "example/a",
        issues: [
          {
            number: 12,
            title: "Fix the scan",
            url: "https://github.com/example/a/issues/12",
            labels: ["bug", "phase-3"],
          },
        ],
      },
      { label: "example/b", issues: [] },
    ];
    render(<IssuesPanel repos={repos} source="gh" />);

    expect(
      screen.getByRole("heading", { name: "example/a" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "example/b" }),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "#12 Fix the scan" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/example/a/issues/12",
    );
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("phase-3")).toBeInTheDocument();
  });

  it("shows GitHub nicht erreichbar for a repo whose issues list is null", () => {
    const repos: IssueRepo[] = [{ label: "example/c", issues: null }];
    render(<IssuesPanel repos={repos} source="gh" />);
    const section = screen
      .getByRole("heading", { name: "example/c" })
      .closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section!).getByText("GitHub nicht erreichbar."),
    ).toBeInTheDocument();
  });

  it("renders only the off line and nothing else when source is off", () => {
    render(<IssuesPanel repos={[]} source="off" />);
    expect(
      screen.getByText("GitHub-Abfrage ist ausgeschaltet."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });

  it("renders Keine GitHub-Projekte bekannt when there are no repos", () => {
    render(<IssuesPanel repos={[]} source="gh" />);
    expect(
      screen.getByText("Keine GitHub-Projekte bekannt."),
    ).toBeInTheDocument();
  });
});
