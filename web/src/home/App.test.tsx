import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "./App";

const APPS = [
  ["Vault", "/vault/", "Dein Obsidian-Vault, gelesen"],
  [
    "Projekte",
    "/projekte/",
    "Repos und Arbeitsordner: Stand, Dubletten, Notizen.",
  ],
  ["CRM", "/crm/", "Deals und die Menschen dahinter"],
  ["Rolodex", "/rolodex/", "Die Menschen in deinem Leben, nah gehalten"],
];

describe("launcher", () => {
  it("links each app card at its own document root", () => {
    render(<App />);
    for (const [name, href] of APPS) {
      expect(
        screen.getByRole("heading", { name }).closest("a")!,
      ).toHaveAttribute("href", href);
    }
  });

  it("marks itself as the current page in the nav", () => {
    render(<App />);
    expect(
      within(screen.getByRole("navigation", { name: "Primary" })).getByRole(
        "link",
        { name: "Start" },
      ),
    ).toHaveAttribute("aria-current", "page");
  });

  it("names every app and describes what it is", () => {
    render(<App />);
    for (const [name, , tagline] of APPS) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      expect(screen.getByText(tagline)).toBeInTheDocument();
    }
  });

  it("offers exactly four apps", () => {
    render(<App />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  });

  it("counts the apps in its lede", () => {
    render(<App />);
    expect(
      screen.getByText(/^Vier Apps, ein Server, ein Rechner\./),
    ).toBeInTheDocument();
  });
});
