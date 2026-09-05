import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { locateProjects } from "../../src/projekte/locate.js";
import { scratchDir } from "./tmp.js";

const scratch = scratchDir("bench-locate-");
afterAll(scratch.cleanup);

describe("locateProjects", () => {
  it("keeps existing configured roots and names the missing ones", () => {
    const real = path.join(scratch.dir, "real");
    mkdirSync(real, { recursive: true });
    const missing = path.join(scratch.dir, "missing");
    const located = locateProjects(
      { projectRoots: [real, missing] },
      path.join(scratch.dir, "sample-a"),
    );
    expect(located).toEqual({
      roots: [real],
      source: "configured",
      missing: [missing],
    });
  });
  it("builds the sample when nothing is configured", () => {
    const sampleDir = path.join(scratch.dir, "sample-b");
    const located = locateProjects({ projectRoots: [] }, sampleDir);
    expect(located.source).toBe("sample");
    expect(located.roots).toEqual([sampleDir]);
    expect(located.missing).toEqual([]);
  });
});
