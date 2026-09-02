import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BenchNav from "./BenchNav";

const nav = () => within(screen.getByRole("navigation", { name: "Primary" }));

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("BenchNav", () => {
  it("offers the launcher and every app, in order", () => {
    render(<BenchNav active="crm" />);
    expect(
      nav()
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Start", "/"],
      ["Vault", "/vault/"],
      ["Projekte", "/projekte/"],
      ["Aufgaben", "/aufgaben/"],
      ["Eingang", "/eingang/"],
      ["CRM", "/crm/"],
      ["Rolodex", "/rolodex/"],
    ]);
  });

  it("marks only the app it is rendered in", () => {
    render(<BenchNav active="vault" />);
    const current = nav()
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["Vault"]);
  });

  it("marks the strip as German, unlike the document around it", () => {
    render(<BenchNav active="crm" />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveAttribute(
      "lang",
      "de",
    );
  });

  it("names the project", () => {
    render(<BenchNav active="home" />);
    expect(screen.getByText("Bench")).toBeInTheDocument();
  });

  it("toggles the theme for every app and remembers the choice", async () => {
    render(<BenchNav active="rolodex" />);
    await userEvent.click(
      screen.getByRole("button", { name: /Design wechseln/ }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("bench.theme")).toBe("dark");

    await userEvent.click(
      screen.getByRole("button", { name: /Design wechseln/ }),
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("bench.theme")).toBe("light");
  });
});
