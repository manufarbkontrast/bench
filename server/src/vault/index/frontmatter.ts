import matter from "gray-matter";
import path from "node:path";

export interface SplitNote {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * YAML frontmatter and the markdown after it. A note without frontmatter is all body.
 *
 * gray-matter's YAML engine resolves a bare date like `2026-08-01` to a JS `Date`, not the
 * string the note author wrote - normalise it back to ISO so it round-trips through the
 * frontmatter JSON column unchanged instead of carrying a `Date` instance.
 *
 * An unclosed `---` fence or invalid YAML inside a closed one throws in gray-matter - both are
 * things a note mid-edit in Obsidian can genuinely be caught in, not a coding error, so the note
 * still gets indexed as pure body rather than dropping out of the vault entirely.
 */
export function splitNote(text: string): SplitNote {
  let parsed;
  try {
    parsed = matter(text);
  } catch {
    return { frontmatter: {}, body: text };
  }
  const frontmatter = Object.fromEntries(
    Object.entries(parsed.data as Record<string, unknown>).map(
      ([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ],
    ),
  );
  return { frontmatter, body: parsed.content };
}

/** Obsidian names a note after its file, not after any frontmatter. */
export function titleOf(relPath: string): string {
  return path.posix.basename(relPath, ".md");
}

/** `tags:` in frontmatter is a list, a single string, or absent - normalise to a list. */
function tagsList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw === undefined) return [];
  return [raw];
}

/** `tags:` as a list or a single string; a leading # is Obsidian's own optional prefix. */
export function tagsOf(frontmatter: Record<string, unknown>): string[] {
  return tagsList(frontmatter.tags)
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
}
