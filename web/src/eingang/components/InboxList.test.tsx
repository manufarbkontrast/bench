import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InboxList from "./InboxList";
import type { InboxFile } from "../types";

function file(overrides: Partial<InboxFile> = {}): InboxFile {
  return {
    dir: "/plaud/inbox",
    name: "2026-08-30_werkstattrunde-transcript.txt",
    size: 2048,
    mtime: Date.UTC(2026, 7, 30),
    kind: "text",
    status: "unverarbeitet",
    ...overrides,
  };
}

describe("InboxList", () => {
  it("shows the empty state when there are no files", () => {
    render(<InboxList files={[]} onProcess={vi.fn()} />);
    expect(screen.getByText("Nichts Neues.")).toBeInTheDocument();
  });

  it("shows a chip for every status", () => {
    render(
      <InboxList
        files={[
          file({ name: "a.txt", status: "unverarbeitet" }),
          file({ name: "b.txt", status: "in_arbeit" }),
          file({ name: "c.txt", status: "notiz_vorhanden" }),
        ]}
        onProcess={vi.fn()}
      />,
    );
    expect(screen.getByText("Unverarbeitet")).toBeInTheDocument();
    expect(screen.getByText("In Arbeit")).toBeInTheDocument();
    expect(screen.getByText("Notiz vorhanden")).toBeInTheDocument();
  });

  it("enables Verarbeiten, named after the file, for an unverarbeitet inbox file", async () => {
    const onProcess = vi.fn();
    render(<InboxList files={[file()]} onProcess={onProcess} />);
    const button = screen.getByRole("button", {
      name: /Verarbeiten.*werkstattrunde/,
    });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onProcess).toHaveBeenCalledWith(
      "2026-08-30_werkstattrunde-transcript.txt",
    );
  });

  it("disables Verarbeiten for a file outside the inbox dir, with the Erst einsammeln hint", () => {
    render(
      <InboxList
        files={[file({ dir: "/plaud/archiv" })]}
        onProcess={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /Verarbeiten/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Erst einsammeln");
  });

  it("disables Verarbeiten, with the Erst einsammeln hint, for a file the server lists via its watch dir's own name matching rather than the file's - isProcessable and the fence are unchanged by that listing rule, since the file still does not sit under a dir named inbox", () => {
    render(
      <InboxList
        files={[
          file({
            dir: "/plaud/Besprechungs-Textfiles",
            name: "agenda.pdf",
          }),
        ]}
        onProcess={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /Verarbeiten/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Erst einsammeln");
  });

  it("disables Verarbeiten for a file already in arbeit", () => {
    render(
      <InboxList files={[file({ status: "in_arbeit" })]} onProcess={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Verarbeiten/ })).toBeDisabled();
  });

  it("disables Verarbeiten for a file already carrying a note", () => {
    render(
      <InboxList
        files={[file({ status: "notiz_vorhanden" })]}
        onProcess={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Verarbeiten/ })).toBeDisabled();
  });

  it("shows no button and the muted Nur Ablage label for audio rows", () => {
    render(
      <InboxList
        files={[file({ name: "aufnahme.m4a", kind: "audio" })]}
        onProcess={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Nur Ablage")).toBeInTheDocument();
  });

  it("renders one row per file", () => {
    render(
      <InboxList
        files={[
          file({ name: "a.txt" }),
          file({ name: "b.txt", kind: "audio" }),
        ]}
        onProcess={vi.fn()}
      />,
    );
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });
});
