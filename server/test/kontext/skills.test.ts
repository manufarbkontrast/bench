import { cpSync, mkdirSync, utimesSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { listSkills } from "../../src/kontext/skills.js";
import { scratchDir } from "./tmp.js";

const FIXTURE_CLAUDE_DIR = fileURLToPath(
  new URL("../../src/kontext/fixture/claude", import.meta.url),
);

const scratch = scratchDir("bench-kontext-skills-");
afterAll(scratch.cleanup);

describe("listSkills", () => {
  it("finds both fixture skills, with the ': ' description intact", () => {
    const result = listSkills(FIXTURE_CLAUDE_DIR);

    expect(result.count).toBe(2);
    expect(result.skills).toEqual(
      expect.arrayContaining([
        {
          name: "leuchtturm-skill",
          description:
            "Ordnet eingehende Testdaten ein: eine erfundene Fertigkeit für Fixture-Zwecke",
        },
        {
          name: "hafen-skill",
          description: "Sammelt synthetische Ankunftsdaten für die Fixture",
        },
      ]),
    );
  });

  it("counts a folder without SKILL.md toward count but not toward skills", () => {
    const dir = path.join(scratch.dir, "third-folder");
    cpSync(FIXTURE_CLAUDE_DIR, dir, { recursive: true });
    mkdirSync(path.join(dir, "skills", "baustelle-skill"), {
      recursive: true,
    });

    const result = listSkills(dir);

    expect(result.count).toBe(3);
    expect(result.skills).toHaveLength(2);
  });

  it("returns count 0 and no skills when the skills dir does not exist", () => {
    const dir = path.join(scratch.dir, "no-skills-dir");
    mkdirSync(dir, { recursive: true });
    expect(listSkills(dir)).toEqual({ count: 0, skills: [] });
  });

  it("caches the scan until the skills dir's own mtime changes", () => {
    const dir = path.join(scratch.dir, "cache-check");
    cpSync(FIXTURE_CLAUDE_DIR, dir, { recursive: true });

    const first = listSkills(dir);
    const second = listSkills(dir);
    expect(second.skills).toBe(first.skills);
    expect(second.count).toBe(2);

    mkdirSync(path.join(dir, "skills", "neuer-ordner"), { recursive: true });
    const future = Math.round(Date.now() / 1000) + 60;
    utimesSync(path.join(dir, "skills"), future, future);

    const third = listSkills(dir);
    expect(third.count).toBe(3);
    expect(third.skills).not.toBe(first.skills);
  });
});
