import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { locatePlaud } from "../../src/aufgaben/locate.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-plaud-locate-");
afterAll(scratch.cleanup);

describe("locatePlaud", () => {
  it("uses <plaudHome>/notizen when it exists", () => {
    const home = path.join(scratch.dir, "plaud");
    mkdirSync(path.join(home, "notizen"), { recursive: true });
    expect(locatePlaud({ plaudHome: home }, "/fixture")).toEqual({
      dir: path.join(home, "notizen"),
      source: "configured",
    });
  });
  it("falls back to the fixture when the home is missing", () => {
    const gone = path.join(scratch.dir, "gone");
    expect(locatePlaud({ plaudHome: gone }, "/fixture")).toEqual({
      dir: "/fixture",
      source: "sample",
      missing: gone,
    });
  });
  it("falls back to the fixture when nothing is configured", () => {
    expect(locatePlaud({}, "/fixture")).toEqual({
      dir: "/fixture",
      source: "sample",
    });
  });
});
