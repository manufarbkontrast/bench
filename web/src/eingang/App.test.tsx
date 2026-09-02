import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api, HttpError } from "./api";
import type { InboxFile } from "./types";

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

vi.mock("./api", () => ({
  api: {
    inbox: vi.fn(),
    startJob: vi.fn(),
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
});
