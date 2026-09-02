import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ScheduledRun {
  label: string;
  day: number | null;
  hour: number | null;
  minute: number | null;
}

/**
 * The Cockpit's schedule display shows only launchd jobs that plausibly belong to Bench - the
 * shoesplease-controlling runs and the plaud sync/process skill - never every job on the
 * machine. A user-machine convention (the label prefix chosen when the agent installs the
 * plist), not a Bench-enforced policy.
 */
const ALLOWED_LABEL_SUBSTRINGS = ["shoesplease", "controlling"];

function isAllowedLabel(label: string): boolean {
  return ALLOWED_LABEL_SUBSTRINGS.some((needle) => label.includes(needle));
}

/**
 * The value of the first `<string>...</string>` line directly after an exact
 * `<key>${key}</key>` line, or null when the key is absent. A hand-rolled line scan rather than
 * an XML parser: a launchd plist's shape is small and fixed enough that this is both correct and
 * dependency-free, and a fixed anchor-to-anchor match carries no backtracking risk.
 */
function stringAfterKey(lines: string[], key: string): string | null {
  const index = lines.findIndex((line) => line.trim() === `<key>${key}</key>`);
  if (index === -1) return null;
  const match = /^<string>(.*)<\/string>$/.exec(lines[index + 1]?.trim() ?? "");
  return match ? match[1] : null;
}

/** Same shape as `stringAfterKey`, for an `<integer>` value. */
function integerAfterKey(lines: string[], key: string): number | null {
  const index = lines.findIndex((line) => line.trim() === `<key>${key}</key>`);
  if (index === -1) return null;
  const match = /^<integer>(\d+)<\/integer>$/.exec(
    lines[index + 1]?.trim() ?? "",
  );
  return match ? Number(match[1]) : null;
}

/**
 * The lines strictly inside the `StartCalendarInterval` dict, so the Day/Hour/Minute lookups
 * below cannot accidentally match a same-named key elsewhere in the file. `[]` when the key or
 * its dict is missing, which is also what a plist with no schedule (a manual-only launchd job)
 * looks like.
 */
function calendarIntervalLines(lines: string[]): string[] {
  const keyIndex = lines.findIndex(
    (line) => line.trim() === "<key>StartCalendarInterval</key>",
  );
  if (keyIndex === -1) return [];
  const dictStart = lines.findIndex(
    (line, i) => i > keyIndex && line.trim() === "<dict>",
  );
  if (dictStart === -1) return [];
  const dictEnd = lines.findIndex(
    (line, i) => i > dictStart && line.trim() === "</dict>",
  );
  return dictEnd === -1 ? [] : lines.slice(dictStart + 1, dictEnd);
}

function parsePlist(text: string): ScheduledRun | null {
  const lines = text.split("\n");
  const label = stringAfterKey(lines, "Label");
  if (label === null) return null;
  const interval = calendarIntervalLines(lines);
  return {
    label,
    day: integerAfterKey(interval, "Day"),
    hour: integerAfterKey(interval, "Hour"),
    minute: integerAfterKey(interval, "Minute"),
  };
}

/**
 * Every `.plist` in `launchAgentsDir` whose Label matches the display allowlist, sorted by
 * label for a stable order across runs (readdir order is filesystem-dependent). A missing or
 * unreadable directory contributes nothing rather than throwing - most machines have no
 * scheduled Bench jobs at all.
 */
export function listScheduledRuns(launchAgentsDir: string): ScheduledRun[] {
  let entries;
  try {
    entries = readdirSync(launchAgentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const runs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".plist"))
    .map((entry) =>
      parsePlist(readFileSync(path.join(launchAgentsDir, entry.name), "utf8")),
    )
    .filter((run): run is ScheduledRun => run !== null)
    .filter((run) => isAllowedLabel(run.label));
  return runs.toSorted((a, b) => (a.label < b.label ? -1 : 1));
}
