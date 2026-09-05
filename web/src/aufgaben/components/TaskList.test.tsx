import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskList from "./TaskList";
import type { Task } from "../types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    path: "30_Projekte/Leuchtturm/Leuchtturm.md",
    line: 8,
    raw: "- [ ] Spezifikation schreiben 🔺 📅 2026-08-20",
    text: "Spezifikation schreiben",
    done: false,
    due: "2026-08-20",
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

describe("TaskList", () => {
  it("shows the empty state when there are no tasks", () => {
    render(<TaskList tasks={[]} onToggle={vi.fn()} />);
    expect(screen.getByText("Keine Aufgaben.")).toBeInTheDocument();
  });

  it("renders the task text, its meta and the note link", () => {
    render(<TaskList tasks={[task()]} onToggle={vi.fn()} />);
    expect(screen.getByText("Spezifikation schreiben")).toBeInTheDocument();
    expect(screen.getByText(/Fällig/)).toBeInTheDocument();
    expect(screen.getByText(/Höchste/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Leuchtturm" })).toHaveAttribute(
      "href",
      "/vault/n/30_Projekte/Leuchtturm/Leuchtturm.md",
    );
  });

  it("names the checkbox after the task text", () => {
    render(<TaskList tasks={[task()]} onToggle={vi.fn()} />);
    expect(
      screen.getByRole("checkbox", { name: "Spezifikation schreiben" }),
    ).toBeInTheDocument();
  });

  it("calls onToggle with the task's path, line and raw text when clicked", async () => {
    const onToggle = vi.fn();
    render(<TaskList tasks={[task()]} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(
      "30_Projekte/Leuchtturm/Leuchtturm.md",
      8,
      "- [ ] Spezifikation schreiben 🔺 📅 2026-08-20",
    );
  });

  it("renders one row per task", () => {
    render(
      <TaskList
        tasks={[
          task({ line: 1, text: "Erste" }),
          task({ line: 2, text: "Zweite" }),
        ]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});
