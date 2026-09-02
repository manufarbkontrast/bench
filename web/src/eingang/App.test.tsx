import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api, HttpError } from "./api";
import type { InboxFile, JobRow } from "./types";

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

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 1,
    kind: "plaud-sync",
    argsJson: "{}",
    status: "done",
    startedAt: Date.UTC(2026, 7, 30, 8, 0, 0),
    finishedAt: Date.UTC(2026, 7, 30, 8, 1, 0),
    exitCode: 0,
    logPath: "/jobs/1.log",
    ...overrides,
  };
}

vi.mock("./api", () => ({
  api: {
    inbox: vi.fn(),
    startJob: vi.fn(),
    jobs: vi.fn(),
    job: vi.fn(),
    killJob: vi.fn(),
    schedule: vi.fn(),
  },
  HttpError: class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.inbox).mockResolvedValue({ source: "sample", files: [file()] });
  vi.mocked(api.startJob).mockResolvedValue({
    job: { id: 1, status: "running" },
  });
  vi.mocked(api.jobs).mockResolvedValue({ jobs: [] });
  vi.mocked(api.job).mockResolvedValue({ job: job(), log: "" });
  vi.mocked(api.killJob).mockResolvedValue({ job: job({ status: "killed" }) });
  vi.mocked(api.schedule).mockResolvedValue({ runs: [] });
});

describe("Eingang App", () => {
  it("shows the inbox rows after load", async () => {
    render(<App />);
    expect(
      await screen.findByText("2026-08-30_werkstattrunde-transcript.txt"),
    ).toBeInTheDocument();
  });

  it("shows the empty state when the inbox has nothing new", async () => {
    vi.mocked(api.inbox).mockResolvedValue({ source: "sample", files: [] });
    render(<App />);
    expect(await screen.findByText("Nichts Neues.")).toBeInTheDocument();
  });

  it("starts plaud-sync and refetches when Einsammeln is clicked", async () => {
    render(<App />);
    await screen.findByText("2026-08-30_werkstattrunde-transcript.txt");
    await userEvent.click(screen.getByRole("button", { name: "Einsammeln" }));
    expect(api.startJob).toHaveBeenCalledWith("plaud-sync", undefined);
    await waitFor(() => {
      expect(api.inbox).toHaveBeenCalledTimes(2);
      expect(api.jobs).toHaveBeenCalledTimes(2);
    });
  });

  it("starts plaud-process with the file name when Verarbeiten is clicked", async () => {
    render(<App />);
    await screen.findByText("2026-08-30_werkstattrunde-transcript.txt");
    await userEvent.click(screen.getByRole("button", { name: /Verarbeiten/ }));
    expect(api.startJob).toHaveBeenCalledWith("plaud-process", {
      file: "2026-08-30_werkstattrunde-transcript.txt",
    });
    await waitFor(() => {
      expect(api.inbox).toHaveBeenCalledTimes(2);
    });
  });

  it("shows Läuft bereits. and refetches when a start answers 409", async () => {
    vi.mocked(api.startJob).mockRejectedValue(
      new HttpError(409, "already running"),
    );
    render(<App />);
    await screen.findByText("2026-08-30_werkstattrunde-transcript.txt");
    await userEvent.click(screen.getByRole("button", { name: "Einsammeln" }));
    expect(await screen.findByText("Läuft bereits.")).toBeInTheDocument();
    await waitFor(() => {
      expect(api.inbox).toHaveBeenCalledTimes(2);
    });
  });

  it("logs and does not show a banner when a start fails for another reason", async () => {
    const consoleError = vi.spyOn(console, "error");
    vi.mocked(api.startJob).mockRejectedValue(new Error("boom"));
    render(<App />);
    await screen.findByText("2026-08-30_werkstattrunde-transcript.txt");
    await userEvent.click(screen.getByRole("button", { name: "Einsammeln" }));
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
    });
    expect(screen.queryByText("Läuft bereits.")).not.toBeInTheDocument();
    expect(api.inbox).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("shows the Jobs section with a running spawn job's Abbrechen button", async () => {
    vi.mocked(api.jobs).mockResolvedValue({
      jobs: [
        job({
          id: 5,
          kind: "plaud-process",
          status: "running",
          argsJson: JSON.stringify({ file: "a.txt" }),
        }),
      ],
    });
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "Abbrechen" }),
    ).toBeInTheDocument();
  });

  it("shows no Abbrechen for a running internal job", async () => {
    vi.mocked(api.jobs).mockResolvedValue({
      jobs: [job({ id: 6, kind: "vault-reindex", status: "running" })],
    });
    render(<App />);
    await screen.findByText("Vault-Reindex");
    expect(
      screen.queryByRole("button", { name: "Abbrechen" }),
    ).not.toBeInTheDocument();
  });

  it("opens the log when a job row is selected", async () => {
    vi.mocked(api.jobs).mockResolvedValue({
      jobs: [job({ id: 5, kind: "vault-reindex", status: "done" })],
    });
    vi.mocked(api.job).mockResolvedValue({
      job: job({ id: 5, kind: "vault-reindex", status: "done" }),
      log: "reindex complete",
    });
    render(<App />);
    await screen.findByText("Vault-Reindex");
    await userEvent.click(
      screen.getByRole("button", { name: "Protokoll: Vault-Reindex" }),
    );
    expect(await screen.findByText("reindex complete")).toBeInTheDocument();
  });

  it("kills a running job and refetches the jobs list", async () => {
    vi.mocked(api.jobs).mockResolvedValue({
      jobs: [job({ id: 9, kind: "plaud-process", status: "running" })],
    });
    render(<App />);
    await screen.findByRole("button", { name: "Abbrechen" });
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(api.killJob).toHaveBeenCalledWith(9);
    await waitFor(() => {
      expect(api.jobs).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the scheduled runs section", async () => {
    vi.mocked(api.schedule).mockResolvedValue({
      runs: [{ label: "com.bench.plaud-sync", day: 1, hour: 7, minute: 0 }],
    });
    render(<App />);
    expect(
      await screen.findByText("com.bench.plaud-sync — Tag 1, 07:00 Uhr"),
    ).toBeInTheDocument();
  });
});
