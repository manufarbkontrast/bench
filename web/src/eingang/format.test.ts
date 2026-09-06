import { describe, expect, expectTypeOf, it } from "vitest";
import {
  dateText,
  dateTimeText,
  dauerText,
  durationText,
  fileMetaText,
  jobKindLabel,
  jobStatusLabel,
  recordingMetaText,
  scheduledRunText,
  sizeText,
} from "./format";
import type {
  EingangJobKind,
  InboxFile,
  JobRow,
  JobStatus,
  ListedEingangJobKind,
  Recording,
  ScheduledRun,
} from "./types";

// A type-level pin, checked by `tsc` (npm run typecheck / check) rather than at runtime: if
// EINGANG_JOB_KINDS in types.ts ever drops a member EingangJobKind still has, this assertion
// stops compiling. `vitest run` alone (no typecheck.enabled in vite.config.ts's test block)
// executes expectTypeOf as a no-op, so this is enforced by the typecheck gate, not the test run.
expectTypeOf<EingangJobKind>().toEqualTypeOf<ListedEingangJobKind>();

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

  it("falls back to the raw kind for a string outside EingangJobKind", () => {
    expect(jobKindLabel(job({ kind: "some-retired-kind" }))).toBe(
      "some-retired-kind",
    );
  });

  it("labels plaud-fetch with the recording id", () => {
    expect(
      jobKindLabel(
        job({ kind: "plaud-fetch", argsJson: JSON.stringify({ id: "abc" }) }),
      ),
    ).toBe("Holen: abc");
  });

  it("labels plaud-process with the projekt slug when given one", () => {
    expect(
      jobKindLabel(
        job({
          kind: "plaud-process",
          argsJson: JSON.stringify({ file: "a.md", projekt: "leuchtturm" }),
        }),
      ),
    ).toBe("Verarbeiten: a.md (leuchtturm)");
  });
});

describe("dauerText", () => {
  it("renders seconds under a minute", () => {
    expect(dauerText(23_000)).toBe("23s");
  });

  it("renders minutes and seconds under an hour", () => {
    expect(dauerText(323_000)).toBe("5m23s");
  });

  it("renders hours and minutes from an hour on", () => {
    expect(dauerText(3_900_000)).toBe("1h05m");
  });
});

describe("recordingMetaText", () => {
  function recording(overrides: Partial<Recording> = {}): Recording {
    return {
      id: "fix-lampe-0901",
      titel: "Lampe für den Leuchtturm",
      start: "2026-09-01T09:00:00",
      dauer: 1_523_000,
      status: "neu",
      ...overrides,
    };
  }

  it("renders Ohne Datum in place of the date-time when start is blank", () => {
    expect(recordingMetaText(recording({ start: "" }))).toBe(
      "Ohne Datum · 25m23s",
    );
  });

  it("renders the parsed date-time when start is set", () => {
    expect(recordingMetaText(recording())).toBe(
      `${dateTimeText(Date.parse("2026-09-01T09:00:00"))} · 25m23s`,
    );
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
