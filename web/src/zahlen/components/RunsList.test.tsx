import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RunsList from "./RunsList";
import type { RunFolder } from "../types";

function run(overrides: Partial<RunFolder> = {}): RunFolder {
  return {
    folder: "2026-08-15-zwischenstand",
    stichtag: "2026-08-15",
    modus: "zwischenstand",
    ...overrides,
  };
}

describe("RunsList", () => {
  it("shows Keine Läufe. when there are none", () => {
    render(<RunsList runs={[]} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Keine Läufe.")).toBeInTheDocument();
  });

  it("marks the selected run pressed and the rest not", () => {
    render(
      <RunsList
        runs={[
          run(),
          run({ folder: "2026-07-15-zwischenstand", stichtag: "2026-07-15" }),
        ]}
        selected="2026-08-15-zwischenstand"
        onSelect={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelect with the clicked run's folder", async () => {
    const onSelect = vi.fn();
    render(
      <RunsList
        runs={[
          run(),
          run({
            folder: "2026-07-15-zwischenstand",
            stichtag: "2026-07-15",
          }),
        ]}
        selected={null}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getAllByRole("button")[1]);
    expect(onSelect).toHaveBeenCalledWith("2026-07-15-zwischenstand");
  });
});
