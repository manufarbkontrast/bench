import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { locateEingang } from "../../src/eingang/locate.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-eingang-locate-");
afterAll(scratch.cleanup);

describe("locateEingang", () => {
  it("keeps existing configured watch dirs, names the missing ones and trusts the configured controlling dir", () => {
    const real = path.join(scratch.dir, "real");
    mkdirSync(real, { recursive: true });
    const missing = path.join(scratch.dir, "missing");
    const controlling = path.join(scratch.dir, "controlling");
    mkdirSync(controlling, { recursive: true });
    const located = locateEingang(
      { inboxWatch: [real, missing], controllingDir: controlling },
      path.join(scratch.dir, "fixture-a"),
    );
    expect(located).toEqual({
      watchDirs: [real],
      controllingDir: controlling,
      launchAgentsDir: path.join(os.homedir(), "Library", "LaunchAgents"),
      source: "configured",
      missing: [missing],
    });
  });

  it("falls back to the sample fixtures when nothing is configured", () => {
    const fixtureDir = path.join(scratch.dir, "fixture-b");
    const located = locateEingang(
      { inboxWatch: [], controllingDir: undefined },
      fixtureDir,
    );
    expect(located).toEqual({
      watchDirs: [path.join(fixtureDir, "inbox")],
      controllingDir: path.join(fixtureDir, "controlling"),
      launchAgentsDir: path.join(fixtureDir, "launchagents"),
      source: "sample",
      missing: [],
    });
  });

  it("falls the controlling dir back too when no watch dir is usable, even though it is itself configured", () => {
    const missing = path.join(scratch.dir, "gone");
    const controlling = path.join(scratch.dir, "controlling-c");
    mkdirSync(controlling, { recursive: true });
    const fixtureDir = path.join(scratch.dir, "fixture-c");
    const located = locateEingang(
      { inboxWatch: [missing], controllingDir: controlling },
      fixtureDir,
    );
    expect(located).toEqual({
      watchDirs: [path.join(fixtureDir, "inbox")],
      controllingDir: path.join(fixtureDir, "controlling"),
      launchAgentsDir: path.join(fixtureDir, "launchagents"),
      source: "sample",
      missing: [missing],
    });
  });
});
