import { spawn } from "node:child_process";
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

  // The dangerous direction, and the one a "not earlier than startedAt" rule misses entirely: a
  // recycled pid names a process that started LATER than the job, not earlier. Bench spawns its
  // child synchronously right after recording startedAt, so a start days later is proof the pid
  // has been handed to a stranger - and a later kill click would signal that stranger.
  it("answers false for a pid recycled to a process that started after the job", () => {
    const startedAt = new Date(2026, 5, 1, 12, 0, 0).getTime();
    const strangerStart = new Date(2026, 5, 4, 9, 30, 0);
    const run: PsRunner = vi.fn(() => lstart(strangerStart));
    expect(isOurProcess(4242, startedAt, run)).toBe(false);
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
  it("parses real ps output for a child it spawned itself", () => {
    // startedAt before the spawn, which is production's own ordering (runner.ts's start() records
    // it and then spawns), and what makes the one-second tolerance exactly tight: ps truncates the
    // fork to a whole second, so the reported start can read up to a second earlier than startedAt
    // and never later. Deriving startedAt from process.uptime() instead inverts that - uptime is
    // measured from Node's bootstrap, 5-15ms after the fork ps reports, so the drift is the fork's
    // own offset within its second plus that delay, and 60 samples on this machine reached 1009ms:
    // past the tolerance, and a failure roughly one run in sixty.
    const startedAt = Date.now();
    const child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => 0, 10000)"],
      {
        stdio: "ignore",
      },
    );

    try {
      expect(isOurProcess(child.pid!, startedAt)).toBe(true);
    } finally {
      child.kill("SIGKILL");
    }
  });

  it("answers false for this process against a startedAt well after it started", () => {
    expect(isOurProcess(process.pid, Date.now() + 60_000)).toBe(false);
  });
});
