import { describe, expect, it, vi } from "vitest";
import { isOurProcess, type PsRunner } from "../../src/eingang/alive.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Mirrors what `ps -o lstart=` prints (forced to the C locale by realPs): weekday, month, a
// space-padded day, HH:MM:SS, year - all in local time, no offset.
function lstart(date: Date): string {
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, " ");
  return `${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${day} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} ${String(date.getFullYear())}`;
}

describe("isOurProcess", () => {
  it("answers true for the test process's own pid against a startedAt of now", () => {
    const now = new Date();
    const run: PsRunner = vi.fn(() => lstart(now));
    expect(isOurProcess(process.pid, now.getTime(), run)).toBe(true);
  });

  it("answers false for a pid that cannot exist", () => {
    expect(isOurProcess(999_999_999, Date.now())).toBe(false);
  });

  it("answers false for a live pid whose reported start predates a startedAt far in the past", () => {
    const oldStart = new Date(1990, 0, 1, 0, 0, 0);
    const startedAt = new Date(2000, 0, 1, 0, 0, 0).getTime();
    const run: PsRunner = vi.fn(() => lstart(oldStart));
    expect(isOurProcess(process.pid, startedAt, run)).toBe(false);
  });

  it("answers false when the injected ps runner throws", () => {
    const run: PsRunner = vi.fn(() => {
      throw new Error("ps failed");
    });
    expect(isOurProcess(process.pid, Date.now(), run)).toBe(false);
  });

  it("answers false when the injected ps runner returns empty output", () => {
    const run: PsRunner = vi.fn(() => "");
    expect(isOurProcess(process.pid, Date.now(), run)).toBe(false);
  });

  it("answers false when the injected ps runner returns unparsable output", () => {
    const run: PsRunner = vi.fn(() => "not a date at all");
    expect(isOurProcess(process.pid, Date.now(), run)).toBe(false);
  });

  it("reads true when the reported start truncates into the same second as startedAt", () => {
    // startedAt lands 800ms into the same clock second lstart reports for the process - the
    // whole-second truncation ps.ts guards against, not a genuinely older process.
    const reported = new Date(2026, 5, 15, 10, 30, 45);
    const startedAt = new Date(2026, 5, 15, 10, 30, 45, 800).getTime();
    const run: PsRunner = vi.fn(() => lstart(reported));
    expect(isOurProcess(process.pid, startedAt, run)).toBe(true);
  });

  // No injected runner: proves the parsing above matches what the real `ps -o lstart=` prints on
  // this machine, not only a fixture built to fit it.
  it("parses real ps output for this process's own pid", () => {
    const startedAt = Date.now() - 60_000;
    expect(isOurProcess(process.pid, startedAt)).toBe(true);
  });
});
