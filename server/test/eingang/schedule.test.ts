import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { listScheduledRuns } from "../../src/eingang/schedule.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-eingang-schedule-");
afterAll(scratch.cleanup);

const FIXTURE_LAUNCHAGENTS = fileURLToPath(
  new URL("../../src/eingang/fixture/launchagents", import.meta.url),
);

let n = 0;
function freshDir(): string {
  n += 1;
  const dir = path.join(scratch.dir, `world-${n}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writePlist(
  dir: string,
  name: string,
  label: string,
  interval?: { day: number; hour: number; minute: number },
): void {
  const intervalXml = interval
    ? [
        "\t<key>StartCalendarInterval</key>",
        "\t<dict>",
        "\t\t<key>Day</key>",
        `\t\t<integer>${interval.day}</integer>`,
        "\t\t<key>Hour</key>",
        `\t\t<integer>${interval.hour}</integer>`,
        "\t\t<key>Minute</key>",
        `\t\t<integer>${interval.minute}</integer>`,
        "\t</dict>",
      ].join("\n") + "\n"
    : "";
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>Label</key>",
    `\t<string>${label}</string>`,
    intervalXml,
    "</dict>",
    "</plist>",
  ].join("\n");
  writeFileSync(path.join(dir, name), xml);
}

describe("listScheduledRuns", () => {
  it("parses the two fixture plists to their Label and Day/Hour/Minute, sorted by label", () => {
    const runs = listScheduledRuns(FIXTURE_LAUNCHAGENTS);

    expect(runs).toEqual([
      {
        label: "de.beispiel.controlling.abschluss",
        day: 1,
        hour: 7,
        minute: 12,
      },
      {
        label: "de.beispiel.controlling.zwischenstand",
        day: 15,
        hour: 7,
        minute: 12,
      },
    ]);
  });

  it("skips a plist whose Label matches neither shoesplease nor controlling", () => {
    const dir = freshDir();
    writePlist(dir, "de.beispiel.backup.plist", "de.beispiel.backup", {
      day: 1,
      hour: 3,
      minute: 0,
    });

    expect(listScheduledRuns(dir)).toEqual([]);
  });

  it("yields null Day/Hour/Minute for a plist without StartCalendarInterval", () => {
    const dir = freshDir();
    writePlist(
      dir,
      "de.beispiel.controlling.adhoc.plist",
      "de.beispiel.controlling.adhoc",
    );

    expect(listScheduledRuns(dir)).toEqual([
      {
        label: "de.beispiel.controlling.adhoc",
        day: null,
        hour: null,
        minute: null,
      },
    ]);
  });

  it("contributes nothing for a missing or unreadable directory", () => {
    const missing = path.join(scratch.dir, "does-not-exist");
    expect(listScheduledRuns(missing)).toEqual([]);
  });

  it("matches on a shoesplease label too, not only controlling", () => {
    const dir = freshDir();
    writePlist(
      dir,
      "de.beispiel.shoesplease.plist",
      "de.beispiel.shoesplease-controlling",
      {
        day: 3,
        hour: 6,
        minute: 30,
      },
    );

    expect(listScheduledRuns(dir)).toEqual([
      {
        label: "de.beispiel.shoesplease-controlling",
        day: 3,
        hour: 6,
        minute: 30,
      },
    ]);
  });
});
