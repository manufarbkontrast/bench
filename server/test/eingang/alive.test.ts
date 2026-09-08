import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { isOurProcess, type PsRunner } from "../../src/eingang/alive.js";

// Mirrors what `ps -o etime=` prints: [[dd-]hh:]mm:ss, with the day and hour groups appearing only
// once the process is old enough to need them. A duration, so unlike the lstart form this replaced
// there is no zone and no month name for the test and the code to disagree about.
function etime(seconds: number): string {
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (days > 0)
    return `${String(days)}-${pad2(hours)}:${pad2(minutes)}:${pad2(rest)}`;
  if (hours > 0) return `${String(hours)}:${pad2(minutes)}:${pad2(rest)}`;
  return `${pad2(minutes)}:${pad2(rest)}`;
}

describe("isOurProcess", () => {
  it("answers true for a process that started the moment the job did", () => {
    const run: PsRunner = vi.fn(() => etime(0));
    expect(isOurProcess(4242, Date.now(), run)).toBe(true);
  });

  it("answers false for a pid that cannot exist", () => {
    expect(isOurProcess(999_999_999, Date.now())).toBe(false);
  });

  it("answers false for a live pid that started long before the job", () => {
    const run: PsRunner = vi.fn(() => etime(3600));
    expect(isOurProcess(4242, Date.now(), run)).toBe(false);
  });

  // The dangerous direction, and the one a "not earlier than startedAt" rule misses entirely: a
  // recycled pid names a process that started LATER than the job, not earlier. Bench spawns its
  // child synchronously right after recording startedAt, so a young process against an old job is
  // proof the pid has been handed to a stranger - and a later kill click would signal that
  // stranger.
  it("answers false for a pid recycled to a process that started after the job", () => {
    const threeDaysAgo = Date.now() - 3 * 86400 * 1000;
    const run: PsRunner = vi.fn(() => etime(1800));
    expect(isOurProcess(4242, threeDaysAgo, run)).toBe(false);
  });

  it("answers false when the injected ps runner throws", () => {
    const run: PsRunner = vi.fn(() => {
      throw new Error("ps failed");
    });
    expect(isOurProcess(4242, Date.now(), run)).toBe(false);
  });

  it("answers false when the injected ps runner returns empty output", () => {
    const run: PsRunner = vi.fn(() => "");
    expect(isOurProcess(4242, Date.now(), run)).toBe(false);
  });

  it("answers false when the injected ps runner returns an unparsable duration", () => {
    const run: PsRunner = vi.fn(() => "not a duration at all");
    expect(isOurProcess(4242, Date.now(), run)).toBe(false);
  });

  it("reads true when ps truncates the elapsed second the job started in", () => {
    // The job recorded startedAt 800ms into a second; ps has since truncated the elapsed time down
    // to a whole second, so the derived start reads later than startedAt by that remainder. That
    // is the rounding the tolerance exists for, not a genuinely younger process.
    const run: PsRunner = vi.fn(() => etime(1));
    expect(isOurProcess(4242, Date.now() - 1800, run)).toBe(true);
  });

  // All three shapes have to parse. Each is checked against a startedAt that matches its own
  // elapsed time, so a shape that fell through elapsedSeconds' null would answer false and fail
  // here - which is what tells a parsing bug apart from a window verdict.
  it.each([
    { seconds: 90, shape: "mm:ss" },
    { seconds: 3690, shape: "hh:mm:ss" },
    { seconds: 90_090, shape: "dd-hh:mm:ss" },
  ])("parses the $shape etime shape", ({ seconds }) => {
    const run: PsRunner = vi.fn(() => etime(seconds));
    expect(isOurProcess(4242, Date.now() - seconds * 1000, run)).toBe(true);
  });

  // No injected runner: proves the parsing above matches what the real `ps -o etime=` prints on
  // this machine, not only a fixture built to fit it. startedAt is taken before the spawn, which
  // is production's own ordering (runner.ts's start() records it and then spawns) and what makes
  // the one-second tolerance exactly tight.
  it("parses real ps output for a child it spawned itself", () => {
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

  it("answers false for a real child against a startedAt well after it started", () => {
    const child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => 0, 10000)"],
      {
        stdio: "ignore",
      },
    );

    try {
      expect(isOurProcess(child.pid!, Date.now() + 60_000)).toBe(false);
    } finally {
      child.kill("SIGKILL");
    }
  });
});
