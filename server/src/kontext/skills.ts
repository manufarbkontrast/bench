import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { scanFrontmatter } from "../shared/frontmatter.js";
import { directoryNames } from "./dirs.js";

interface Skill {
  name: string;
  description: string;
}

export interface SkillsResult {
  count: number;
  skills: Skill[];
}

interface CacheEntry extends SkillsResult {
  dirMtimeMs: number;
}

/**
 * One entry per claudeDir, keyed on the skills dir's own mtime. The real machine carries roughly
 * 500 skill folders, so re-reading and re-parsing every SKILL.md on every /skills request would
 * be wasteful when nothing changed since the last scan. This is the one sanctioned exception to
 * STANDARDS.md's immutability rule: a module-local mutable cache, documented here rather than
 * hidden, that a changed mtime replaces wholesale rather than patches in place.
 */
const cache = new Map<string, CacheEntry>();

function readSkill(skillDir: string): Skill | null {
  let text: string;
  try {
    text = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  const { fields } = scanFrontmatter(text);
  const name = fields.get("name");
  const description = fields.get("description");
  if (name === undefined || description === undefined) return null;
  return { name, description };
}

function scanSkills(skillsDir: string): SkillsResult {
  const folderNames = directoryNames(skillsDir);
  const skills = folderNames
    .map((name) => readSkill(path.join(skillsDir, name)))
    .filter((skill): skill is Skill => skill !== null);
  // The criterion: the counter equals the folder count, not the number of readable SKILL.md
  // files - a folder mid-setup with no SKILL.md yet still counts as a skill folder.
  return { count: folderNames.length, skills };
}

/**
 * Skill folders under `<claudeDir>/skills`, cached until the skills dir's own mtime changes.
 * Missing dir -> `{ count: 0, skills: [] }`, never a throw.
 */
export function listSkills(claudeDir: string): SkillsResult {
  const skillsDir = path.join(claudeDir, "skills");
  let dirMtimeMs: number;
  try {
    dirMtimeMs = statSync(skillsDir).mtimeMs;
  } catch {
    cache.delete(claudeDir);
    return { count: 0, skills: [] };
  }
  const cached = cache.get(claudeDir);
  if (cached?.dirMtimeMs === dirMtimeMs) {
    return { count: cached.count, skills: cached.skills };
  }
  const scanned = scanSkills(skillsDir);
  cache.set(claudeDir, { ...scanned, dirMtimeMs });
  return scanned;
}
