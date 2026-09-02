import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobsPanel from "./JobsPanel";
import type { JobRow } from "../types";

const NOW = Date.UTC(2026, 7, 30, 8, 5, 0);

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 1,
    kind: "plaud-sync",
    argsJson: "{}",
    status: "running",
    startedAt: Date.UTC(2026, 7, 30, 8, 0, 0),
    finishedAt: null,
    exitCode: null,
    logPath: "/jobs/1.log",
    ...overrides,
  };
}

describe("JobsPanel", () => {
  it("shows the empty state when there are no jobs", () => {
    render(
      <JobsPanel
        jobs={[]}
        now={NOW}
        onStart={vi.fn()}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Keine Jobs.")).toBeInTheDocument();
  });

  it("starts plaud-sync from Einsammeln", async () => {
    const onStart = vi.fn();
    render(
      <JobsPanel
        jobs={[]}
        now={NOW}
        onStart={onStart}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Einsammeln" }));
    expect(onStart).toHaveBeenCalledWith("plaud-sync", undefined);
  });

  it("starts controlling zwischenstand", async () => {
    const onStart = vi.fn();
    render(
      <JobsPanel
        jobs={[]}
        now={NOW}
        onStart={onStart}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Controlling Zwischenstand" }),
    );
    expect(onStart).toHaveBeenCalledWith("controlling", {
      modus: "zwischenstand",
    });
  });

  it("starts controlling abschluss", async () => {
    const onStart = vi.fn();
    render(
      <JobsPanel
        jobs={[]}
        now={NOW}
        onStart={onStart}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Controlling Abschluss" }),
    );
    expect(onStart).toHaveBeenCalledWith("controlling", {
      modus: "abschluss",
    });
  });

  it("starts vault-reindex from Vault neu indexieren", async () => {
    const onStart = vi.fn();
    render(
      <JobsPanel
        jobs={[]}
        now={NOW}
        onStart={onStart}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Vault neu indexieren" }),
    );
    expect(onStart).toHaveBeenCalledWith("vault-reindex", undefined);
  });

  it("starts projekte-scan from Projekte scannen", async () => {
    const onStart = vi.fn();
    render(
      <JobsPanel
        jobs={[]}
        now={NOW}
        onStart={onStart}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Projekte scannen" }),
    );
    expect(onStart).toHaveBeenCalledWith("projekte-scan", undefined);
  });

  it("shows the German status and job kind label for a row", () => {
    render(
      <JobsPanel
        jobs={[job({ status: "done", finishedAt: Date.now() })]}
        now={NOW}
        onStart={vi.fn()}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Fertig")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Einsammeln" }),
    ).toBeInTheDocument();
  });

  it("opens the log for a row when its name is clicked", async () => {
    const onSelect = vi.fn();
    const theJob = job();
    render(
      <JobsPanel
        jobs={[theJob]}
        now={NOW}
        onStart={vi.fn()}
        onKill={vi.fn()}
        onSelect={onSelect}
      />,
    );
    // The row's own button carries a "Protokoll: " accessible name so it never collides with the
    // start button of the same kind - both would otherwise be named plain "Einsammeln".
    await userEvent.click(
      screen.getByRole("button", { name: "Protokoll: Einsammeln" }),
    );
    expect(onSelect).toHaveBeenCalledWith(theJob);
  });

  it("shows Abbrechen for a running spawn job and calls onKill with its id", async () => {
    const onKill = vi.fn();
    render(
      <JobsPanel
        jobs={[job({ id: 7, kind: "plaud-process" })]}
        now={NOW}
        onStart={vi.fn()}
        onKill={onKill}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onKill).toHaveBeenCalledWith(7);
  });

  it("shows no Abbrechen for a finished job", () => {
    render(
      <JobsPanel
        jobs={[job({ status: "done", finishedAt: Date.now() })]}
        now={NOW}
        onStart={vi.fn()}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Abbrechen" }),
    ).not.toBeInTheDocument();
  });

  it("shows no Abbrechen for a running internal job", () => {
    render(
      <JobsPanel
        jobs={[job({ kind: "vault-reindex", status: "running" })]}
        now={NOW}
        onStart={vi.fn()}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Abbrechen" }),
    ).not.toBeInTheDocument();
  });

  it("renders the table headers", () => {
    render(
      <JobsPanel
        jobs={[job()]}
        now={NOW}
        onStart={vi.fn()}
        onKill={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    for (const header of ["Job", "Status", "Gestartet", "Dauer", "Ende"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });
});
