import { execFileSync } from "node:child_process";

/** Reads a pid's elapsed running time as `ps -o etime=` reports it. Injected so every case in the
 * test suite is a plain function, no real process required. */
export type PsRunner = (pid: number) => string;

// Elapsed time, not a start timestamp. `ps -o lstart=` was the obvious choice and is a trap: it
// prints a wall-clock date in whatever zone ps runs under, Date.parse reads it in whatever zone
// Node runs under, and when those disagree the answer is silently off by the offset. They disagree
// on exactly the machine that gates the merge - server/vitest.config.ts pins TZ=Europe/Berlin while
// GitHub's runners are UTC - so this test passed locally and failed in CI by two hours. A duration
// has no zone and no month name to mistranslate.
// Absolute path rather than a bare "ps": sonarjs/no-os-command-from-path wants a command that does
// not depend on PATH resolution, and /bin/ps is where both macOS and Linux ship it. LC_ALL=C is
// cheap insurance rather than load-bearing now that the output is digits and colons.
const PS_BIN = "/bin/ps";

const realPs: PsRunner = (pid) =>
  execFileSync(PS_BIN, ["-o", "etime=", "-p", String(pid)], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    // execFileSync inherits stderr by default; a pid that cannot exist is an expected outcome
    // here, not a diagnostic worth printing to Bench's own process.
    stdio: ["ignore", "pipe", "pipe"],
  });

const ETIME = /^(?:(?:\d+-)?\d+:)?\d+:\d+$/;

/** `[[dd-]hh:]mm:ss` as seconds, or null if it is not that shape. Both BSD and GNU ps print this
    form; the day and hour parts appear only once the process is old enough to need them. Split
    rather than captured, because TypeScript types every regex group as `string` even where the
    pattern makes it optional, so capturing would need a lie to the type checker for each one. */
function elapsedSeconds(reported: string): number | null {
  if (!ETIME.test(reported)) return null;
  const [days, clock] = reported.includes("-")
    ? reported.split("-")
    : ["0", reported];
  const fields = clock.split(":");
  const [hours, minutes, seconds] =
    fields.length === 3 ? fields : ["0", ...fields];
  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

// ps reports whole seconds and truncates, so a child's derived start can read up to a second later
// than it really was. This absorbs exactly that rounding, not a process that started substantially
// earlier.
const TRUNCATION_TOLERANCE_MS = 1000;

// The window is bounded on BOTH sides, and the upper bound is the one that matters. A recycled
// pid names a process that started LATER than the job, so a rule of "not earlier than startedAt"
// accepts it - which would let a kill click signal a stranger. The runner records startedAt and
// then spawns synchronously in the same tick, so a real child starts within milliseconds; five
// seconds is three orders of magnitude of headroom for a loaded machine, and still leaves reuse
// impossible, since it would take the pid space wrapping inside those five seconds.
const SPAWN_WINDOW_MS = 5000;

/**
 * True only when a live process with `pid` started inside a narrow window around `startedAt` (a
 * job's `started_at`, epoch ms) - proof the pid still names the job's own child rather than an
 * older process that happened to carry the same number, or a stranger the pid was recycled to
 * after the job. Anything ps cannot confirm - the process is gone, a non-zero exit, empty output,
 * an unparsable duration - answers false: SPEC decision 4 treats a false "alive" as the dangerous
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
  const elapsed = elapsedSeconds(stdout.trim());
  if (elapsed === null) return false;
  const started = Date.now() - elapsed * 1000;
  return (
    started + TRUNCATION_TOLERANCE_MS >= startedAt &&
    started <= startedAt + SPAWN_WINDOW_MS
  );
}
