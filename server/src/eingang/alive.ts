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

const realPs: PsRunner = (pid) =>
  execFileSync(PS_BIN, ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    // execFileSync inherits stderr by default; a pid that cannot exist is an expected outcome
    // here, not a diagnostic worth printing to Bench's own process.
    stdio: ["ignore", "pipe", "pipe"],
  });

// ps reports whole seconds; startedAt is milliseconds. A legitimate child can be truncated down
// to a second that reads earlier than the job's own recorded startedAt even though it started a
// moment later in real time - this absorbs exactly that rounding, not a process that started
// substantially earlier.
const TRUNCATION_TOLERANCE_MS = 1000;

// The window is bounded on BOTH sides, and the upper bound is the one that matters. A recycled
// pid names a process that started LATER than the job, so a rule of "not earlier than startedAt"
// accepts it - which would let a kill click signal a stranger. The runner records startedAt and
// then spawns synchronously in the same tick, so a real child starts within milliseconds; five
// seconds is three orders of magnitude of headroom for a loaded machine, and still leaves reuse
// impossible, since it would take the pid space wrapping inside those five seconds.
// The one case the window cannot separate is a DST fall-back: `ps -o lstart=` prints local time
// with no offset, so a pid recycled inside the repeated hour to a process started at the same
// wall-clock second of the second pass parses to the job's own timestamp and passes. It needs pid
// wraparound within one hour, a same-second coincidence and the transition, all three at once; the
// reverse pairing fails the lower bound, which is the safe direction.
const SPAWN_WINDOW_MS = 5000;

/**
 * True only when a live process with `pid` started inside a narrow window around `startedAt` (a
 * job's `started_at`, epoch ms) - proof the pid still names the job's own child rather than an
 * older process that happened to carry the same number, or a stranger the pid was recycled to
 * after the job. Anything ps cannot confirm - the process is gone, a non-zero exit, empty output,
 * an unparsable date - answers false: SPEC decision 4 treats a false "alive" as the dangerous
 * direction, since it would let an unrelated process be signalled by a later kill click.
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
    // This conflates two things on purpose, and the conflation has a cost worth knowing. `ps`
    // exiting non-zero because the pid is gone is a real answer; `ps` failing to run at all
    // (EMFILE, EAGAIN, a missing /bin/ps) is no answer, and both land here as false. For the
    // signalling path that is the safe direction either way - a false "gone" never sends a
    // signal. For the fence it is not: kill() settles a `running` row to "failed" on a false
    // answer, so a machine briefly out of fork slots could open the fence while the job's process
    // is genuinely still alive, and a second job of that kind could start beside it. Rare, and it
    // costs duplicated work rather than a stranger's process, which is why one boolean is still
    // the right shape here - but it is a real edge, not an oversight.
    return false;
  }
  const reported = stdout.trim();
  if (!reported) return false;
  const started = Date.parse(reported);
  if (Number.isNaN(started)) return false;
  return (
    started + TRUNCATION_TOLERANCE_MS >= startedAt &&
    started <= startedAt + SPAWN_WINDOW_MS
  );
}
