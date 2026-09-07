import { execFileSync } from "node:child_process";

/** Reads a pid's process start time as `ps -o lstart=` reports it. Injected so every case in the
 * test suite is a plain function, no real process required. */
export type PsRunner = (pid: number) => string;

// Forced to the C locale: `ps -o lstart=` renders weekday and month names through the shell's own
// LC_TIME, and on a machine set to e.g. de_DE the "Mo.  7 Sep." it prints fails Date.parse for
// most months (German and English abbreviations only coincide by accident, as for September).
// Absolute path rather than a bare "ps": sonarjs/no-os-command-from-path wants a command that
// does not depend on PATH resolution, and /bin/ps is where both macOS and Linux ship it.
const PS_BIN = "/bin/ps";

export const realPs: PsRunner = (pid) =>
  execFileSync(PS_BIN, ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    // execFileSync inherits stderr by default; a pid that cannot exist is an expected outcome
    // here, not a diagnostic worth printing to Bench's own process.
    stdio: ["ignore", "pipe", "pipe"],
  });

// ps reports whole seconds; startedAt is milliseconds. A legitimate child can be truncated down
// to a second that reads earlier than the job's own recorded startedAt even though it started a
// moment later in real time - this widens the accepted window by one second to absorb exactly
// that rounding, not to forgive a process that started substantially earlier.
const TRUNCATION_TOLERANCE_MS = 1000;

/**
 * True only when a live process with `pid` started no earlier than `startedAt` (a job's
 * `started_at`, epoch ms) - proof the pid still names the job's own process rather than one that
 * happened to exist, under the same number, before the job ever ran. Anything ps cannot confirm -
 * the process is gone, a non-zero exit, empty output, an unparsable date - answers false: SPEC
 * decision 4 treats a false "alive" as the dangerous direction, since it would let an unrelated
 * process be signalled by a later kill click.
 */
export function isOurProcess(
  pid: number,
  startedAt: number,
  run: PsRunner = realPs,
): boolean {
  let stdout: string;
  try {
    stdout = run(pid);
  } catch {
    return false;
  }
  const reported = stdout.trim();
  if (!reported) return false;
  const started = Date.parse(reported);
  if (Number.isNaN(started)) return false;
  return started + TRUNCATION_TOLERANCE_MS >= startedAt;
}
