import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SchedulePanel from "./SchedulePanel";
import type { ScheduledRun } from "../types";

describe("SchedulePanel", () => {
  it("shows the empty state when there are no scheduled runs", () => {
    render(<SchedulePanel runs={[]} />);
    expect(
      screen.getByText("Keine geplanten Läufe gefunden."),
    ).toBeInTheDocument();
  });

  it("renders one row per scheduled run", () => {
    const runs: ScheduledRun[] = [
      {
        label: "com.bench.controlling-zwischenstand",
        day: 1,
        hour: 7,
        minute: 30,
      },
      {
        label: "com.bench.plaud-sync",
        day: null,
        hour: null,
        minute: null,
      },
    ];
    render(<SchedulePanel runs={runs} />);
    expect(
      screen.getByText(
        "com.bench.controlling-zwischenstand — Tag 1, 07:30 Uhr",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("com.bench.plaud-sync — Tag —, —:— Uhr"),
    ).toBeInTheDocument();
  });

  it("always shows the muted launchd note", () => {
    render(<SchedulePanel runs={[]} />);
    expect(
      screen.getByText(
        "Bench plant nichts; das sind die launchd-Einträge dieser Maschine.",
      ),
    ).toBeInTheDocument();
  });
});
