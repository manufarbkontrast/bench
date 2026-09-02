import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LogView from "./LogView";
import { api } from "../api";
import type { JobRow } from "../types";

vi.mock("../api", () => ({
  api: { job: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.job).mockReset();
});

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 1,
    kind: "vault-reindex",
    argsJson: "{}",
    status: "running",
    startedAt: Date.UTC(2026, 7, 30, 8, 0, 0),
    finishedAt: null,
    exitCode: null,
    logPath: "/jobs/1.log",
    ...overrides,
  };
}

describe("LogView", () => {
  it("renders the job label and the fetched log", async () => {
    const theJob = job({ status: "done", finishedAt: Date.now() });
    vi.mocked(api.job).mockResolvedValue({ job: theJob, log: "log contents" });

    render(<LogView job={theJob} onClose={vi.fn()} />);

    expect(await screen.findByText("Vault-Reindex")).toBeInTheDocument();
    expect(await screen.findByText("log contents")).toBeInTheDocument();
  });

  it("shows the German status line", async () => {
    const theJob = job({ status: "failed", finishedAt: Date.now() });
    vi.mocked(api.job).mockResolvedValue({ job: theJob, log: "" });

    render(<LogView job={theJob} onClose={vi.fn()} />);

    expect(await screen.findByText(/Fehlgeschlagen/)).toBeInTheDocument();
  });

  it("polls every 2s while running and stops once the job is done", async () => {
    vi.useFakeTimers();
    try {
      const running = job({ status: "running" });
      const done = { ...running, status: "done" as const, finishedAt: 123 };
      vi.mocked(api.job)
        .mockResolvedValueOnce({ job: running, log: "first" })
        .mockResolvedValueOnce({ job: done, log: "final" });

      render(<LogView job={running} onClose={vi.fn()} />);
      // Flushes the immediate poll()'s microtasks before asserting on it.
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.job).toHaveBeenCalledTimes(1);
      expect(screen.getByText("first")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(api.job).toHaveBeenCalledTimes(2);
      expect(screen.getByText("final")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      // Status left "running" after the second poll, so no further tick fetched again.
      expect(api.job).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling once a poll rejects, rather than ticking forever against a dead server", async () => {
    vi.useFakeTimers();
    try {
      const running = job({ status: "running" });
      vi.mocked(api.job)
        .mockResolvedValueOnce({ job: running, log: "first" })
        .mockRejectedValueOnce(new Error("server gone"));

      render(<LogView job={running} onClose={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.job).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(api.job).toHaveBeenCalledTimes(2);

      // Further ticks must not fire - the failed poll cleared the interval.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(api.job).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never polls a job that is already finished when opened", async () => {
    vi.useFakeTimers();
    try {
      const finished = job({ status: "done", finishedAt: Date.now() });
      vi.mocked(api.job).mockResolvedValue({ job: finished, log: "done log" });

      render(<LogView job={finished} onClose={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.job).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(api.job).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling once unmounted", async () => {
    vi.useFakeTimers();
    try {
      const running = job({ status: "running" });
      vi.mocked(api.job).mockResolvedValue({ job: running, log: "x" });

      const { unmount } = render(<LogView job={running} onClose={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.job).toHaveBeenCalledTimes(1);

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(api.job).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls onClose when Schließen is clicked", async () => {
    const onClose = vi.fn();
    const theJob = job({ status: "done", finishedAt: Date.now() });
    vi.mocked(api.job).mockResolvedValue({ job: theJob, log: "" });

    render(<LogView job={theJob} onClose={onClose} />);
    await screen.findByText("Vault-Reindex");
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    const theJob = job({ status: "done", finishedAt: Date.now() });
    vi.mocked(api.job).mockResolvedValue({ job: theJob, log: "" });

    render(<LogView job={theJob} onClose={onClose} />);
    await screen.findByText("Vault-Reindex");
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
