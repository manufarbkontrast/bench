import { describe, expect, it } from "vitest";
import {
  dateText,
  dateTimeText,
  durationText,
  fileMetaText,
  jobKindLabel,
  jobStatusLabel,
  scheduledRunText,
  sizeText,
} from "./format";
import type { InboxFile, JobRow, JobStatus, ScheduledRun } from "./types";

describe("sizeText", () => {
  it("formats kilobytes with a German decimal comma", () => {
    expect(sizeText(2048)).toBe("2,0 KB");
  });

  it("formats megabytes once the size reaches one", () => {
    expect(sizeText(3 * 1024 * 1024)).toBe("3,0 MB");
  });
});

describe("dateText", () => {
  it("formats an mtime in German medium style", () => {
    const mtime = Date.UTC(2026, 7, 30, 10, 0, 0);
    expect(dateText(mtime)).toBe(
      new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
        new Date(mtime),
      ),
    );
  });
});

describe("fileMetaText", () => {
  it("joins the size and the date with a middle dot", () => {
    const file: InboxFile = {
      dir: "/plaud/inbox",
      name: "a.txt",
      size: 2048,
      mtime: Date.UTC(2026, 7, 30),
      kind: "text",
      status: "unverarbeitet",
    };
    expect(fileMetaText(file)).toBe(
      `${sizeText(file.size)} · ${dateText(file.mtime)}`,
    );
  });
});

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

describe("jobKindLabel", () => {
  it("labels plaud-sync as Einsammeln", () => {
    expect(jobKindLabel(job({ kind: "plaud-sync" }))).toBe("Einsammeln");
  });

  it("labels plaud-process with the file name", () => {
    expect(
      jobKindLabel(
        job({
          kind: "plaud-process",
          argsJson: JSON.stringify({ file: "a.txt" }),
        }),
      ),
    ).toBe("Verarbeiten: a.txt");
  });

  it("labels aufgaben-import with the file name", () => {
    expect(
      jobKindLabel(
        job({
          kind: "aufgaben-import",
          argsJson: JSON.stringify({ file: "notiz.md" }),
        }),
      ),
    ).toBe("Aufgaben-Import: notiz.md");
  });

  it("labels controlling with the modus", () => {
    expect(
      jobKindLabel(
        job({
          kind: "controlling",
          argsJson: JSON.stringify({ modus: "abschluss" }),
        }),
      ),
    ).toBe("Controlling (abschluss)");
  });

  it("labels vault-reindex", () => {
    expect(jobKindLabel(job({ kind: "vault-reindex" }))).toBe("Vault-Reindex");
  });

  it("labels projekte-scan", () => {
    expect(jobKindLabel(job({ kind: "projekte-scan" }))).toBe("Projekte-Scan");
  });
});

describe("jobStatusLabel", () => {
  const cases: [JobStatus, string][] = [
    ["running", "Läuft"],
    ["done", "Fertig"],
    ["failed", "Fehlgeschlagen"],
    ["killed", "Abgebrochen"],
    ["timeout", "Zeitüberschreitung"],
  ];

  it.each(cases)("maps %s to %s", (status, label) => {
    expect(jobStatusLabel(status)).toBe(label);
  });
});

describe("dateTimeText", () => {
  it("formats an epoch ms as German date and time", () => {
    const ms = Date.UTC(2026, 7, 30, 10, 15, 0);
    expect(dateTimeText(ms)).toBe(
      new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(ms)),
    );
  });
});

describe("durationText", () => {
  it("counts from startedAt to finishedAt when the job is done", () => {
    const startedAt = Date.UTC(2026, 7, 30, 10, 0, 0);
    const finishedAt = startedAt + 90 * 1000;
    expect(durationText({ startedAt, finishedAt }, startedAt + 999_999)).toBe(
      "1:30",
    );
  });

  it("counts from startedAt to now while still running", () => {
    const startedAt = Date.UTC(2026, 7, 30, 10, 0, 0);
    const now = startedAt + 5 * 1000;
    expect(durationText({ startedAt, finishedAt: null }, now)).toBe("0:05");
  });
});

describe("scheduledRunText", () => {
  it("renders label, day, hour and minute", () => {
    const run: ScheduledRun = {
      label: "controlling-zwischenstand",
      day: 1,
      hour: 7,
      minute: 30,
    };
    expect(scheduledRunText(run)).toBe(
      "controlling-zwischenstand — Tag 1, 07:30 Uhr",
    );
  });

  it("renders an em dash for every null field", () => {
    const run: ScheduledRun = {
      label: "plaud-sync",
      day: null,
      hour: null,
      minute: null,
    };
    expect(scheduledRunText(run)).toBe("plaud-sync — Tag —, —:— Uhr");
  });
});
