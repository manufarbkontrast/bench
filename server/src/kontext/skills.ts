import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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

function directoryNames(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((e) => e.name);
}

/**
 * The tolerant first-": " line scan aufgaben/plaud.ts and eingang/inbox.ts already carry: a
 * skill's own description can contain its own ": " (e.g. "Sammelt A: ein Beispiel"), which a YAML
 * parser rejects as an incomplete mapping. Scanning each line up to its first ": " matches the
 * source without any YAML semantics.
 */
function frontmatterField(text: string, key: string): string | null {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const closing = lines.indexOf("---", 1);
  if (closing === -1) return null;
  for (const line of lines.slice(1, closing)) {
    const sep = line.indexOf(": ");
    if (sep === -1) continue;
    if (line.slice(0, sep) === key) return line.slice(sep + 2).trim();
  }
  return null;
}

function readSkill(skillDir: string): Skill | null {
  let text: string;
  try {
    text = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  const name = frontmatterField(text, "name");
  const description = frontmatterField(text, "description");
  if (name === null || description === null) return null;
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
