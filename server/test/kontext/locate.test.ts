import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { locateKontext } from "../../src/kontext/locate.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-kontext-locate-");
afterAll(scratch.cleanup);

describe("locateKontext", () => {
  it("expands a configured BENCH_CLAUDE_DIR override", () => {
    const dir = path.join(scratch.dir, "claude-home");
    mkdirSync(dir, { recursive: true });
    expect(locateKontext({ BENCH_CLAUDE_DIR: dir })).toEqual({
      claudeDir: dir,
    });
  });

  it("expands a tilde override without checking whether the directory exists", () => {
    // Unlike the other locate modules, Kontext trusts the override outright: the real machine
    // reads the real ~/.claude, so falling back to a sample here would hide the product rather
    // than demonstrate it.
    expect(
      locateKontext({ BENCH_CLAUDE_DIR: "~/does-not-exist-bench-kontext" }),
    ).toEqual({
      claudeDir: path.join(os.homedir(), "does-not-exist-bench-kontext"),
    });
  });

  it("falls back to ~/.claude when BENCH_CLAUDE_DIR is unset or blank", () => {
    expect(locateKontext({})).toEqual({
      claudeDir: path.join(os.homedir(), ".claude"),
    });
    expect(locateKontext({ BENCH_CLAUDE_DIR: "   " })).toEqual({
      claudeDir: path.join(os.homedir(), ".claude"),
    });
  });
});
